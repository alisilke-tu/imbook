package pipelines

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	a "encore.app/backend/auth"
	"encore.app/backend/settings"
	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/rlog"
	"encore.dev/storage/sqldb"
	"github.com/lib/pq"
)

var pipelineDB = sqldb.NewDatabase("pipelines", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// authDB is used for resolving user emails on admin chat views.
var authDB = sqldb.Named("auth")

// ListConfigsResponse returns available agent configurations
type ListConfigsResponse struct {
	Configs []AgentConfig `json:"configs"`
}

// ListConfigsParams for filtering configurations
type ListConfigsParams struct {
	IncludeDisabled bool `query:"include_disabled"`
}

// ListConfigs returns agent configurations (enabled only by default, or all if admin requests)
//
//encore:api auth method=GET path=/pipelines/configs
func ListConfigs(ctx context.Context, params *ListConfigsParams) (*ListConfigsResponse, error) {
	includeDisabled := params.IncludeDisabled && a.IsAdmin(ctx)

	var query string
	if includeDisabled {
		query = `
			SELECT id, name, COALESCE(description, ''), system_prompt, model, max_tokens, temperature,
			       COALESCE(available_tools::text, '{}'), is_enabled, is_default, version, created_by, created_at, updated_at
			FROM agent_configs
			ORDER BY is_default DESC, created_at DESC
		`
	} else {
		query = `
			SELECT id, name, COALESCE(description, ''), system_prompt, model, max_tokens, temperature,
			       COALESCE(available_tools::text, '{}'), is_enabled, is_default, version, created_by, created_at, updated_at
			FROM agent_configs
			WHERE is_enabled = true
			ORDER BY is_default DESC, name ASC
		`
	}

	rows, err := pipelineDB.Query(ctx, query)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch configs"}
	}
	defer rows.Close()

	var configs []AgentConfig
	for rows.Next() {
		var c AgentConfig
		var toolsStr string
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.SystemPrompt, &c.Model,
			&c.MaxTokens, &c.Temperature, &toolsStr, &c.IsEnabled,
			&c.IsDefault, &c.Version, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
			rlog.Error("ListConfigs: scan error", "error", err)
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan config"}
		}
		// Parse PostgreSQL array format: {item1,item2,item3}
		toolsStr = strings.Trim(toolsStr, "{}")
		if toolsStr != "" {
			c.AvailableTools = strings.Split(toolsStr, ",")
		} else {
			c.AvailableTools = []string{}
		}
		configs = append(configs, c)
	}

	return &ListConfigsResponse{Configs: configs}, nil
}

