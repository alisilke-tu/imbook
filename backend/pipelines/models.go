package pipelines

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"encore.dev/beta/errs"
	"encore.dev/rlog"
)

// LLMModel represents an available language model
type LLMModel struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
}

// ListLLMModelsResponse contains available models
type ListLLMModelsResponse struct {
	Models []LLMModel `json:"models"`
}

// allowedPrefixes defines which model families to include from OpenRouter
var allowedPrefixes = []string{
	"google/gemini",
	"openai/gpt-4",
	"openai/o",
	"anthropic/claude",
	"meta-llama/llama-4",
	"mistralai/mistral",
	"mistralai/mixtral",
	"deepseek/deepseek",
}

// ListLLMModels returns available LLM models fetched live from OpenRouter.
// Falls back to a curated static list if the upstream call fails.
//
//encore:api auth method=GET path=/pipelines/models
func ListLLMModels(ctx context.Context) (*ListLLMModelsResponse, error) {
	models, err := fetchOpenRouterModels(ctx)
	if err != nil {
		rlog.Warn("ListLLMModels: upstream fetch failed, using fallback", "err", err)
		return &ListLLMModelsResponse{Models: fallbackModels()}, nil
	}
	return &ListLLMModelsResponse{Models: models}, nil
}

type openRouterModel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type openRouterResponse struct {
	Data []openRouterModel `json:"data"`
}

func fetchOpenRouterModels(ctx context.Context) ([]LLMModel, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openrouter.ai/api/v1/models", nil)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to build request"}
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, &errs.Error{Code: errs.Unavailable, Message: "openrouter unreachable"}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, &errs.Error{Code: errs.Internal, Message: "openrouter returned non-200"}
	}

	var orResp openRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&orResp); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to decode openrouter response"}
	}

	var models []LLMModel
	seen := map[string]bool{}
	for _, m := range orResp.Data {
		if seen[m.ID] {
			continue
		}
		if !isAllowedModel(m.ID) {
			continue
		}
		provider := extractProvider(m.ID)
		models = append(models, LLMModel{
			ID:       m.ID,
			Name:     m.Name,
			Provider: provider,
		})
		seen[m.ID] = true
	}

	sort.Slice(models, func(i, j int) bool {
		if models[i].Provider != models[j].Provider {
			return models[i].Provider < models[j].Provider
		}
		return models[i].ID < models[j].ID
	})

	if len(models) == 0 {
		return fallbackModels(), nil
	}
	return models, nil
}

func isAllowedModel(id string) bool {
	id = strings.ToLower(id)
	for _, prefix := range allowedPrefixes {
		if strings.HasPrefix(id, prefix) {
			return true
		}
	}
	return false
}

func extractProvider(id string) string {
	parts := strings.SplitN(id, "/", 2)
	if len(parts) == 2 {
		return parts[0]
	}
	return id
}

// fallbackModels returns a curated static list used when OpenRouter is unreachable.
func fallbackModels() []LLMModel {
	return []LLMModel{
		{ID: "google/gemini-2.5-flash-preview", Name: "Gemini 2.5 Flash (Preview)", Provider: "google"},
		{ID: "google/gemini-2.5-pro-preview", Name: "Gemini 2.5 Pro (Preview)", Provider: "google"},
		{ID: "google/gemini-2.0-flash-001", Name: "Gemini 2.0 Flash", Provider: "google"},
		{ID: "openai/gpt-4.1", Name: "GPT-4.1", Provider: "openai"},
		{ID: "openai/gpt-4.1-mini", Name: "GPT-4.1 Mini", Provider: "openai"},
		{ID: "openai/gpt-4o", Name: "GPT-4o", Provider: "openai"},
		{ID: "anthropic/claude-opus-4", Name: "Claude Opus 4", Provider: "anthropic"},
		{ID: "anthropic/claude-sonnet-4-5", Name: "Claude Sonnet 4.5", Provider: "anthropic"},
		{ID: "anthropic/claude-haiku-4-5", Name: "Claude Haiku 4.5", Provider: "anthropic"},
		{ID: "meta-llama/llama-4-maverick", Name: "Llama 4 Maverick", Provider: "meta-llama"},
		{ID: "mistralai/mistral-medium-3", Name: "Mistral Medium 3", Provider: "mistralai"},
	}
}
