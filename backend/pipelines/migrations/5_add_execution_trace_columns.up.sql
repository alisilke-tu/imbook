-- Rich audit data for admin chat review
ALTER TABLE pipeline_executions
  ADD COLUMN IF NOT EXISTS agent_replies JSONB,
  ADD COLUMN IF NOT EXISTS trace JSONB;

CREATE INDEX IF NOT EXISTS idx_pipeline_executions_created ON pipeline_executions (created_at DESC);
