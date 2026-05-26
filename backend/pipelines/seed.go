package pipelines

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/lib/pq"
)

type workflowNodeSeed struct {
	key         string
	nodeType    string
	agentConfig string
	positionX   float64
	positionY   float64
}

type workflowEdgeSeed struct {
	sourceKey string
	targetKey string
	label     *string
}

type workflowSeedSpec struct {
	name        string
	description string
	nodes       []workflowNodeSeed
	edges       []workflowEdgeSeed
}

func datasetToolConfig(datasetID string) []ToolConfig {
	return []ToolConfig{{Name: "search_chunks", DatasetID: datasetID}}
}

func insertConfigIfMissing(ctx context.Context, userID string, cfg CreateConfigParams) (bool, error) {
	var existingCount int
	if err := pipelineDB.QueryRow(ctx, `SELECT COUNT(*) FROM agent_configs WHERE name = $1`, cfg.Name).Scan(&existingCount); err != nil {
		return false, err
	}
	if existingCount > 0 {
		return false, nil
	}

	var toolConfigsJSON []byte
	if len(cfg.ToolConfigs) > 0 {
		var marshalErr error
		toolConfigsJSON, marshalErr = json.Marshal(cfg.ToolConfigs)
		if marshalErr != nil {
			return false, marshalErr
		}
	}

	availableTools := cfg.AvailableTools
	if availableTools == nil {
		availableTools = []string{}
	}

	_, err = pipelineDB.Exec(ctx, `
		INSERT INTO agent_configs (name, description, system_prompt, model, max_tokens,
		                           temperature, available_tools, tool_configs, is_default, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, cfg.Name, cfg.Description, cfg.SystemPrompt, cfg.Model, cfg.MaxTokens,
		cfg.Temperature, pq.Array(availableTools), toolConfigsJSON, cfg.IsDefault, userID)
	if err != nil {
		return false, err
	}

	return true, nil
}

func getConfigIDByName(ctx context.Context, name string) (string, error) {
	var id string
	err := pipelineDB.QueryRow(ctx, `SELECT id::text FROM agent_configs WHERE name = $1 LIMIT 1`, name).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("agent config %q not found: %v", name, err)
	}
	return id, nil
}

func seedPipeline(ctx context.Context, userID string, spec workflowSeedSpec) (bool, error) {
	var existingCount int
	if err := pipelineDB.QueryRow(ctx, `SELECT COUNT(*) FROM pipelines WHERE name = $1`, spec.name).Scan(&existingCount); err != nil {
		return false, err
	}
	if existingCount > 0 {
		return false, nil
	}

	tx, err := pipelineDB.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var pipelineID string
	err = tx.QueryRow(ctx, `
		INSERT INTO pipelines (name, description, created_by)
		VALUES ($1, $2, $3)
		RETURNING id
	`, spec.name, spec.description, userID).Scan(&pipelineID)
	if err != nil {
		return false, err
	}

	nodeIDs := make(map[string]string, len(spec.nodes))
	for _, node := range spec.nodes {
		var agentID *string
		if node.agentConfig != "" {
			id, lookupErr := getConfigIDByName(ctx, node.agentConfig)
			if lookupErr != nil {
				return false, lookupErr
			}
			agentID = &id
		}

		var nodeID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO pipeline_nodes (pipeline_id, node_type, agent_config_id, position_x, position_y, config)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id
		`, pipelineID, node.nodeType, agentID, node.positionX, node.positionY, nil).Scan(&nodeID); err != nil {
			return false, err
		}
		nodeIDs[node.key] = nodeID
	}

	for _, edge := range spec.edges {
		if _, err := tx.Exec(ctx, `
			INSERT INTO pipeline_edges (pipeline_id, source_node_id, target_node_id, condition_type, condition_value, label)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, pipelineID, nodeIDs[edge.sourceKey], nodeIDs[edge.targetKey], nil, nil, edge.label); err != nil {
			return false, err
		}
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}

	return true, nil
}

// SeedDefaultConfigs seeds the database with default agent configurations.
func SeedDefaultConfigs(ctx context.Context, userID, datasetID string) (int, error) {
	if datasetID == "" {
		return 0, fmt.Errorf("default dataset id is required before seeding workflows")
	}

	configs := []CreateConfigParams{
		{
			Name:        "Default Assistant",
			Description: "General-purpose assistant with knowledge base access",
			SystemPrompt: `You are a helpful assistant with access to a knowledge base. When users ask questions, use the search_chunks tool to find relevant information from the book. Provide clear, accurate answers based on the retrieved content.

Guidelines:
- Always search the knowledge base before answering questions about the book
- Cite specific passages when relevant
- If information isn't in the knowledge base, say so clearly
- Be concise but thorough in your responses`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   4000,
			Temperature: 0.7,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   true,
		},
		{
			Name:        "Precise Researcher",
			Description: "Low-temperature agent for factual queries requiring accuracy",
			SystemPrompt: `You are a precise researcher focused on accuracy and factual information. Always search the knowledge base before answering. Cite specific passages and be factual. If information isn't in the knowledge base, say so clearly.

Guidelines:
- Prioritize accuracy over creativity
- Always cite sources from the knowledge base
- Use exact quotes when possible
- Avoid speculation or inference beyond the source material
- Be thorough in your research before responding`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   4000,
			Temperature: 0.2,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "Creative Explainer",
			Description: "Higher-temperature agent for engaging explanations and teaching",
			SystemPrompt: `You are a creative teacher who explains concepts clearly and engagingly. Use the knowledge base to find information, then explain it in an easy-to-understand way with examples and analogies.

Guidelines:
- Search the knowledge base for accurate information first
- Explain concepts using analogies and examples
- Break down complex ideas into simpler parts
- Use engaging language to maintain interest
- Connect ideas to real-world applications when possible`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   4000,
			Temperature: 0.9,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "Quick Responder",
			Description: "Fast, concise responses with minimal tool usage",
			SystemPrompt: `You are a quick, efficient assistant. Provide concise, direct answers. Only use the search_chunks tool when absolutely necessary to answer the question accurately.

Guidelines:
- Be brief and to the point
- Only search when you need specific information from the book
- Avoid unnecessary elaboration
- Get straight to the answer`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   2000,
			Temperature: 0.5,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "Book Only Agent",
			Description: "Answers strictly from the book and avoids outside knowledge",
			SystemPrompt: `You answer strictly from the book content retrieved by search_chunks.

Rules:
- Always search the book before answering
- Use only evidence directly supported by retrieved passages
- If the book does not support an answer, say so clearly
- Do not add outside knowledge or speculation
- Keep the response concise and evidence-based`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   3000,
			Temperature: 0.1,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "Book and Explorer Agent",
			Description: "Book-grounded agent that can explain and connect ideas more broadly",
			SystemPrompt: `You are a book-grounded explorer.

Rules:
- Search the book first and anchor your answer in the retrieved passages
- Explain ideas clearly and connect them to related concepts when useful
- If the book does not contain enough evidence, say that clearly before adding broader context
- Stay grounded in the topic of the book
- Keep the answer helpful, structured, and readable`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   3500,
			Temperature: 0.5,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "Strict Book Answerer",
			Description: "Answers only from book evidence with no outside knowledge",
			SystemPrompt: `You answer only from the book content retrieved by search_chunks.

Rules:
- Always search the book first
- Use only statements that are directly supported by retrieved passages
- If nothing relevant is found, say clearly that the book does not provide a reliable answer
- Do not add outside knowledge or speculation
- Mention book evidence briefly and stay concise`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   3000,
			Temperature: 0.1,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "Book Evidence Researcher",
			Description: "Extracts evidence from the book for a later synthesis step",
			SystemPrompt: `You are the research step in a two-agent workflow.

Task:
- Search the book thoroughly for evidence relevant to the question
- Return short bullet points with the most relevant passages and concepts
- If you cannot find a meaningful match, output exactly: NO_EVIDENCE
- Do not give a polished final answer
- Do not use general knowledge as a substitute for evidence`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   3000,
			Temperature: 0.2,
			ToolConfigs: datasetToolConfig(datasetID),
			IsDefault:   false,
		},
		{
			Name:        "General Knowledge Synthesizer",
			Description: "Final synthesis step that can fall back to domain knowledge",
			SystemPrompt: `You are the final synthesis step in a two-agent workflow.

You receive the original question plus the previous agent's evidence.

Rules:
- If the previous agent found book evidence, answer primarily from that evidence
- If the previous agent says NO_EVIDENCE or the evidence is clearly insufficient, fall back to general knowledge in the same domain
- Clearly mark when you are using general knowledge fallback
- Keep the answer grounded in the topic of the book
- Be explicit about whether the answer is book-based or fallback-based`,
			Model:       "google/gemini-2.0-flash-001",
			MaxTokens:   3500,
			Temperature: 0.5,
			ToolConfigs: nil,
			IsDefault:   false,
		},
	}

	inserted := 0
	for _, cfg := range configs {
		didInsert, err := insertConfigIfMissing(ctx, userID, cfg)
		if err != nil {
			return inserted, err
		}
		if didInsert {
			inserted++
		}
	}

	return inserted, nil
}

// SeedDefaultWorkflows seeds two comparison workflows for book-only versus fallback behavior.
func SeedDefaultWorkflows(ctx context.Context, userID, datasetID string) (int, error) {
	if datasetID == "" {
		return 0, fmt.Errorf("default dataset id is required before seeding workflows")
	}

	workflows := []workflowSeedSpec{
		{
			name:        "Book-First Fallback Workflow",
			description: "Two-agent workflow that researches the book first and then falls back to general knowledge when needed",
			nodes: []workflowNodeSeed{
				{key: "start", nodeType: "start", positionX: 250, positionY: 50},
				{key: "research", nodeType: "agent", agentConfig: "Book Evidence Researcher", positionX: 250, positionY: 200},
				{key: "synth", nodeType: "agent", agentConfig: "General Knowledge Synthesizer", positionX: 250, positionY: 350},
				{key: "end", nodeType: "end", positionX: 250, positionY: 500},
			},
			edges: []workflowEdgeSeed{
				{sourceKey: "start", targetKey: "research"},
				{sourceKey: "research", targetKey: "synth"},
				{sourceKey: "synth", targetKey: "end"},
			},
		},
		{
			name:        "Strict Book Workflow",
			description: "Single-agent workflow that answers only from book evidence",
			nodes: []workflowNodeSeed{
				{key: "start", nodeType: "start", positionX: 250, positionY: 50},
				{key: "agent", nodeType: "agent", agentConfig: "Strict Book Answerer", positionX: 250, positionY: 200},
				{key: "end", nodeType: "end", positionX: 250, positionY: 350},
			},
			edges: []workflowEdgeSeed{
				{sourceKey: "start", targetKey: "agent"},
				{sourceKey: "agent", targetKey: "end"},
			},
		},
	}

	inserted := 0
	for _, workflow := range workflows {
		didInsert, err := seedPipeline(ctx, userID, workflow)
		if err != nil {
			return inserted, err
		}
		if didInsert {
			inserted++
		}
	}

	return inserted, nil
}

// EnsureDefaultAgentsAndWorkflows bootstraps the comparison workflows if needed.
func EnsureDefaultAgentsAndWorkflows(ctx context.Context, userID string) error {
	datasetID, err := resolveBootstrapDatasetID(ctx)
	if err != nil {
		return err
	}

	if _, err := SeedDefaultConfigs(ctx, userID, datasetID); err != nil {
		return err
	}
	if _, err := SeedDefaultWorkflows(ctx, userID, datasetID); err != nil {
		return err
	}
	return nil
}

func resolveBootstrapDatasetID(ctx context.Context) (string, error) {
	settingsResp, err := settings.Get(ctx)
	if err != nil {
		return "", err
	}
	if settingsResp.DefaultDatasetID != "" {
		return settingsResp.DefaultDatasetID, nil
	}

	datasetsResp, err := content.ListDatasets(ctx, &content.ListDatasetsParams{Status: "ready"})
	if err != nil {
		return "", err
	}
	if len(datasetsResp.Datasets) == 0 {
		return "", fmt.Errorf("no ready dataset found; create and finish one in the Content admin page first")
	}
	return datasetsResp.Datasets[0].ID, nil
}