// GetConfig returns a specific agent configuration
//
//encore:api auth method=GET path=/pipelines/configs/:id
func GetConfig(ctx context.Context, id string) (*AgentConfig, error) {
	var config AgentConfig

	var toolsStr string
	var toolConfigsJSON []byte
	err := pipelineDB.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), system_prompt, model, max_tokens, temperature,
		       COALESCE(available_tools::text, '{}'), COALESCE(tool_configs, '[]'::jsonb), 
		       is_enabled, is_default, version, created_by, created_at, updated_at
		FROM agent_configs
		WHERE id = $1
	`, id).Scan(&config.ID, &config.Name, &config.Description, &config.SystemPrompt,
		&config.Model, &config.MaxTokens, &config.Temperature, &toolsStr, &toolConfigsJSON,
		&config.IsEnabled, &config.IsDefault, &config.Version, &config.CreatedBy,
		&config.CreatedAt, &config.UpdatedAt)
	
	if err == nil {
		// Parse PostgreSQL array format for legacy available_tools: {item1,item2,item3}
		toolsStr = strings.Trim(toolsStr, "{}")
		if toolsStr != "" {
			config.AvailableTools = strings.Split(toolsStr, ",")
		} else {
			config.AvailableTools = []string{}
		}

		// Parse tool_configs JSONB
		if len(toolConfigsJSON) > 0 && string(toolConfigsJSON) != "null" {
			if err := json.Unmarshal(toolConfigsJSON, &config.ToolConfigs); err != nil {
				rlog.Warn("failed to parse tool_configs", "err", err, "id", id)
				config.ToolConfigs = []ToolConfig{}
			}
		} else {
			config.ToolConfigs = []ToolConfig{}
		}
	}

	if err == sql.ErrNoRows {
		rlog.Warn("config not found", "id", id)
		return nil, &errs.Error{Code: errs.NotFound, Message: "config not found"}
	}
	if err != nil {
		rlog.Error("failed to query config", "error", err, "id", id)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch config"}
	}

	return &config, nil
}

// CreateConfigParams for creating a new agent configuration
type CreateConfigParams struct {
	Name           string       `json:"name"`
	Description    string       `json:"description"`
	SystemPrompt   string       `json:"system_prompt"`
	Model          string       `json:"model"`
	MaxTokens      int          `json:"max_tokens"`
	Temperature    float64      `json:"temperature"`
	AvailableTools []string     `json:"available_tools"` // DEPRECATED - use ToolConfigs
	ToolConfigs    []ToolConfig `json:"tool_configs"`    // NEW - rich tool configuration
	IsDefault      bool         `json:"is_default"`
}

// CreateConfig creates a new agent configuration (admin only)
//
//encore:api auth method=POST path=/pipelines/configs
func CreateConfig(ctx context.Context, params *CreateConfigParams) (*AgentConfig, error) {
	uid, _ := auth.UserID()
	rlog.Info("CreateConfig called", "name", params.Name, "uid", uid)

	if !a.IsAdmin(ctx) {
		rlog.Warn("CreateConfig: not admin", "uid", uid)
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	// Validate inputs
	if params.Name == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "name is required"}
	}
	if params.SystemPrompt == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "system prompt is required"}
	}
	if params.Model == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "model is required"}
	}
	if params.Temperature < 0 || params.Temperature > 2 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "temperature must be between 0 and 2"}
	}
	if params.MaxTokens < 1 || params.MaxTokens > 100000 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "max_tokens must be between 1 and 100000"}
	}

	// Validate tools (legacy)
	if len(params.AvailableTools) > 0 {
		if err := ValidateTools(params.AvailableTools); err != nil {
			return nil, err
		}
	}

	// Validate tool configs (new)
	if len(params.ToolConfigs) > 0 {
		toolNames := make([]string, len(params.ToolConfigs))
		for i, tc := range params.ToolConfigs {
			toolNames[i] = tc.Name
		}
		if err := ValidateTools(toolNames); err != nil {
			return nil, err
		}
	}

	rlog.Info("CreateConfig: inserting", "name", params.Name, "model", params.Model)

	// Serialize tool_configs to JSON
	var toolConfigsJSON []byte
	var err error
	if len(params.ToolConfigs) > 0 {
		toolConfigsJSON, err = json.Marshal(params.ToolConfigs)
		if err != nil {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "invalid tool configs"}
		}
	}

	var id string
	insertErr := pipelineDB.QueryRow(ctx, `
		INSERT INTO agent_configs (name, description, system_prompt, model, max_tokens, 
		                           temperature, available_tools, tool_configs, is_default, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`, params.Name, params.Description, params.SystemPrompt, params.Model, params.MaxTokens,
		params.Temperature, pq.Array(params.AvailableTools), toolConfigsJSON, params.IsDefault, uid).Scan(&id)

	if insertErr != nil {
		rlog.Error("CreateConfig: insert failed", "error", insertErr, "name", params.Name)
		errStr := insertErr.Error()
		if strings.Contains(errStr, "duplicate key") || strings.Contains(errStr, "unique constraint") {
			return nil, &errs.Error{Code: errs.AlreadyExists, Message: "a configuration with this name already exists"}
		}
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create config"}
	}

	rlog.Info("CreateConfig: inserted successfully", "id", id, "name", params.Name)
	return GetConfig(ctx, id)
}

// UpdateConfigParams for updating a configuration
type UpdateConfigParams struct {
	Name           string       `json:"name"`
	Description    string       `json:"description"`
	SystemPrompt   string       `json:"system_prompt"`
	Model          string       `json:"model"`
	MaxTokens      int          `json:"max_tokens"`
	Temperature    float64      `json:"temperature"`
	AvailableTools []string     `json:"available_tools"` // DEPRECATED - use ToolConfigs
	ToolConfigs    []ToolConfig `json:"tool_configs"`    // NEW - rich tool configuration
	IsEnabled      bool         `json:"is_enabled"`
}

// UpdateConfig updates an existing configuration (admin only)
//
//encore:api auth method=PUT path=/pipelines/configs/:id
func UpdateConfig(ctx context.Context, id string, params *UpdateConfigParams) (*AgentConfig, error) {
	if !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	// Validate inputs
	if params.Name == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "name is required"}
	}
	if params.SystemPrompt == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "system prompt is required"}
	}
	if params.Model == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "model is required"}
	}
	if params.Temperature < 0 || params.Temperature > 2 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "temperature must be between 0 and 2"}
	}
	if params.MaxTokens < 1 || params.MaxTokens > 100000 {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "max_tokens must be between 1 and 100000"}
	}

	// Validate tools (legacy)
	if len(params.AvailableTools) > 0 {
		if err := ValidateTools(params.AvailableTools); err != nil {
			return nil, err
		}
	}

	// Validate tool configs (new)
	if len(params.ToolConfigs) > 0 {
		toolNames := make([]string, len(params.ToolConfigs))
		for i, tc := range params.ToolConfigs {
			toolNames[i] = tc.Name
		}
		if err := ValidateTools(toolNames); err != nil {
			return nil, err
		}
	}

	// Serialize tool_configs to JSON
	var toolConfigsJSON []byte
	var err error
	if len(params.ToolConfigs) > 0 {
		toolConfigsJSON, err = json.Marshal(params.ToolConfigs)
		if err != nil {
			return nil, &errs.Error{Code: errs.InvalidArgument, Message: "invalid tool configs"}
		}
	}

	_, execErr := pipelineDB.Exec(ctx, `
		UPDATE agent_configs
		SET name = $1, description = $2, system_prompt = $3, model = $4, max_tokens = $5,
		    temperature = $6, available_tools = $7, tool_configs = $8, is_enabled = $9,
		    version = version + 1, updated_at = NOW()
		WHERE id = $10
	`, params.Name, params.Description, params.SystemPrompt, params.Model, params.MaxTokens,
		params.Temperature, pq.Array(params.AvailableTools), toolConfigsJSON, params.IsEnabled, id)

	if execErr != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to update config"}
	}

	return GetConfig(ctx, id)
}

// DeleteConfig deletes a configuration (admin only)
//
//encore:api auth method=DELETE path=/pipelines/configs/:id
func DeleteConfig(ctx context.Context, id string) error {
	if !a.IsAdmin(ctx) {
		return &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	tx, err := pipelineDB.Begin(ctx)
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to start transaction"}
	}
	defer tx.Rollback()

	// Legacy chat tables reference agent configs and can block deletion.
	if _, err = tx.Exec(ctx, `DELETE FROM execution_traces WHERE config_id = $1`, id); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete config traces"}
	}
	if _, err = tx.Exec(ctx, `DELETE FROM chat_sessions WHERE config_id = $1`, id); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete config sessions"}
	}

	// Remove workflow nodes that point to this config.
	if _, err = tx.Exec(ctx, `DELETE FROM pipeline_nodes WHERE agent_config_id = $1`, id); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete config workflow nodes"}
	}

	if _, err = tx.Exec(ctx, `DELETE FROM agent_configs WHERE id = $1`, id); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete config"}
	}

	if err = tx.Commit(); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to commit config deletion"}
	}

	return nil
}

// GetDefaultConfig returns the default configuration
func GetDefaultConfig(ctx context.Context) (*AgentConfig, error) {
	var config AgentConfig
	var toolsStr string
	var toolConfigsJSON []byte

	err := pipelineDB.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), system_prompt, model, max_tokens, temperature,
		       COALESCE(available_tools::text, '{}'), COALESCE(tool_configs, '[]'::jsonb),
		       is_enabled, is_default, version, created_by, created_at, updated_at
		FROM agent_configs
		WHERE is_default = true AND is_enabled = true
		LIMIT 1
	`).Scan(&config.ID, &config.Name, &config.Description, &config.SystemPrompt,
		&config.Model, &config.MaxTokens, &config.Temperature, &toolsStr, &toolConfigsJSON,
		&config.IsEnabled, &config.IsDefault, &config.Version, &config.CreatedBy,
		&config.CreatedAt, &config.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "no default config found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch default config"}
	}
	
	// Parse PostgreSQL array format for legacy available_tools: {item1,item2,item3}
	toolsStr = strings.Trim(toolsStr, "{}")
	if toolsStr != "" {
		config.AvailableTools = strings.Split(toolsStr, ",")
	} else {
		config.AvailableTools = []string{}
	}

	// Parse tool_configs JSONB
	if len(toolConfigsJSON) > 0 && string(toolConfigsJSON) != "null" {
		if err := json.Unmarshal(toolConfigsJSON, &config.ToolConfigs); err != nil {
			rlog.Warn("failed to parse tool_configs", "err", err)
			config.ToolConfigs = []ToolConfig{}
		}
	} else {
		config.ToolConfigs = []ToolConfig{}
	}

	return &config, nil
}

