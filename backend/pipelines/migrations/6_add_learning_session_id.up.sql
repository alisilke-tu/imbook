-- Links pipeline runs to a learning session (UUID stored in learning service DB; no cross-DB FK).
ALTER TABLE pipeline_executions
  ADD COLUMN IF NOT EXISTS learning_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_pipeline_executions_learning_session
  ON pipeline_executions (learning_session_id)
  WHERE learning_session_id IS NOT NULL;
