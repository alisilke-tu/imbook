package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/storage/sqldb"
)

const openRouterCreditsURL = "https://openrouter.ai/api/v1/credits"

var db = sqldb.NewDatabase("settings", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// GetResponse is returned by Get (never includes the raw API key).
// gemini_api_key in DB is reused for OpenRouter API key.
type GetResponse struct {
	GeminiAPIKeySet  bool   `json:"gemini_api_key_set"`
	DefaultDatasetID string `json:"default_dataset_id"`
}

// Get returns the current user's settings (masked). Requires authentication.
//
//encore:api auth method=GET path=/settings
func Get(ctx context.Context) (*GetResponse, error) {
	uid, _ := auth.UserID()
	var key, datasetID string
	err := db.QueryRow(ctx, `SELECT gemini_api_key, default_dataset_id FROM user_settings WHERE user_id = $1`, string(uid)).Scan(&key, &datasetID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &GetResponse{GeminiAPIKeySet: false}, nil
		}
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch settings"}
	}
	return &GetResponse{GeminiAPIKeySet: key != "", DefaultDatasetID: datasetID}, nil
}

// SetParams are the parameters for updating settings.
type SetParams struct {
	GeminiAPIKey     string `json:"gemini_api_key"`
	DefaultDatasetID string `json:"default_dataset_id"`
}

// Set updates the current user's settings (e.g. OpenRouter API key). Requires authentication.
//
//encore:api auth method=POST path=/settings
func Set(ctx context.Context, params *SetParams) error {
	uid, _ := auth.UserID()
	if params == nil || (params.GeminiAPIKey == "" && params.DefaultDatasetID == "") {
		return &errs.Error{Code: errs.InvalidArgument, Message: "OpenRouter API key is required"}
	}
	_, err := db.Exec(ctx, `
		INSERT INTO user_settings (user_id, gemini_api_key, default_dataset_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE
			SET gemini_api_key = CASE WHEN EXCLUDED.gemini_api_key != '' THEN EXCLUDED.gemini_api_key ELSE user_settings.gemini_api_key END,
			    default_dataset_id = CASE WHEN EXCLUDED.default_dataset_id != '' THEN EXCLUDED.default_dataset_id ELSE user_settings.default_dataset_id END
	`, string(uid), params.GeminiAPIKey, params.DefaultDatasetID)
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to save settings"}
	}
	return nil
}

// GetGeminiKeyParams are the parameters for getting a user's Gemini API key.
type GetGeminiKeyParams struct {
	UserID string `json:"user_id"`
}

// GetGeminiKeyResponse is returned by GetGeminiKey (private API).
type GetGeminiKeyResponse struct {
	Key              string `json:"key"`
	DefaultDatasetID string `json:"default_dataset_id"`
}

// GetGeminiKey returns the OpenRouter API key for the given user (stored in gemini_api_key column). Private; used by content and chat.
//
//encore:api private
func GetGeminiKey(ctx context.Context, params *GetGeminiKeyParams) (*GetGeminiKeyResponse, error) {
	if params == nil || params.UserID == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "userID is required"}
	}
	var key, datasetID string
	err := db.QueryRow(ctx, `SELECT gemini_api_key, default_dataset_id FROM user_settings WHERE user_id = $1`, params.UserID).Scan(&key, &datasetID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &errs.Error{Code: errs.NotFound, Message: "OpenRouter API key not set. Set it in Settings."}
		}
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch API key"}
	}
	if key == "" {
		return nil, &errs.Error{Code: errs.NotFound, Message: "OpenRouter API key not set. Set it in Settings."}
	}
	return &GetGeminiKeyResponse{Key: key, DefaultDatasetID: datasetID}, nil
}

// BillingResponse is returned by Billing (OpenRouter credits/usage).
type BillingResponse struct {
	TotalCredits float64 `json:"total_credits"`
	TotalUsage   float64 `json:"total_usage"`
}

// Billing fetches the current user's OpenRouter billing (credits and usage). Requires OpenRouter API key to be set.
// OpenRouter returns this data only for Management API keys; if the key is a regular key, returns PermissionDenied.
//
//encore:api auth method=GET path=/settings/billing
func Billing(ctx context.Context) (*BillingResponse, error) {
	uid, _ := auth.UserID()
	var key string
	err := db.QueryRow(ctx, `SELECT gemini_api_key FROM user_settings WHERE user_id = $1`, string(uid)).Scan(&key)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &errs.Error{Code: errs.NotFound, Message: "OpenRouter API key not set. Set it above to view billing."}
		}
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch API key"}
	}
	if key == "" {
		return nil, &errs.Error{Code: errs.NotFound, Message: "OpenRouter API key not set. Set it above to view billing."}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openRouterCreditsURL, nil)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create request"}
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch billing: " + err.Error()}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusForbidden {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "Billing data requires an OpenRouter Management API key. Use a management key to see credits and usage."}
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, &errs.Error{Code: errs.Unauthenticated, Message: "Invalid OpenRouter API key."}
	}
	if resp.StatusCode != http.StatusOK {
		return nil, &errs.Error{Code: errs.Internal, Message: "OpenRouter billing request failed"}
	}
	var out struct {
		Data struct {
			TotalCredits float64 `json:"total_credits"`
			TotalUsage   float64 `json:"total_usage"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to parse billing response"}
	}
	return &BillingResponse{
		TotalCredits: out.Data.TotalCredits,
		TotalUsage:   out.Data.TotalUsage,
	}, nil
}
