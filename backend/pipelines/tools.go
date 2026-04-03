package pipelines

import (
	"context"

	"encore.dev/beta/errs"
)

// ToolRegistry contains all available tools
var ToolRegistry = []ToolDefinition{
	{
		Name:        "search_chunks",
		Description: "Search the knowledge base of embedded text chunks from the book. Use when users ask about book content, chapters, or need relevant passages.",
		Category:    "knowledge",
	},
	{
		Name:        "get_learning_context",
		Description: "Retrieves the user's current learning session: what they want to learn and how they prefer to learn. Use to personalize tutoring.",
		Category:    "learning",
	},
}

// ListToolsResponse returns available tools
type ListToolsResponse struct {
	Tools []ToolDefinition `json:"tools"`
}

// ListAvailableTools returns all tools that can be enabled for agents
//
//encore:api auth method=GET path=/pipelines/tools
func ListAvailableTools(ctx context.Context) (*ListToolsResponse, error) {
	return &ListToolsResponse{
		Tools: ToolRegistry,
	}, nil
}

// ValidateTools checks if all tool names are valid
func ValidateTools(toolNames []string) error {
	validTools := make(map[string]bool)
	for _, tool := range ToolRegistry {
		validTools[tool.Name] = true
	}

	for _, name := range toolNames {
		if !validTools[name] {
			return &errs.Error{
				Code:    errs.InvalidArgument,
				Message: "invalid tool: " + name,
			}
		}
	}

	return nil
}
