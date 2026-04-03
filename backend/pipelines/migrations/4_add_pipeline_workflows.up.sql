-- Pipelines: workflow containers
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pipeline nodes: agents and control flow nodes
CREATE TABLE pipeline_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL, -- 'start', 'agent', 'condition', 'end'
  agent_config_id UUID REFERENCES agent_configs(id), -- NULL for non-agent nodes
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  config JSONB, -- Node-specific configuration
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pipeline edges: connections with optional conditions
CREATE TABLE pipeline_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES pipeline_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES pipeline_nodes(id) ON DELETE CASCADE,
  condition_type TEXT, -- 'contains', 'length_gt', 'length_lt', 'always', NULL for unconditional
  condition_value TEXT, -- The value to check against
  label TEXT, -- Display label like "Yes", "No", "Long"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pipeline executions: track workflow runs
CREATE TABLE pipeline_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id),
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  final_output TEXT,
  execution_path JSONB, -- Array of node IDs showing execution path
  total_duration_ms INT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipelines_enabled ON pipelines(is_enabled);
CREATE INDEX idx_pipeline_nodes_pipeline ON pipeline_nodes(pipeline_id);
CREATE INDEX idx_pipeline_edges_pipeline ON pipeline_edges(pipeline_id);
CREATE INDEX idx_pipeline_executions_pipeline ON pipeline_executions(pipeline_id);
CREATE INDEX idx_pipeline_executions_user ON pipeline_executions(user_id);
