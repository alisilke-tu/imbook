package content

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"encore.app/backend/db"
	"encore.app/backend/settings"
	"encore.dev/rlog"
	"github.com/google/uuid"
	"github.com/tmc/langchaingo/llms/openai"
)

// chunkInsertAttempts is initial insert plus retries (at least 3 retries after the first failure).
const chunkInsertAttempts = 4

// ProcessDatasetEmbeddings processes all chunks for a dataset and embeds them
func ProcessDatasetEmbeddings(ctx context.Context, datasetID string, userID string, result *db.ChapterParseResult, chunkSize int, modelSpec *EmbeddingModelSpec) error {
	startTime := time.Now()
	
	rlog.Info("starting embedding job", "dataset_id", datasetID, "chunk_size", chunkSize)

	// Get user's API key
	resp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{
		UserID: userID,
	})
	if err != nil {
		return updateDatasetStatus(ctx, datasetID, "failed", "Failed to get API key: "+err.Error(), 0)
	}

	// Create embedding client
	llm, err := openai.New(
		openai.WithBaseURL(modelSpec.BaseURL),
		openai.WithToken(resp.Key),
		openai.WithEmbeddingModel(modelSpec.ModelPath),
		openai.WithEmbeddingDimensions(modelSpec.Dimensions),
	)
	if err != nil {
		return updateDatasetStatus(ctx, datasetID, "failed", "Failed to create embedding client", 0)
	}

	// First, persist the chapter structure for this dataset
	chapterParagraphMap, err := persistDatasetChapters(ctx, datasetID, result)
	if err != nil {
		rlog.Error("failed to persist chapters", "dataset_id", datasetID, "err", err)
		return updateDatasetStatus(ctx, datasetID, "failed", "Failed to persist chapter structure: "+err.Error(), 0)
	}

	// Collect all chunks to embed
	type ChunkToEmbed struct {
		ParagraphID string
		ChunkIndex  int
		Content     string
	}
	
	var chunksToEmbed []ChunkToEmbed
	
	// One paragraph_id per chapter; chapter body lives in ChapterDraft.Content
	for _, chapter := range result.Chapters {
		content := strings.TrimSpace(chapter.Content)
		if content == "" {
			continue
		}

		// Use the persisted paragraph ID
		paragraphID, ok := chapterParagraphMap[chapter.ChapterNumber]
		if !ok {
			rlog.Warn("paragraph ID not found for chapter", "chapter", chapter.ChapterNumber)
			continue
		}

		// Split into fixed-size chunks
		chunks := fixedSizeChunks(content, chunkSize)
		for idx, chunkContent := range chunks {
			chunksToEmbed = append(chunksToEmbed, ChunkToEmbed{
				ParagraphID: paragraphID,
				ChunkIndex:  idx,
				Content:     chunkContent,
			})
		}
	}

	if len(chunksToEmbed) == 0 {
		return updateDatasetStatus(ctx, datasetID, "failed", "No chunks to embed", 0)
	}

	rlog.Info("embedding chunks", "dataset_id", datasetID, "total_chunks", len(chunksToEmbed))

	// Embed and store each chunk
	successCount := 0
	skippedInserts := 0
	for i, chunk := range chunksToEmbed {
		// Embed the chunk
		embeddings, err := llm.CreateEmbedding(ctx, []string{chunk.Content})
		if err != nil {
			rlog.Error("embedding failed", "dataset_id", datasetID, "chunk_index", i, "err", err)
			return updateDatasetStatus(ctx, datasetID, "failed", fmt.Sprintf("Embedding failed at chunk %d: %v", i, err), successCount)
		}

		if len(embeddings) == 0 || len(embeddings[0]) == 0 {
			return updateDatasetStatus(ctx, datasetID, "failed", fmt.Sprintf("Empty embedding at chunk %d", i), successCount)
		}

		vec := embeddings[0]
		if len(vec) > modelSpec.Dimensions {
			vec = vec[:modelSpec.Dimensions]
		} else if len(vec) < modelSpec.Dimensions {
			return updateDatasetStatus(ctx, datasetID, "failed", fmt.Sprintf("Embedding dimension mismatch at chunk %d", i), successCount)
		}

		vecStr := embeddingToString(vec)
		chunkID := uuid.New().String()

		var insertErr error
		for attempt := 1; attempt <= chunkInsertAttempts; attempt++ {
			if attempt > 1 {
				time.Sleep(time.Duration(attempt-1) * 75 * time.Millisecond)
			}
			insertErr = contentDB.QueryRow(ctx, `
				INSERT INTO chunks (id, paragraph_id, chunk_index, content, embedding, dataset_id)
				VALUES ($1, $2, $3, $4, $5::vector, $6)
				RETURNING id
			`, chunkID, chunk.ParagraphID, chunk.ChunkIndex, chunk.Content, vecStr, datasetID).Scan(&chunkID)
			if insertErr == nil {
				break
			}
			rlog.Warn("chunk insert attempt failed", "dataset_id", datasetID, "chunk_index", i, "attempt", attempt, "max", chunkInsertAttempts, "err", insertErr)
		}
		if insertErr != nil {
			rlog.Error("skipping chunk after failed inserts", "dataset_id", datasetID, "chunk_index", i, "err", insertErr)
			skippedInserts++
			continue
		}

		successCount++

		// Log progress every 10 chunks
		if (i+1)%10 == 0 {
			rlog.Info("embedding progress", "dataset_id", datasetID, "completed", i+1, "total", len(chunksToEmbed))
		}
	}

	if successCount == 0 {
		msg := "No chunks could be stored"
		if skippedInserts > 0 {
			msg = fmt.Sprintf("All %d chunk inserts failed after %d attempts each", skippedInserts, chunkInsertAttempts)
		}
		return updateDatasetStatus(ctx, datasetID, "failed", msg, 0)
	}

	duration := time.Since(startTime)
	rlog.Info("embedding job completed", "dataset_id", datasetID, "chunks", successCount, "skipped_inserts", skippedInserts, "duration_ms", duration.Milliseconds())
	return updateDatasetStatus(ctx, datasetID, "ready", "", successCount)
}

