-- Create embedding_datasets table for versioned embedding collections
CREATE TABLE embedding_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  chunk_size INT NOT NULL DEFAULT 500,
  embedding_model TEXT NOT NULL DEFAULT 'openrouter-text-embedding-3-small',
  embedding_dim INT NOT NULL DEFAULT 768,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'failed')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  total_chunks INT NOT NULL DEFAULT 0,
  UNIQUE(name, version)
);

CREATE INDEX idx_datasets_name ON embedding_datasets(name);
CREATE INDEX idx_datasets_status ON embedding_datasets(status);
CREATE INDEX idx_datasets_created_by ON embedding_datasets(created_by);

-- Add dataset_id to chunks table
ALTER TABLE chunks ADD COLUMN dataset_id UUID REFERENCES embedding_datasets(id) ON DELETE CASCADE;
CREATE INDEX idx_chunks_dataset ON chunks(dataset_id);

-- Make dataset_id nullable for now to support existing chunks
-- Future migration can enforce NOT NULL after data migration
