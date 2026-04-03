-- Link chapters and content structure to datasets
-- This allows each dataset to have its own chapter/paragraph structure

-- Add dataset_id to chapters table
ALTER TABLE chapters ADD COLUMN dataset_id UUID REFERENCES embedding_datasets(id) ON DELETE CASCADE;
CREATE INDEX idx_chapters_dataset ON chapters(dataset_id);

-- Note: paragraphs are already linked to chapters via content_blocks,
-- so they inherit the dataset relationship through the chapter hierarchy