// updateDatasetStatus updates the status of a dataset
func updateDatasetStatus(ctx context.Context, datasetID string, status string, errorMessage string, totalChunks int) error {
	var errMsg *string
	if errorMessage != "" {
		errMsg = &errorMessage
	}

	completedAt := time.Now()
	_, err := contentDB.Exec(ctx, `
		UPDATE embedding_datasets
		SET status = $1, error_message = $2, total_chunks = $3, completed_at = $4
		WHERE id = $5
	`, status, errMsg, totalChunks, completedAt, datasetID)
	
	if err != nil {
		rlog.Error("failed to update dataset status", "dataset_id", datasetID, "err", err)
		return err
	}

	return nil
}

// fixedSizeChunks splits text into fixed-size chunks
func fixedSizeChunks(text string, size int) []string {
	if size <= 0 {
		return []string{text}
	}
	
	var chunks []string
	for i := 0; i < len(text); i += size {
		end := i + size
		if end > len(text) {
			end = len(text)
		}
		chunks = append(chunks, text[i:end])
	}
	
	if len(chunks) == 0 {
		return []string{""}
	}
	
	return chunks
}

// embeddingToString converts a float32 slice to a PostgreSQL vector string
func embeddingToStringForDataset(vec []float32) string {
	parts := make([]string, len(vec))
	for i, v := range vec {
		parts[i] = strconv.FormatFloat(float64(v), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// persistDatasetChapters persists the chapter/paragraph structure for a dataset
// Returns a map of chapter_number -> paragraph_id
func persistDatasetChapters(ctx context.Context, datasetID string, result *db.ChapterParseResult) (map[string]string, error) {
	chapterParagraphMap := make(map[string]string)
	keyToChapterID := make(map[string]string)
	keyToBlockID := make(map[string]string)

	for i, chapter := range result.Chapters {
		content := strings.TrimSpace(chapter.Content)
		if content == "" {
			continue
		}

		// Create chapter record
		chapterID := uuid.New().String()
		_, err := contentDB.Exec(ctx, `
			INSERT INTO chapters (id, chapter_number, title, sort_order, start_page, end_page, dataset_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, chapterID, chapter.ChapterNumber, chapter.Title, i, chapter.StartPage, chapter.EndPage, datasetID)
		
		if err != nil {
			return nil, fmt.Errorf("failed to insert chapter %s: %w", chapter.ChapterNumber, err)
		}

		// Create content block for the chapter
		blockID := uuid.New().String()
		_, err = contentDB.Exec(ctx, `
			INSERT INTO content_blocks (id, chapter_id, block_type, page_number, sort_order)
			VALUES ($1, $2, 'paragraph', $3, 0)
		`, blockID, chapterID, chapter.StartPage)
		
		if err != nil {
			return nil, fmt.Errorf("failed to insert content block for chapter %s: %w", chapter.ChapterNumber, err)
		}

		// Create paragraph record
		paragraphID := uuid.New().String()
		_, err = contentDB.Exec(ctx, `
			INSERT INTO paragraphs (id, content_block_id, content)
			VALUES ($1, $2, $3)
		`, paragraphID, blockID, content)
		
		if err != nil {
			return nil, fmt.Errorf("failed to insert paragraph for chapter %s: %w", chapter.ChapterNumber, err)
		}

		chapterParagraphMap[chapter.ChapterNumber] = paragraphID
		keyToChapterID[chapter.Key] = chapterID
		keyToBlockID[chapter.Key] = blockID
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
		_, err := contentDB.Exec(ctx, `
			INSERT INTO "references" (id, origin_block_id, target_type, target_chapter_id, target_block_id)
			VALUES ($1, $2, 'chapter', $3, NULL)
		`, uuid.New().String(), originBlockID, targetChapterID)
		if err != nil {
			return nil, fmt.Errorf("failed to insert reference: %w", err)
		}
	}

	return chapterParagraphMap, nil
}
