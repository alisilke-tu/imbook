package content

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	a "encore.app/backend/auth"
	"encore.app/backend/db"
	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/rlog"
	"github.com/google/uuid"
)

// DatasetRow represents a single embedding dataset
type DatasetRow struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Version       int        `json:"version"`
	Description   string     `json:"description"`
	ChunkSize     int        `json:"chunk_size"`
	EmbeddingModel string    `json:"embedding_model"`
	EmbeddingDim  int        `json:"embedding_dim"`
	Status        string     `json:"status"`
	CreatedBy     string     `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	ErrorMessage  *string    `json:"error_message,omitempty"`
	TotalChunks   int        `json:"total_chunks"`
}

// CreateDatasetParams contains parameters for creating a new dataset
type CreateDatasetParams struct {
	Name           string `json:"name"`
	Version        int    `json:"version"`
	Description    string `json:"description"`
	ChunkSize      int    `json:"chunk_size"`
	EmbeddingModel string `json:"embedding_model"`
}

// DatasetResponse is returned after creating a dataset
type DatasetResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// ListDatasetsParams contains optional filters for listing datasets
// Empty string means no filter (Encore query params do not support *string).
type ListDatasetsParams struct {
	Status string `query:"status"`
	Name   string `query:"name"`
}

// ListDatasetsResponse returns a list of datasets
type ListDatasetsResponse struct {
	Datasets []DatasetRow `json:"datasets"`
}

// ChapterInfo represents chapter metadata for a dataset
type ChapterInfo struct {
	ID            string `json:"id"`
	ChapterNumber string `json:"chapter_number"`
	Title         string `json:"title"`
	SortOrder     int    `json:"sort_order"`
	StartPage     int    `json:"start_page"`
	EndPage       int    `json:"end_page"`
	ContentLength int    `json:"content_length"`
}

// DatasetDetailResponse returns detailed information about a dataset
type DatasetDetailResponse struct {
	Dataset  DatasetRow    `json:"dataset"`
	Chapters []ChapterInfo `json:"chapters"`
	Chunks   []ChunkRow    `json:"chunks"`
}

// CreateDataset creates a new embedding dataset from uploaded XML
//
//encore:api auth raw method=POST path=/content/datasets
func CreateDataset(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()
	
	userData := auth.Data().(*a.UserData)
	if !userData.IsAdmin {
		writeErr(w, errs.PermissionDenied, "admin access required")
		return
	}

	if err := req.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, errs.InvalidArgument, "invalid multipart form")
		return
	}

	name := req.FormValue("name")
	version := req.FormValue("version")
	description := req.FormValue("description")
	chunkSize := req.FormValue("chunk_size")
	embeddingModel := req.FormValue("embedding_model")

	if name == "" {
		writeErr(w, errs.InvalidArgument, "name is required")
		return
	}
	if version == "" {
		version = "1"
	}
	if chunkSize == "" {
		chunkSize = "500"
	}
	if embeddingModel == "" {
		embeddingModel = "openrouter-text-embedding-3-small"
	}

	// Validate embedding model
	modelSpec, err := GetModelSpec(embeddingModel)
	if err != nil {
		writeErr(w, errs.InvalidArgument, "invalid embedding model: "+embeddingModel)
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

	// Parse XML
	result, err := db.BuildChapterDraftsFromBytes(data)
	if err != nil {
		rlog.Error("xml parse failed", "err", err)
		writeErr(w, errs.InvalidArgument, "invalid XML or unsupported format")
		return
	}

	// Parse version and chunk size
	var versionInt int
	if _, err := fmt.Sscanf(version, "%d", &versionInt); err != nil {
		writeErr(w, errs.InvalidArgument, "invalid version number")
		return
	}
	var chunkSizeInt int
	if _, err := fmt.Sscanf(chunkSize, "%d", &chunkSizeInt); err != nil {
		writeErr(w, errs.InvalidArgument, "invalid chunk size")
		return
	}
	if chunkSizeInt <= 0 {
		writeErr(w, errs.InvalidArgument, "chunk size must be positive")
		return
	}

	// Create dataset record
	datasetID := uuid.New().String()
	uid, _ := auth.UserID()
	userID := string(uid)

	err = contentDB.QueryRow(ctx, `
		INSERT INTO embedding_datasets (id, name, version, description, chunk_size, embedding_model, embedding_dim, status, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8)
		RETURNING id
	`, datasetID, name, versionInt, description, chunkSizeInt, embeddingModel, modelSpec.Dimensions, userID).Scan(&datasetID)
	
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			writeErr(w, errs.AlreadyExists, "dataset with this name and version already exists")
			return
		}
		rlog.Error("failed to create dataset", "err", err)
		writeErr(w, errs.Internal, "failed to create dataset")
		return
	}

	// Start async embedding job
	go func() {
		jobCtx := context.Background()
		if err := ProcessDatasetEmbeddings(jobCtx, datasetID, userID, result, chunkSizeInt, modelSpec); err != nil {
			rlog.Error("embedding job failed", "dataset_id", datasetID, "err", err)
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(&DatasetResponse{
		ID:     datasetID,
		Status: "processing",
	})
}

// ListDatasets returns all datasets with optional filtering
//
//encore:api auth method=GET path=/content/datasets
func ListDatasets(ctx context.Context, params *ListDatasetsParams) (*ListDatasetsResponse, error) {
	userData := auth.Data().(*a.UserData)
	
	query := `
		SELECT id, name, version, description, chunk_size, embedding_model, embedding_dim, 
		       status, created_by, created_at, completed_at, error_message, total_chunks
		FROM embedding_datasets
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	// Non-admin users can only see ready datasets
	if !userData.IsAdmin {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, "ready")
		argIdx++
	}

	// Apply filters
	if params.Status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, params.Status)
		argIdx++
	}
	if params.Name != "" {
		query += fmt.Sprintf(" AND name = $%d", argIdx)
		args = append(args, params.Name)
		argIdx++
	}

	query += " ORDER BY created_at DESC"

	rows, err := contentDB.Query(ctx, query, args...)
	if err != nil {
		rlog.Error("failed to list datasets", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to list datasets"}
	}
	defer rows.Close()

	var datasets []DatasetRow
	for rows.Next() {
		var d DatasetRow
		if err := rows.Scan(&d.ID, &d.Name, &d.Version, &d.Description, &d.ChunkSize, 
			&d.EmbeddingModel, &d.EmbeddingDim, &d.Status, &d.CreatedBy, &d.CreatedAt, 
			&d.CompletedAt, &d.ErrorMessage, &d.TotalChunks); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan dataset"}
		}
		datasets = append(datasets, d)
	}

	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating datasets"}
	}

	return &ListDatasetsResponse{Datasets: datasets}, nil
}

