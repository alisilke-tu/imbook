package pipelines

import (
	"encoding/json"
	"time"
)

// AgentConfig represents a configurable AI agent
type AgentConfig struct {
	ID             string       `json:"id"`
	Name           string       `json:"name"`
	Description    string       `json:"description"`
	SystemPrompt   string       `json:"system_prompt"`
	Model          string       `json:"model"`
	MaxTokens      int          `json:"max_tokens"`
	Temperature    float64      `json:"temperature"`
	AvailableTools []string     `json:"available_tools"` // DEPRECATED - kept for backward compatibility
	ToolConfigs    []ToolConfig `json:"tool_configs"`    // NEW - rich tool configuration with dataset selection
	IsEnabled      bool         `json:"is_enabled"`
	IsDefault      bool         `json:"is_default"`
	Version        int          `json:"version"`
	CreatedBy      string       `json:"created_by"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

// ToolDefinition describes an available tool
type ToolDefinition struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// ToolConfig represents a configured tool with its parameters
type ToolConfig struct {
	Name      string            `json:"name"`
	DatasetID string            `json:"dataset_id"`       // Required for knowledge retrieval tools
	Params    map[string]string `json:"params,omitempty"` // Additional tool-specific parameters
}

// AgentResult represents the execution result
type AgentResult struct {
	Answer        string `json:"answer"`
	ToolCallCount int    `json:"tool_call_count"`
	TokensUsed    int    `json:"tokens_used,omitempty"`
}

// AgentReply is one agent node's final text in a pipeline (for multi-agent visibility).
type AgentReply struct {
	AgentName   string `json:"agent_name"`
	GraphNodeID string `json:"graph_node_id,omitempty"`
	Content     string `json:"content"`
}

// ExecutionTrace records step-by-step execution for debugging
type ExecutionTrace struct {
	Steps []ExecutionStep `json:"steps"`
}

// ExecutionStep represents one step in the execution
type ExecutionStep struct {
	StepType    string    `json:"step_type"` // tool_call, reasoning, agent_output, pipeline_agent_start, ...
	AgentName   string    `json:"agent_name,omitempty"`
	GraphNodeID string    `json:"graph_node_id,omitempty"` // pipeline graph node id (per-agent grouping)
	ToolName    string    `json:"tool_name,omitempty"`
	Input       string    `json:"input"`
	Output      string    `json:"output"`
	DurationMs  int64     `json:"duration_ms"`
	Error       string    `json:"error,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
}

// Pipeline represents a workflow of connected agents
type Pipeline struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedBy   string    `json:"created_by"`
	IsEnabled   bool      `json:"is_enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// PipelineNode represents a node in the workflow
type PipelineNode struct {
	ID            string          `json:"id"`
	PipelineID    string          `json:"pipeline_id"`
	NodeType      string          `json:"node_type"` // start, agent, condition, end
	AgentConfigID *string         `json:"agent_config_id,omitempty"`
	PositionX     float64         `json:"position_x"`
	PositionY     float64         `json:"position_y"`
	Config        json.RawMessage `json:"config,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
}

// PipelineEdge represents a connection between nodes
type PipelineEdge struct {
	ID             string    `json:"id"`
	PipelineID     string    `json:"pipeline_id"`
	SourceNodeID   string    `json:"source_node_id"`
	TargetNodeID   string    `json:"target_node_id"`
	ConditionType  *string   `json:"condition_type,omitempty"`
	ConditionValue *string   `json:"condition_value,omitempty"`
	Label          *string   `json:"label,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// PipelineExecution represents a workflow execution
type PipelineExecution struct {
	ID              string           `json:"id"`
	PipelineID      string           `json:"pipeline_id"`
	UserID          string           `json:"user_id"`
	Query           string           `json:"query"`
	FinalOutput     *string          `json:"final_output,omitempty"`
	AgentReplies    []AgentReply     `json:"agent_replies,omitempty"`
	Trace           []ExecutionStep  `json:"trace,omitempty"`
	ExecutionPath   []string         `json:"execution_path"`
	TotalDurationMs int              `json:"total_duration_ms"`
	Success         bool             `json:"success"`
	ErrorMessage    *string          `json:"error_message,omitempty"`
	CreatedAt       time.Time        `json:"created_at"`
}

// ConditionType defines supported condition types
type ConditionType string

const (
	ConditionContains ConditionType = "contains"  // Check if output contains keyword
	ConditionLengthGT ConditionType = "length_gt" // Output length > value
	ConditionLengthLT ConditionType = "length_lt" // Output length < value
	ConditionAlways   ConditionType = "always"    // Always take this path (default)
)
