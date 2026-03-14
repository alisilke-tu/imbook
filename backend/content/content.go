package content

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"encore.app/backend/db"
	"encore.app/backend/settings"
	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/rlog"
	"encore.dev/storage/sqldb"
	"github.com/google/uuid"
	"github.com/tmc/langchaingo/llms/openai"
)

const embeddingDim = 768

const openRouterBaseURL = "https://openrouter.ai/api/v1"
const openRouterEmbeddingModel = "openai/text-embedding-3-small"

// contentDB stores chapters, content blocks, paragraphs, and references.
var contentDB = sqldb.NewDatabase("content", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// ImportResponse is returned after a successful XML import.
type ImportResponse struct {
	Chapters       int `json:"chapters"`
	ContentBlocks  int `json:"content_blocks"`
	Paragraphs     int `json:"paragraphs"`
	References     int `json:"references"`
}

// Import receives an XML file via multipart form (field "file"), converts it to chapters/content_blocks/paragraphs/references, and replaces existing data. Requires authentication.
//
//encore:api auth raw method=POST path=/content/import
func Import(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()
	start := time.Now()
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := req.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, errs.InvalidArgument, "invalid multipart form")
		return
	}
	file, _, err := req.FormFile("file")
	if err != nil {
		writeErr(w, errs.InvalidArgument, "missing or invalid file field")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		writeErr(w, errs.InvalidArgument, "failed to read file")
		return
	}
	if len(data) == 0 {
		writeErr(w, errs.InvalidArgument, "empty file")
		return
	}
	result, err := db.BuildChapterDraftsFromBytes(data)
	if err != nil {
		rlog.Error("xml parse failed", "err", err)
		writeErr(w, errs.InvalidArgument, "invalid XML or unsupported format")
		return
	}
	resp, err := persistReplaceAll(ctx, result)
	if err != nil {
		rlog.Error("persist failed", "err", err)
		writeErr(w, errs.Internal, "failed to save to database")
		return
	}
	rlog.Info("content import completed", "chapters", resp.Chapters, "blocks", resp.ContentBlocks, "paragraphs", resp.Paragraphs, "references", resp.References, "duration_ms", time.Since(start).Milliseconds())
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// ListResponse returns flat table-like lists for chapters, content_blocks, paragraphs, references.
type ListResponse struct {
	Chapters      []ChapterRow      `json:"chapters"`
	ContentBlocks []ContentBlockRow `json:"content_blocks"`
	Paragraphs    []ParagraphRow    `json:"paragraphs"`
	References    []ReferenceRow    `json:"references"`
}

type ChapterRow struct {
	ID              string  `json:"id"`
	ChapterNumber   string  `json:"chapter_number"`
	Title           string  `json:"title"`
	ParentChapterID *string `json:"parent_chapter_id"`
	SortOrder       int     `json:"sort_order"`
	StartPage       int     `json:"start_page"`
	EndPage         int     `json:"end_page"`
}

type ContentBlockRow struct {
	ID         string  `json:"id"`
	ChapterID  string  `json:"chapter_id"`
	BlockType  string  `json:"block_type"`
	PageNumber int     `json:"page_number"`
	SortOrder  int     `json:"sort_order"`
}

type ParagraphRow struct {
	ID              string `json:"id"`
	ContentBlockID  string `json:"content_block_id"`
	Content         string `json:"content"`
}

type ReferenceRow struct {
	ID               string  `json:"id"`
	OriginBlockID     string  `json:"origin_block_id"`
	TargetType       string  `json:"target_type"`
	TargetChapterID  *string `json:"target_chapter_id"`
	TargetBlockID    *string `json:"target_block_id"`
}

// EmbedChunkParams are the parameters for embedding a single chunk.
type EmbedChunkParams struct {
	ParagraphID string `json:"paragraph_id"`
	ChunkIndex  int    `json:"chunk_index"`
	Content     string `json:"content"`
}

