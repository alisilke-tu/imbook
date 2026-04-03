-- Recreate tables with correct column order
DROP TABLE IF EXISTS execution_traces CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS agent_configs CASCADE;

-- Agent configurations with correct column order
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

-- Chat sessions
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  config_id UUID NOT NULL REFERENCES agent_configs(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_config ON chat_sessions(config_id);

-- Execution traces
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
