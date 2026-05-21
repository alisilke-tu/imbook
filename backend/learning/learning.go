package learning

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("learning", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// pipelineDB reads pipeline_executions for grouping conversations by learning session.
var pipelineDB = sqldb.Named("pipelines")

// LearningSession is a user's learning goal context.
type LearningSession struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	Title              string     `json:"title"`
	WhatToLearn        string     `json:"what_to_learn"`
	HowToLearn         string     `json:"how_to_learn"`
	AdditionalContext  *string    `json:"additional_context,omitempty"`
	IsActive           bool       `json:"is_active"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// CreateLearningSessionParams creates a new session and makes it active.
type CreateLearningSessionParams struct {
	Title              string `json:"title"`
	WhatToLearn        string `json:"what_to_learn"`
	HowToLearn         string `json:"how_to_learn"`
	AdditionalContext  string `json:"additional_context,omitempty"`
}

// CreateLearningSessionResponse returns the new session id.
type CreateLearningSessionResponse struct {
	Session LearningSession `json:"session"`
}

// CreateLearningSession creates a learning session and deactivates others for the user.
//
//encore:api auth method=POST path=/learning/sessions
func CreateLearningSession(ctx context.Context, params *CreateLearningSessionParams) (*CreateLearningSessionResponse, error) {
	uid, _ := auth.UserID()
	if params == nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "body required"}
	}
	if strings.TrimSpace(params.Title) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "title is required"}
	}
	if strings.TrimSpace(params.WhatToLearn) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "what_to_learn is required"}
	}
	if strings.TrimSpace(params.HowToLearn) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "how_to_learn is required"}
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to start transaction"}
	}
	defer tx.Rollback()

	_, err = tx.Exec(ctx, `
		UPDATE learning_sessions SET is_active = false, updated_at = NOW()
		WHERE user_id = $1 AND is_active = true
	`, string(uid))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to update sessions"}
	}

	var addCtx interface{}
	if strings.TrimSpace(params.AdditionalContext) != "" {
		addCtx = params.AdditionalContext
	}

	var s LearningSession
	err = tx.QueryRow(ctx, `
		INSERT INTO learning_sessions (user_id, title, what_to_learn, how_to_learn, additional_context, is_active)
		VALUES ($1, $2, $3, $4, $5, true)
		RETURNING id::text, user_id, title, what_to_learn, how_to_learn, additional_context, is_active, created_at, updated_at
	`, string(uid), params.Title, params.WhatToLearn, params.HowToLearn, addCtx).Scan(
		&s.ID, &s.UserID, &s.Title, &s.WhatToLearn, &s.HowToLearn, &s.AdditionalContext, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create session"}
	}
	if err := tx.Commit(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to commit"}
	}
	return &CreateLearningSessionResponse{Session: s}, nil
}

// GetActiveLearningSession returns the active session for the current user.
//
//encore:api auth method=GET path=/learning/me/active
func GetActiveLearningSession(ctx context.Context) (*LearningSession, error) {
	uid, _ := auth.UserID()
	var s LearningSession
	err := db.QueryRow(ctx, `
		SELECT id::text, user_id, title, what_to_learn, how_to_learn, additional_context, is_active, created_at, updated_at
		FROM learning_sessions
		WHERE user_id = $1 AND is_active = true
		ORDER BY updated_at DESC
		LIMIT 1
	`, string(uid)).Scan(
		&s.ID, &s.UserID, &s.Title, &s.WhatToLearn, &s.HowToLearn, &s.AdditionalContext, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "no active learning session"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load session"}
	}
	return &s, nil
}

// GetLearningSession returns one session if owned by the user.
//
//encore:api auth method=GET path=/learning/sessions/:id
func GetLearningSession(ctx context.Context, id string) (*LearningSession, error) {
	uid, _ := auth.UserID()
	var s LearningSession
	err := db.QueryRow(ctx, `
		SELECT id::text, user_id, title, what_to_learn, how_to_learn, additional_context, is_active, created_at, updated_at
		FROM learning_sessions
		WHERE id = $1 AND user_id = $2
	`, id, string(uid)).Scan(
		&s.ID, &s.UserID, &s.Title, &s.WhatToLearn, &s.HowToLearn, &s.AdditionalContext, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "session not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load session"}
	}
	return &s, nil
}

// ListLearningSessionsResponse lists sessions.
type ListLearningSessionsResponse struct {
	Sessions []LearningSession `json:"sessions"`
}

// ListLearningSessions returns all sessions for the current user.
//
//encore:api auth method=GET path=/learning/sessions
func ListLearningSessions(ctx context.Context) (*ListLearningSessionsResponse, error) {
	uid, _ := auth.UserID()
	rows, err := db.Query(ctx, `
		SELECT id::text, user_id, title, what_to_learn, how_to_learn, additional_context, is_active, created_at, updated_at
		FROM learning_sessions
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, string(uid))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to list sessions"}
	}
	defer rows.Close()

	var out []LearningSession
	for rows.Next() {
		var s LearningSession
		if err := rows.Scan(&s.ID, &s.UserID, &s.Title, &s.WhatToLearn, &s.HowToLearn, &s.AdditionalContext, &s.IsActive, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan session"}
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to iterate sessions"}
	}
	return &ListLearningSessionsResponse{Sessions: out}, nil
}