// EmbedChunkResponse is returned after successfully embedding a chunk.
type EmbedChunkResponse struct {
	ID string `json:"id"`
}

// EmbedChunk computes an embedding for the given chunk text using the user's OpenRouter API key and inserts it into the chunks table. Requires authentication.
//
//encore:api auth method=POST path=/content/embed-chunk
func EmbedChunk(ctx context.Context, params *EmbedChunkParams) (*EmbedChunkResponse, error) {
	if params == nil || params.ParagraphID == "" || params.Content == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "paragraph_id and content are required"}
	}
	if _, err := uuid.Parse(params.ParagraphID); err != nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "invalid paragraph_id"}
	}

	uid, _ := auth.UserID()
	resp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{UserID: string(uid)})
	if err != nil {
		if errs.Code(err) == errs.NotFound {
			return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "Set your OpenRouter API key in Settings."}
		}
		return nil, err
	}
	llm, err := openai.New(
		openai.WithBaseURL(openRouterBaseURL),
		openai.WithToken(resp.Key),
		openai.WithEmbeddingModel(openRouterEmbeddingModel),
		openai.WithEmbeddingDimensions(embeddingDim),
	)
	if err != nil {
		rlog.Error("failed to create embedding client", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create embedding client"}
	}

	embeddings, err := llm.CreateEmbedding(ctx, []string{params.Content})
	if err != nil {
		rlog.Error("embedding failed", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "embedding failed"}
	}
	if len(embeddings) == 0 || len(embeddings[0]) == 0 {
		return nil, &errs.Error{Code: errs.Internal, Message: "empty embedding returned"}
	}

	vec := embeddings[0]
	if len(vec) > embeddingDim {
		vec = vec[:embeddingDim]
	} else if len(vec) < embeddingDim {
		return nil, &errs.Error{Code: errs.Internal, Message: fmt.Sprintf("embedding dimension %d smaller than expected %d", len(vec), embeddingDim)}
	}

	vecStr := embeddingToString(vec)
	id := uuid.New().String()
	err = contentDB.QueryRow(ctx, `
		INSERT INTO chunks (id, paragraph_id, chunk_index, content, embedding)
		VALUES ($1, $2, $3, $4, $5::vector)
		ON CONFLICT (paragraph_id, chunk_index) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
		RETURNING id
	`, id, params.ParagraphID, params.ChunkIndex, params.Content, vecStr).Scan(&id)
	if err != nil {
		rlog.Error("failed to insert chunk", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to save chunk"}
	}
	return &EmbedChunkResponse{ID: id}, nil
}

func embeddingToString(vec []float32) string {
	parts := make([]string, len(vec))
	for i, v := range vec {
		parts[i] = strconv.FormatFloat(float64(v), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// ChunkRow is a single chunk row for list/search responses.
type ChunkRow struct {
	ID          string `json:"id"`
	ParagraphID string `json:"paragraph_id"`
	ChunkIndex  int    `json:"chunk_index"`
	Content     string `json:"content"`
}

// ListChunksResponse is returned by ListChunks.
type ListChunksResponse struct {
	Chunks []ChunkRow `json:"chunks"`
}

// ListChunks returns all embedded chunks. Requires authentication.
//
//encore:api auth method=GET path=/content/chunks
func ListChunks(ctx context.Context) (*ListChunksResponse, error) {
	rows, err := contentDB.Query(ctx, `
		SELECT id, paragraph_id, chunk_index, content FROM chunks ORDER BY paragraph_id, chunk_index
	`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch chunks"}
	}
	defer rows.Close()
	var chunks []ChunkRow
	for rows.Next() {
		var r ChunkRow
		if err := rows.Scan(&r.ID, &r.ParagraphID, &r.ChunkIndex, &r.Content); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chunk"}
		}
		chunks = append(chunks, r)
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating chunks"}
	}
	return &ListChunksResponse{Chunks: chunks}, nil
}

// SearchChunksParams are the parameters for the private SearchChunks API.
type SearchChunksParams struct {
	UserID string `json:"user_id"`
	Query  string `json:"query"`
}

// SearchChunksResponse is returned by SearchChunks.
type SearchChunksResponse struct {
	Chunks []ChunkRow `json:"chunks"`
}

// SearchChunks runs a vector similarity search over embedded chunks. Private; used by the chat service.
//
//encore:api private
func SearchChunks(ctx context.Context, params *SearchChunksParams) (*SearchChunksResponse, error) {
	if params == nil || params.UserID == "" || params.Query == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "user_id and query are required"}
	}
	resp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{UserID: params.UserID})
	if err != nil {
		return nil, err
	}
	llm, err := openai.New(
		openai.WithBaseURL(openRouterBaseURL),
		openai.WithToken(resp.Key),
		openai.WithEmbeddingModel(openRouterEmbeddingModel),
		openai.WithEmbeddingDimensions(embeddingDim),
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create embedding client"}
	}
	embeddings, err := llm.CreateEmbedding(ctx, []string{params.Query})
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "embedding failed"}
	}
	if len(embeddings) == 0 || len(embeddings[0]) == 0 {
		return &SearchChunksResponse{Chunks: []ChunkRow{}}, nil
	}
	vec := embeddings[0]
	if len(vec) > embeddingDim {
		vec = vec[:embeddingDim]
	} else if len(vec) < embeddingDim {
		return nil, &errs.Error{Code: errs.Internal, Message: "embedding dimension mismatch"}
	}
	vecStr := embeddingToString(vec)
	rows, err := contentDB.Query(ctx, `
		SELECT id, paragraph_id, chunk_index, content
		FROM chunks
		ORDER BY embedding <=> $1::vector
		LIMIT 10
	`, vecStr)
	if err != nil {
		rlog.Error("vector search failed", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "search failed"}
	}
	defer rows.Close()
	var chunks []ChunkRow
	for rows.Next() {
		var r ChunkRow
		if err := rows.Scan(&r.ID, &r.ParagraphID, &r.ChunkIndex, &r.Content); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chunk"}
		}
		chunks = append(chunks, r)
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating results"}
	}
	return &SearchChunksResponse{Chunks: chunks}, nil
}