// SeedConfigsResponse for seed endpoint
type SeedConfigsResponse struct {
	Message string `json:"message"`
	Count   int    `json:"count"`
}

// SeedConfigs seeds the database with default agent configurations (admin only)
//
//encore:api auth method=POST path=/pipelines/seed
func SeedConfigs(ctx context.Context) (*SeedConfigsResponse, error) {
	if !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	uid, _ := auth.UserID()
	if err := SeedDefaultConfigs(ctx, string(uid)); err != nil {
		rlog.Error("failed to seed configs", "error", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to seed configs"}
	}

	var count int
	pipelineDB.QueryRow(ctx, `SELECT COUNT(*) FROM agent_configs`).Scan(&count)

	return &SeedConfigsResponse{
		Message: "Default agent configurations seeded successfully",
		Count:   count,
	}, nil
}

// ===== Pipeline Workflow Endpoints =====

// ListPipelinesResponse returns available pipelines
type ListPipelinesResponse struct {
	Pipelines []Pipeline `json:"pipelines"`
}

// ListPipelines returns all pipelines for the authenticated user
//
//encore:api auth method=GET path=/pipelines/workflows
func ListPipelines(ctx context.Context) (*ListPipelinesResponse, error) {
	uid, _ := auth.UserID()

	rows, err := pipelineDB.Query(ctx, `
		SELECT id, name, description, created_by, is_enabled, created_at, updated_at
		FROM pipelines
		WHERE created_by = $1 OR is_enabled = true
		ORDER BY created_at DESC
	`, uid)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch pipelines"}
	}
	defer rows.Close()

	var pipelines []Pipeline
	for rows.Next() {
		var p Pipeline
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.CreatedBy, &p.IsEnabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan pipeline"}
		}
		pipelines = append(pipelines, p)
	}

	return &ListPipelinesResponse{Pipelines: pipelines}, nil
}