// GetDataset returns detailed information about a specific dataset
//
//encore:api auth method=GET path=/content/datasets/:id
func GetDataset(ctx context.Context, id string) (*DatasetDetailResponse, error) {
	userData := auth.Data().(*a.UserData)
	
	var dataset DatasetRow
	err := contentDB.QueryRow(ctx, `
		SELECT id, name, version, description, chunk_size, embedding_model, embedding_dim,
		       status, created_by, created_at, completed_at, error_message, total_chunks
		FROM embedding_datasets
		WHERE id = $1
	`, id).Scan(&dataset.ID, &dataset.Name, &dataset.Version, &dataset.Description, 
		&dataset.ChunkSize, &dataset.EmbeddingModel, &dataset.EmbeddingDim, &dataset.Status, 
		&dataset.CreatedBy, &dataset.CreatedAt, &dataset.CompletedAt, &dataset.ErrorMessage, 
		&dataset.TotalChunks)
	
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, &errs.Error{Code: errs.NotFound, Message: "dataset not found"}
		}
		rlog.Error("failed to get dataset", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to get dataset"}
	}

	// Non-admin users can only view ready datasets
	if !userData.IsAdmin && dataset.Status != "ready" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "access denied"}
	}

	// Get chapters for this dataset
	chapterRows, err := contentDB.Query(ctx, `
		SELECT c.id, c.chapter_number, c.title, c.sort_order, c.start_page, c.end_page,
		       LENGTH(COALESCE(p.content, '')) as content_length
		FROM chapters c
		LEFT JOIN content_blocks cb ON cb.chapter_id = c.id
		LEFT JOIN paragraphs p ON p.content_block_id = cb.id
		WHERE c.dataset_id = $1
		ORDER BY c.sort_order
	`, id)
	if err != nil {
		rlog.Error("failed to get chapters", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to get chapters"}
	}
	defer chapterRows.Close()

	var chapters []ChapterInfo
	for chapterRows.Next() {
		var ch ChapterInfo
		if err := chapterRows.Scan(&ch.ID, &ch.ChapterNumber, &ch.Title, &ch.SortOrder, 
			&ch.StartPage, &ch.EndPage, &ch.ContentLength); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chapter"}
		}
		chapters = append(chapters, ch)
	}

	// Get chunks for this dataset (limited to first 100)
	chunkRows, err := contentDB.Query(ctx, `
		SELECT id, paragraph_id, chunk_index, content
		FROM chunks
		WHERE dataset_id = $1
		ORDER BY paragraph_id, chunk_index
		LIMIT 100
	`, id)
	if err != nil {
		rlog.Error("failed to get chunks", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to get chunks"}
	}
	defer chunkRows.Close()

	var chunks []ChunkRow
	for chunkRows.Next() {
		var c ChunkRow
		if err := chunkRows.Scan(&c.ID, &c.ParagraphID, &c.ChunkIndex, &c.Content); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chunk"}
		}
		chunks = append(chunks, c)
	}

	return &DatasetDetailResponse{
		Dataset:  dataset,
		Chapters: chapters,
		Chunks:   chunks,
	}, nil
}