// ConversationSummary is one pipeline execution linked to a learning session.
type ConversationSummary struct {
	ExecutionID string    `json:"execution_id"`
	PipelineID  string    `json:"pipeline_id"`
	Preview     string    `json:"preview"`
	CreatedAt   time.Time `json:"created_at"`
}

// SessionWithConversations groups a session with its chats.
type SessionWithConversations struct {
	Session        LearningSession       `json:"session"`
	Conversations  []ConversationSummary `json:"conversations"`
}

// GetSessionsWithConversationsResponse is the tree for the sidebar.
type GetSessionsWithConversationsResponse struct {
	Sessions []SessionWithConversations `json:"sessions"`
}

// GetSessionsWithConversations returns all sessions with pipeline executions under each.
//
//encore:api auth method=GET path=/learning/session-tree
func GetSessionsWithConversations(ctx context.Context) (*GetSessionsWithConversationsResponse, error) {
	uid, _ := auth.UserID()

	list, err := ListLearningSessions(ctx)
	if err != nil {
		return nil, err
	}
	if len(list.Sessions) == 0 {
		return &GetSessionsWithConversationsResponse{Sessions: nil}, nil
	}

	rows, err := pipelineDB.Query(ctx, `
		SELECT id::text, pipeline_id::text, query, created_at, learning_session_id::text
		FROM pipeline_executions
		WHERE user_id = $1 AND learning_session_id IS NOT NULL
		ORDER BY created_at DESC
	`, string(uid))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load conversations"}
	}
	defer rows.Close()

	bySession := make(map[string][]ConversationSummary)
	for rows.Next() {
		var exID, pipeID, q, lsID string
		var created time.Time
		if err := rows.Scan(&exID, &pipeID, &q, &created, &lsID); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan execution"}
		}
		preview := q
		if len(preview) > 120 {
			preview = preview[:117] + "..."
		}
		bySession[lsID] = append(bySession[lsID], ConversationSummary{
			ExecutionID: exID,
			PipelineID:  pipeID,
			Preview:     preview,
			CreatedAt:   created,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to iterate executions"}
	}

	out := make([]SessionWithConversations, 0, len(list.Sessions))
	for _, s := range list.Sessions {
		convs := bySession[s.ID]
		if convs == nil {
			convs = []ConversationSummary{}
		}
		out = append(out, SessionWithConversations{
			Session:       s,
			Conversations: convs,
		})
	}
	return &GetSessionsWithConversationsResponse{Sessions: out}, nil
}

// ChatMessage is one turn in a stored conversation.
type ChatMessage struct {
	Role string `json:"role"` // "user" | "assistant"
	Text string `json:"text"`
}

// GetConversationMessagesResponse is the transcript for one execution.
type GetConversationMessagesResponse struct {
	SessionID   string        `json:"learning_session_id"`
	ExecutionID string        `json:"execution_id"`
	Messages    []ChatMessage `json:"messages"`
}

// GetConversationMessages returns user query + assistant reply for one execution.
//
//encore:api auth method=GET path=/learning/sessions/:sessionID/conversations/:executionID
func GetConversationMessages(ctx context.Context, sessionID string, executionID string) (*GetConversationMessagesResponse, error) {
	uid, _ := auth.UserID()
	if _, err := GetLearningSession(ctx, sessionID); err != nil {
		return nil, err
	}

	var q string
	var final sql.NullString
	err := pipelineDB.QueryRow(ctx, `
		SELECT query, final_output
		FROM pipeline_executions
		WHERE id = $1 AND user_id = $2 AND learning_session_id = $3::uuid
	`, executionID, string(uid), sessionID).Scan(&q, &final)
	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "conversation not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load conversation"}
	}

	msgs := []ChatMessage{{Role: "user", Text: q}}
	if final.Valid && final.String != "" {
		msgs = append(msgs, ChatMessage{Role: "assistant", Text: final.String})
	} else {
		msgs = append(msgs, ChatMessage{Role: "assistant", Text: ""})
	}
	return &GetConversationMessagesResponse{
		SessionID:   sessionID,
		ExecutionID: executionID,
		Messages:    msgs,
	}, nil
}

// UpdateLearningSessionParams updates editable fields.
type UpdateLearningSessionParams struct {
	Title             string `json:"title"`
	WhatToLearn       string `json:"what_to_learn"`
	HowToLearn        string `json:"how_to_learn"`
	AdditionalContext string `json:"additional_context,omitempty"`
}