// PipelineDetail includes pipeline with nodes and edges
type PipelineDetail struct {
	Pipeline Pipeline       `json:"pipeline"`
	Nodes    []PipelineNode `json:"nodes"`
	Edges    []PipelineEdge `json:"edges"`
}

// GetPipeline returns a specific pipeline with its nodes and edges
//
//encore:api auth method=GET path=/pipelines/workflows/:id
func GetPipeline(ctx context.Context, id string) (*PipelineDetail, error) {
	var pipeline Pipeline
	err := pipelineDB.QueryRow(ctx, `
		SELECT id, name, description, created_by, is_enabled, created_at, updated_at
		FROM pipelines
		WHERE id = $1
	`, id).Scan(&pipeline.ID, &pipeline.Name, &pipeline.Description, &pipeline.CreatedBy, &pipeline.IsEnabled, &pipeline.CreatedAt, &pipeline.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "pipeline not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch pipeline"}
	}

	// Fetch nodes
	nodeRows, err := pipelineDB.Query(ctx, `
		SELECT id, pipeline_id, node_type, agent_config_id, position_x, position_y, config, created_at
		FROM pipeline_nodes
		WHERE pipeline_id = $1
		ORDER BY created_at
	`, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch nodes"}
	}
	defer nodeRows.Close()

	var nodes []PipelineNode
	for nodeRows.Next() {
		var n PipelineNode
		var configJSON []byte
		if err := nodeRows.Scan(&n.ID, &n.PipelineID, &n.NodeType, &n.AgentConfigID, &n.PositionX, &n.PositionY, &configJSON, &n.CreatedAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan node"}
		}
		// Parse config JSON if present
		if len(configJSON) > 0 {
			// Config will be parsed by JSON unmarshaler
		}
		nodes = append(nodes, n)
	}

	// Fetch edges
	edgeRows, err := pipelineDB.Query(ctx, `
		SELECT id, pipeline_id, source_node_id, target_node_id, condition_type, condition_value, label, created_at
		FROM pipeline_edges
		WHERE pipeline_id = $1
		ORDER BY created_at
	`, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch edges"}
	}
	defer edgeRows.Close()

	var edges []PipelineEdge
	for edgeRows.Next() {
		var e PipelineEdge
		if err := edgeRows.Scan(&e.ID, &e.PipelineID, &e.SourceNodeID, &e.TargetNodeID, &e.ConditionType, &e.ConditionValue, &e.Label, &e.CreatedAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan edge"}
		}
		edges = append(edges, e)
	}

	return &PipelineDetail{
		Pipeline: pipeline,
		Nodes:    nodes,
		Edges:    edges,
	}, nil
}