// GetDatasetStructure returns flat chapter/block/paragraph/reference lists for one dataset
// (same JSON shape as GET /content) so the admin UI can render the reference dependency graph.
//
//encore:api auth method=GET path=/content/datasets/:id/structure
func GetDatasetStructure(ctx context.Context, id string) (*ListResponse, error) {
	userData := auth.Data().(*a.UserData)

	var dataset DatasetRow
	err := contentDB.QueryRow(ctx, `
		SELECT id, name, version, description, chunk_size, embedding_model, embedding_dim,
		       status, created_by, created_at, completed_at, error_message, total_chunks
		FROM embedding_datasets
		WHERE id = $1
	`, id).Scan(&dataset.ID, &dataset.Name, &dataset.Version, &dataset.Description,
		&dataset.ChunkSize, &dataset.EmbeddingModel, &dataset.EmbeddingDim, &dataset.Status,
		&dataset.CreatedBy, &dataset.CreatedAt, &dataset.CompletedAt, &dataset.ErrorMessage,
		&dataset.TotalChunks)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, &errs.Error{Code: errs.NotFound, Message: "dataset not found"}
		}
		rlog.Error("failed to get dataset", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to get dataset"}
	}

	if !userData.IsAdmin && dataset.Status != "ready" {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "access denied"}
	}

	out := &ListResponse{}

	rows, err := contentDB.Query(ctx, `
		SELECT id, chapter_number, title, parent_chapter_id, sort_order, start_page, end_page
		FROM chapters
		WHERE dataset_id = $1
		ORDER BY sort_order, start_page, id
	`, id)
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
		SELECT cb.id, cb.chapter_id, cb.block_type, cb.page_number, cb.sort_order
		FROM content_blocks cb
		INNER JOIN chapters c ON c.id = cb.chapter_id
		WHERE c.dataset_id = $1
		ORDER BY cb.chapter_id, cb.sort_order, cb.id
	`, id)
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
		SELECT p.id, p.content_block_id, p.content
		FROM paragraphs p
		INNER JOIN content_blocks cb ON cb.id = p.content_block_id
		INNER JOIN chapters c ON c.id = cb.chapter_id
		WHERE c.dataset_id = $1
		ORDER BY p.content_block_id, p.id
	`, id)
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
		SELECT r.id, r.origin_block_id, r.target_type, r.target_chapter_id, r.target_block_id
		FROM "references" r
		INNER JOIN content_blocks cb ON cb.id = r.origin_block_id
		INNER JOIN chapters c ON c.id = cb.chapter_id
		WHERE c.dataset_id = $1
		  AND (r.target_chapter_id IS NULL OR r.target_chapter_id IN (
		    SELECT id FROM chapters WHERE dataset_id = $2
		  ))
		ORDER BY r.origin_block_id, r.id
	`, id, id)
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

// DeleteDataset deletes a dataset and all its chunks
//
//encore:api auth method=DELETE path=/content/datasets/:id
func DeleteDataset(ctx context.Context, id string) error {
	userData := auth.Data().(*a.UserData)
	if !userData.IsAdmin {
		return &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	result, err := contentDB.Exec(ctx, `
		DELETE FROM embedding_datasets WHERE id = $1
	`, id)
	if err != nil {
		rlog.Error("failed to delete dataset", "err", err)
		return &errs.Error{Code: errs.Internal, Message: "failed to delete dataset"}
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return &errs.Error{Code: errs.NotFound, Message: "dataset not found"}
	}

	return nil
}