// UpdateLearningSession updates a session owned by the user.
//
//encore:api auth method=PUT path=/learning/sessions/:id
func UpdateLearningSession(ctx context.Context, id string, params *UpdateLearningSessionParams) (*LearningSession, error) {
	uid, _ := auth.UserID()
	if params == nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "body required"}
	}
	if strings.TrimSpace(params.Title) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "title is required"}
	}
	if strings.TrimSpace(params.WhatToLearn) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "what_to_learn is required"}
	}
	if strings.TrimSpace(params.HowToLearn) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "how_to_learn is required"}
	}
	var add interface{}
	if strings.TrimSpace(params.AdditionalContext) != "" {
		add = params.AdditionalContext
	}
	var s LearningSession
	err := db.QueryRow(ctx, `
		UPDATE learning_sessions
		SET title = $3, what_to_learn = $4, how_to_learn = $5, additional_context = $6, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id::text, user_id, title, what_to_learn, how_to_learn, additional_context, is_active, created_at, updated_at
	`, id, string(uid), params.Title, params.WhatToLearn, params.HowToLearn, add).Scan(
		&s.ID, &s.UserID, &s.Title, &s.WhatToLearn, &s.HowToLearn, &s.AdditionalContext, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "session not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to update session"}
	}
	return &s, nil
}

// SetActiveSessionResponse confirms activation.
type SetActiveSessionResponse struct {
	Session LearningSession `json:"session"`
}

// SetActiveSession makes one session active and deactivates others.
//
//encore:api auth method=POST path=/learning/sessions/:id/activate
func SetActiveSession(ctx context.Context, id string) (*SetActiveSessionResponse, error) {
	uid, _ := auth.UserID()
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to start transaction"}
	}
	defer tx.Rollback()

	_, err = tx.Exec(ctx, `
		UPDATE learning_sessions SET is_active = false, updated_at = NOW()
		WHERE user_id = $1
	`, string(uid))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to deactivate sessions"}
	}

	var s LearningSession
	err = tx.QueryRow(ctx, `
		UPDATE learning_sessions SET is_active = true, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id::text, user_id, title, what_to_learn, how_to_learn, additional_context, is_active, created_at, updated_at
	`, id, string(uid)).Scan(
		&s.ID, &s.UserID, &s.Title, &s.WhatToLearn, &s.HowToLearn, &s.AdditionalContext, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "session not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to activate session"}
	}
	if err := tx.Commit(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to commit"}
	}
	return &SetActiveSessionResponse{Session: s}, nil
}

// DeleteLearningSessionResponse confirms deletion.
type DeleteLearningSessionResponse struct {
	OK bool `json:"ok"`
}

// DeleteLearningSession deletes a session owned by the current user and unlinks its conversations.
//
//encore:api auth method=DELETE path=/learning/sessions/:id
func DeleteLearningSession(ctx context.Context, id string) (*DeleteLearningSessionResponse, error) {
	uid, _ := auth.UserID()

	// Verify ownership
	var count int
	err := db.QueryRow(ctx, `
		SELECT COUNT(*) FROM learning_sessions WHERE id = $1 AND user_id = $2
	`, id, string(uid)).Scan(&count)
	if err != nil || count == 0 {
		return nil, &errs.Error{Code: errs.NotFound, Message: "session not found"}
	}

	// Unlink pipeline executions from this session
	_, err = pipelineDB.Exec(ctx, `
		UPDATE pipeline_executions SET learning_session_id = NULL WHERE learning_session_id = $1::uuid
	`, id)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to unlink conversations"}
	}

	// Delete the session
	_, err = db.Exec(ctx, `
		DELETE FROM learning_sessions WHERE id = $1 AND user_id = $2
	`, id, string(uid))
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to delete session"}
	}

	return &DeleteLearningSessionResponse{OK: true}, nil
}

// GetCurrentSessionContextParams is used by agents (private API).
type GetCurrentSessionContextParams struct {
	UserID string `json:"user_id"`
}

// GetCurrentSessionContextResponse is formatted text for the LLM tool.
type GetCurrentSessionContextResponse struct {
	Summary string `json:"summary"`
}

// GetCurrentSessionContext returns the active learning session as text for tools.
//
//encore:api private
func GetCurrentSessionContext(ctx context.Context, params *GetCurrentSessionContextParams) (*GetCurrentSessionContextResponse, error) {
	if params == nil || params.UserID == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "user_id is required"}
	}
	var title, what, how string
	var add sql.NullString
	err := db.QueryRow(ctx, `
		SELECT title, what_to_learn, how_to_learn, additional_context
		FROM learning_sessions
		WHERE user_id = $1 AND is_active = true
		ORDER BY updated_at DESC
		LIMIT 1
	`, params.UserID).Scan(&title, &what, &how, &add)
	if err == sql.ErrNoRows {
		return &GetCurrentSessionContextResponse{Summary: "No active learning session. The user has not set learning goals for this session."}, nil
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load learning context"}
	}
	var b strings.Builder
	b.WriteString("Current learning session:\n")
	b.WriteString("Title: ")
	b.WriteString(title)
	b.WriteString("\nWhat they want to learn: ")
	b.WriteString(what)
	b.WriteString("\nHow they want to learn: ")
	b.WriteString(how)
	if add.Valid && strings.TrimSpace(add.String) != "" {
		b.WriteString("\nAdditional context: ")
		b.WriteString(add.String)
	}
	return &GetCurrentSessionContextResponse{Summary: b.String()}, nil
}