// CreatePipelineParams for creating a new pipeline
type CreatePipelineParams struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Nodes       []PipelineNode `json:"nodes"`
	Edges       []PipelineEdge `json:"edges"`
}

// CreatePipeline creates a new pipeline with nodes and edges
//
//encore:api auth method=POST path=/pipelines/workflows
func CreatePipeline(ctx context.Context, params *CreatePipelineParams) (*PipelineDetail, error) {
	uid, _ := auth.UserID()

	if params.Name == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "name is required"}
	}

	// Start transaction
	tx, err := pipelineDB.Begin(ctx)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to start transaction"}
	}
	defer tx.Rollback()

	// Insert pipeline
	var pipelineID string
	err = tx.QueryRow(ctx, `
		INSERT INTO pipelines (name, description, created_by)
		VALUES ($1, $2, $3)
		RETURNING id
	`, params.Name, params.Description, uid).Scan(&pipelineID)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create pipeline"}
	}

	// Insert nodes
	for _, node := range params.Nodes {
		_, err = tx.Exec(ctx, `
			INSERT INTO pipeline_nodes (id, pipeline_id, node_type, agent_config_id, position_x, position_y, config)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, node.ID, pipelineID, node.NodeType, node.AgentConfigID, node.PositionX, node.PositionY, nil)
		if err != nil {
			rlog.Error("failed to insert node", "error", err)
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to create node"}
		}
	}

	// Insert edges
	for _, edge := range params.Edges {
		_, err = tx.Exec(ctx, `
			INSERT INTO pipeline_edges (id, pipeline_id, source_node_id, target_node_id, condition_type, condition_value, label)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, edge.ID, pipelineID, edge.SourceNodeID, edge.TargetNodeID, edge.ConditionType, edge.ConditionValue, edge.Label)
		if err != nil {
			rlog.Error("failed to insert edge", "error", err)
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to create edge"}
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to commit transaction"}
	}

	return GetPipeline(ctx, pipelineID)
}

// UpdatePipelineParams for updating a pipeline
type UpdatePipelineParams struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Nodes       []PipelineNode `json:"nodes"`
	Edges       []PipelineEdge `json:"edges"`
}