// List returns all chapters, content blocks, paragraphs, and references in deterministic order. Requires authentication.
//
//encore:api auth method=GET path=/content
func List(ctx context.Context) (*ListResponse, error) {
	out := &ListResponse{}
	rows, err := contentDB.Query(ctx, `
		SELECT id, chapter_number, title, parent_chapter_id, sort_order, start_page, end_page
		FROM chapters ORDER BY sort_order, start_page, id
	`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch chapters"}
	}
	for rows.Next() {
		var r ChapterRow
		var parentID *string
		if err := rows.Scan(&r.ID, &r.ChapterNumber, &r.Title, &parentID, &r.SortOrder, &r.StartPage, &r.EndPage); err != nil {
			rows.Close()
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chapter"}
		}
		r.ParentChapterID = parentID
		out.Chapters = append(out.Chapters, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating chapters"}
	}
	rows.Close()

	rows, err = contentDB.Query(ctx, `
		SELECT id, chapter_id, block_type, page_number, sort_order
		FROM content_blocks ORDER BY chapter_id, sort_order, id
	`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch content_blocks"}
	}
	for rows.Next() {
		var r ContentBlockRow
		if err := rows.Scan(&r.ID, &r.ChapterID, &r.BlockType, &r.PageNumber, &r.SortOrder); err != nil {
			rows.Close()
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan content_block"}
		}
		out.ContentBlocks = append(out.ContentBlocks, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating content_blocks"}
	}
	rows.Close()

	rows, err = contentDB.Query(ctx, `
		SELECT id, content_block_id, content FROM paragraphs ORDER BY content_block_id, id
	`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch paragraphs"}
	}
	for rows.Next() {
		var r ParagraphRow
		if err := rows.Scan(&r.ID, &r.ContentBlockID, &r.Content); err != nil {
			rows.Close()
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan paragraph"}
		}
		out.Paragraphs = append(out.Paragraphs, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating paragraphs"}
	}
	rows.Close()

	rows, err = contentDB.Query(ctx, `
		SELECT id, origin_block_id, target_type, target_chapter_id, target_block_id
		FROM "references" ORDER BY origin_block_id, id
	`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch references"}
	}
	for rows.Next() {
		var r ReferenceRow
		if err := rows.Scan(&r.ID, &r.OriginBlockID, &r.TargetType, &r.TargetChapterID, &r.TargetBlockID); err != nil {
			rows.Close()
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan reference"}
		}
		out.References = append(out.References, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating references"}
	}
	rows.Close()
	return out, nil
}

func writeErr(w http.ResponseWriter, code errs.ErrCode, msg string) {
	w.Header().Set("Content-Type", "application/json")
	status := http.StatusInternalServerError
	if code == errs.InvalidArgument {
		status = http.StatusBadRequest
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": msg})
}

// persistReplaceAll deletes existing content and inserts the new dataset in one transaction.
func persistReplaceAll(ctx context.Context, result *db.ChapterParseResult) (*ImportResponse, error) {
	tx, err := contentDB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	_, _ = tx.Exec(ctx, `DELETE FROM "references"`)
	_, _ = tx.Exec(ctx, `DELETE FROM paragraphs`)
	_, _ = tx.Exec(ctx, `DELETE FROM content_blocks`)
	_, _ = tx.Exec(ctx, `DELETE FROM chapters`)

	keyToChapterID := make(map[string]string)
	for _, ch := range result.Chapters {
		id := uuid.New().String()
		var parentID *string
		if ch.ParentKey != "" {
			if pid, ok := keyToChapterID[ch.ParentKey]; ok {
				parentID = &pid
			}
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO chapters (id, chapter_number, title, parent_chapter_id, sort_order, start_page, end_page)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, id, ch.ChapterNumber, ch.Title, parentID, ch.SortOrder, ch.StartPage, ch.EndPage)
		if err != nil {
			return nil, err
		}
		keyToChapterID[ch.Key] = id
	}

	keyToBlockID := make(map[string]string)
	for _, ch := range result.Chapters {
		chapterID := keyToChapterID[ch.Key]
		blockID := uuid.New().String()
		_, err := tx.Exec(ctx, `
			INSERT INTO content_blocks (id, chapter_id, block_type, page_number, sort_order)
			VALUES ($1, $2, 'paragraph', $3, 0)
		`, blockID, chapterID, ch.StartPage)
		if err != nil {
			return nil, err
		}
		keyToBlockID[ch.Key] = blockID
		_, err = tx.Exec(ctx, `INSERT INTO paragraphs (id, content_block_id, content) VALUES ($1, $2, $3)`,
			uuid.New().String(), blockID, ch.Content)
		if err != nil {
			return nil, err
		}
	}

	for _, ref := range result.References {
		originBlockID, ok := keyToBlockID[ref.FromChapterKey]
		if !ok {
			continue
		}
		var targetChapterID *string
		if ref.TargetKey != "" {
			if tid, ok := keyToChapterID[ref.TargetKey]; ok {
				targetChapterID = &tid
			}
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO "references" (id, origin_block_id, target_type, target_chapter_id, target_block_id)
			VALUES ($1, $2, 'chapter', $3, NULL)
		`, uuid.New().String(), originBlockID, targetChapterID)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &ImportResponse{
		Chapters:      len(result.Chapters),
		ContentBlocks: len(result.Chapters),
		Paragraphs:   len(result.Chapters),
		References:   len(result.References),
	}, nil
}
