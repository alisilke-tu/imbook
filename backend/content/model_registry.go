package content

import (
	"context"

	"encore.dev/beta/errs"
)

// EmbeddingModelSpec defines the specification for an embedding model
type EmbeddingModelSpec struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Provider   string `json:"provider"`
	ModelPath  string `json:"model_path"`
	Dimensions int    `json:"dimensions"`
	BaseURL    string `json:"base_url"`
	MaxTokens  int    `json:"max_tokens"`
}

// EmbeddingModelRegistry contains all supported embedding models
var EmbeddingModelRegistry = []EmbeddingModelSpec{
	{
		ID:         "openrouter-text-embedding-3-small",
		Name:       "OpenAI Text Embedding 3 Small",
		Provider:   "openrouter",
		ModelPath:  "openai/text-embedding-3-small",
		Dimensions: 768,
		BaseURL:    "https://openrouter.ai/api/v1",
		MaxTokens:  8191,
	},
	{
		ID:         "openrouter-text-embedding-3-large",
		Name:       "OpenAI Text Embedding 3 Large",
		Provider:   "openrouter",
		ModelPath:  "openai/text-embedding-3-large",
		Dimensions: 3072,
		BaseURL:    "https://openrouter.ai/api/v1",
		MaxTokens:  8191,
	},
}

// ListModelsResponse returns available embedding models
type ListModelsResponse struct {
	Models []EmbeddingModelSpec `json:"models"`
}

// ListEmbeddingModels returns all available embedding models from the registry
//
//encore:api auth method=GET path=/content/embedding-models
func ListEmbeddingModels(ctx context.Context) (*ListModelsResponse, error) {
	return &ListModelsResponse{
		Models: EmbeddingModelRegistry,
	}, nil
}

// GetModelSpec returns the model specification for a given model ID
func GetModelSpec(modelID string) (*EmbeddingModelSpec, error) {
	for _, model := range EmbeddingModelRegistry {
		if model.ID == modelID {
			return &model, nil
		}
	}
	return nil, &errs.Error{
		Code:    errs.InvalidArgument,
		Message: "invalid embedding model: " + modelID,
	}
}

// ValidateModelID checks if a model ID exists in the registry
func ValidateModelID(modelID string) error {
	_, err := GetModelSpec(modelID)
	return err
}
