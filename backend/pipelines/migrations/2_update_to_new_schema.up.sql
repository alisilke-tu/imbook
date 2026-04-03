-- Migration to update from old schema to new schema
-- This handles the transition from pattern_type/config to the new agent config structure

-- First, check if we have the old schema and need to migrate
DO $$
BEGIN
  -- Check if old columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_configs' AND column_name = 'pattern_type'
  ) THEN
    -- We have the old schema, need to migrate
    
    -- Drop dependent tables first
    DROP TABLE IF EXISTS execution_traces CASCADE;
    DROP TABLE IF EXISTS chat_sessions CASCADE;
    
    -- Drop the old agent_configs table
    DROP TABLE IF EXISTS agent_configs CASCADE;
    
    -- Recreate with new schema
    CREATE TABLE agent_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      system_prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      max_tokens INT NOT NULL DEFAULT 4096,
      temperature FLOAT NOT NULL DEFAULT 0.7,
      available_tools TEXT[] NOT NULL DEFAULT '{}',
      tool_configs JSONB,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      is_default BOOLEAN NOT NULL DEFAULT false,
      version INT NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_agent_configs_enabled ON agent_configs(is_enabled);
    CREATE UNIQUE INDEX idx_agent_configs_default ON agent_configs(is_default) WHERE is_default = true;
    CREATE INDEX idx_agent_configs_tool_configs ON agent_configs USING GIN (tool_configs);

    -- Recreate chat_sessions
    CREATE TABLE chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      config_id UUID NOT NULL REFERENCES agent_configs(id),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ
    );

    CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
    CREATE INDEX idx_chat_sessions_config ON chat_sessions(config_id);

    -- Recreate execution_traces
    CREATE TABLE execution_traces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      config_id UUID NOT NULL REFERENCES agent_configs(id),
      trace JSONB NOT NULL,
      final_answer TEXT,
      total_duration_ms INT,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_execution_traces_session ON execution_traces(session_id);
    CREATE INDEX idx_execution_traces_config ON execution_traces(config_id);
    CREATE INDEX idx_execution_traces_created ON execution_traces(created_at DESC);
    
  ELSE
    -- New schema already exists, nothing to do
    RAISE NOTICE 'Schema already up to date';
  END IF;
END $$;