// UpdatePipeline updates a pipeline's structure
//
//encore:api auth method=PUT path=/pipelines/workflows/:id
func UpdatePipeline(ctx context.Context, id string, params *UpdatePipelineParams) (*PipelineDetail, error) {
	uid, _ := auth.UserID()

	// Verify ownership
	var createdBy string
	err := pipelineDB.QueryRow(ctx, `SELECT created_by FROM pipelines WHERE id = $1`, id).Scan(&createdBy)
	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "pipeline not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to verify ownership"}
	}
	if createdBy != string(uid) && !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "not authorized to update this pipeline"}
	}

	// Start transaction
	tx, err := pipelineDB.Begin(ctx)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to start transaction"}
	}
	defer tx.Rollback()

	// Update pipeline
	_, err = tx.Exec(ctx, `
		UPDATE pipelines
		SET name = $1, description = $2, updated_at = NOW()
		WHERE id = $3
	`, params.Name, params.Description, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to update pipeline"}
	}

	// Delete existing nodes and edges
	_, err = tx.Exec(ctx, `DELETE FROM pipeline_edges WHERE pipeline_id = $1`, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to delete edges"}
	}
	_, err = tx.Exec(ctx, `DELETE FROM pipeline_nodes WHERE pipeline_id = $1`, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to delete nodes"}
	}

	// Insert new nodes
	for _, node := range params.Nodes {
		_, err = tx.Exec(ctx, `
			INSERT INTO pipeline_nodes (id, pipeline_id, node_type, agent_config_id, position_x, position_y, config)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, node.ID, id, node.NodeType, node.AgentConfigID, node.PositionX, node.PositionY, nil)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to create node"}
		}
	}

	// Insert new edges
	for _, edge := range params.Edges {
		_, err = tx.Exec(ctx, `
			INSERT INTO pipeline_edges (id, pipeline_id, source_node_id, target_node_id, condition_type, condition_value, label)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, edge.ID, id, edge.SourceNodeID, edge.TargetNodeID, edge.ConditionType, edge.ConditionValue, edge.Label)
		if err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to create edge"}
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to commit transaction"}
	}

	return GetPipeline(ctx, id)
}

// DeletePipeline deletes a pipeline
//
//encore:api auth method=DELETE path=/pipelines/workflows/:id
func DeletePipeline(ctx context.Context, id string) error {
	uid, _ := auth.UserID()

	// Verify ownership
	var createdBy string
	err := pipelineDB.QueryRow(ctx, `SELECT created_by FROM pipelines WHERE id = $1`, id).Scan(&createdBy)
	if err == sql.ErrNoRows {
		return &errs.Error{Code: errs.NotFound, Message: "pipeline not found"}
	}
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to verify ownership"}
	}
	if createdBy != string(uid) && !a.IsAdmin(ctx) {
		return &errs.Error{Code: errs.PermissionDenied, Message: "not authorized to delete this pipeline"}
	}

	tx, err := pipelineDB.Begin(ctx)
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to start transaction"}
	}
	defer tx.Rollback()

	// Pipeline executions keep a foreign key to pipelines and must be removed first.
	if _, err = tx.Exec(ctx, `DELETE FROM pipeline_executions WHERE pipeline_id = $1`, id); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete pipeline executions"}
	}

	if _, err = tx.Exec(ctx, `DELETE FROM pipelines WHERE id = $1`, id); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete pipeline"}
	}

	if err = tx.Commit(); err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to commit pipeline deletion"}
	}

	return nil
}

// ExecutePipelineParams for executing a pipeline
type ExecutePipelineParams struct {
	Query               string  `json:"query"`
	LearningSessionID   *string `json:"learning_session_id,omitempty"`
}

// LoadPipelineExecutor builds a pipeline executor after validating the workflow exists, is enabled, and agent configs load.
func LoadPipelineExecutor(ctx context.Context, pipelineID string, userID string, apiKey string, learningSessionID *string) (*PipelineExecutor, error) {
	detail, err := GetPipeline(ctx, pipelineID)
	if err != nil {
		return nil, err
	}
	if !detail.Pipeline.IsEnabled {
		return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "pipeline is disabled"}
	}

	configs := make(map[string]*AgentConfig)
	for _, node := range detail.Nodes {
		if node.NodeType == "agent" && node.AgentConfigID != nil {
			config, err := GetConfig(ctx, *node.AgentConfigID)
			if err != nil {
				rlog.Error("failed to load agent config", "config_id", *node.AgentConfigID, "error", err)
				return nil, &errs.Error{Code: errs.Internal, Message: "failed to load agent configuration"}
			}
			configs[*node.AgentConfigID] = config
		}
	}

	return NewPipelineExecutor(&detail.Pipeline, detail.Nodes, detail.Edges, configs, userID, apiKey, learningSessionID), nil
}

// GetFirstPipelineIDForUser returns one workflow id the user may run in chat (same visibility as ListPipelines).
func GetFirstPipelineIDForUser(ctx context.Context) (string, error) {
	uid, _ := auth.UserID()
	var id string
	err := pipelineDB.QueryRow(ctx, `
		SELECT id FROM pipelines
		WHERE (created_by = $1 OR is_enabled = true) AND is_enabled = true
		ORDER BY created_at DESC
		LIMIT 1
	`, uid).Scan(&id)
	if err == sql.ErrNoRows {
		return "", &errs.Error{Code: errs.FailedPrecondition, Message: "no workflows available; create one in the admin pipeline editor"}
	}
	if err != nil {
		return "", &errs.Error{Code: errs.Internal, Message: "failed to resolve workflow"}
	}
	return id, nil
}

// ExecutePipeline runs a pipeline workflow
//
//encore:api auth method=POST path=/pipelines/workflows/:id/execute
func ExecutePipeline(ctx context.Context, id string, params *ExecutePipelineParams) (*PipelineExecution, error) {
	uid, _ := auth.UserID()
	if params == nil || params.Query == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "query is required"}
	}

	apiKey, err := getAPIKey(ctx, string(uid))
	if err != nil {
		return nil, err
	}

	var lsID *string
	if params != nil && params.LearningSessionID != nil && *params.LearningSessionID != "" {
		lsID = params.LearningSessionID
	}

	executor, err := LoadPipelineExecutor(ctx, id, string(uid), apiKey, lsID)
	if err != nil {
		return nil, err
	}

	// Execute pipeline
	execution, err := executor.Execute(ctx, params.Query)
	if err != nil {
		rlog.Error("pipeline execution failed", "pipeline_id", id, "error", err)
		// Save failed execution
		if execution != nil {
			_ = PersistPipelineExecution(ctx, execution)
		}
		return execution, err
	}

	// Save successful execution
	err = PersistPipelineExecution(ctx, execution)
	if err != nil {
		rlog.Error("failed to save execution", "error", err)
	}

	return execution, nil
}

func saveExecution(ctx context.Context, execution *PipelineExecution) error {
	pathJSON := "[]"
	if len(execution.ExecutionPath) > 0 {
		// Convert to JSON array
		pathJSON = `["` + strings.Join(execution.ExecutionPath, `","`) + `"]`
	}

	var agentReplies interface{}
	if len(execution.AgentReplies) > 0 {
		b, err := json.Marshal(execution.AgentReplies)
		if err != nil {
			return err
		}
		agentReplies = b
	}

	var trace interface{}
	if len(execution.Trace) > 0 {
		b, err := json.Marshal(execution.Trace)
		if err != nil {
			return err
		}
		trace = b
	}

	var lsID interface{}
	if execution.LearningSessionID != nil && *execution.LearningSessionID != "" {
		lsID = *execution.LearningSessionID
	}

	_, err := pipelineDB.Exec(ctx, `
		INSERT INTO pipeline_executions (pipeline_id, user_id, query, final_output, execution_path, total_duration_ms, success, error_message, agent_replies, trace, learning_session_id)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
	`, execution.PipelineID, execution.UserID, execution.Query, execution.FinalOutput, pathJSON, execution.TotalDurationMs, execution.Success, execution.ErrorMessage, agentReplies, trace, lsID)

	return err
}

// PersistPipelineExecution records a pipeline run (used by chat streaming and ExecutePipeline).
func PersistPipelineExecution(ctx context.Context, execution *PipelineExecution) error {
	return saveExecution(ctx, execution)
}

func getAPIKey(ctx context.Context, userID string) (string, error) {
	resp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{UserID: userID})
	if err != nil {
		return "", &errs.Error{Code: errs.FailedPrecondition, Message: "OpenRouter API key not configured"}
	}
	if resp.Key == "" {
		return "", &errs.Error{Code: errs.FailedPrecondition, Message: "OpenRouter API key not configured"}
	}
	return resp.Key, nil
}
