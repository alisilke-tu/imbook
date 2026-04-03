package pipelines

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	a "encore.app/backend/auth"
	"encore.dev/beta/errs"
	"encore.dev/storage/sqldb"
	"github.com/lib/pq"
)

// AdminChatSummary is one stored pipeline chat run for list views.
type AdminChatSummary struct {
	ID              string `json:"id"`
	PipelineID      string `json:"pipeline_id"`
	PipelineName    string `json:"pipeline_name"`
	UserID          string `json:"user_id"`
	UserEmail       string `json:"user_email,omitempty"`
	QueryPreview    string `json:"query_preview"`
	Success         bool   `json:"success"`
	TotalDurationMs int    `json:"total_duration_ms"`
	CreatedAt       string `json:"created_at"`
}

// AdminChatDetail is full stored execution for admin review.
type AdminChatDetail struct {
	ID              string           `json:"id"`
	PipelineID      string           `json:"pipeline_id"`
	PipelineName    string           `json:"pipeline_name"`
	UserID          string           `json:"user_id"`
	UserEmail       string           `json:"user_email,omitempty"`
	Query           string           `json:"query"`
	FinalOutput     *string          `json:"final_output,omitempty"`
	ExecutionPath   []string         `json:"execution_path,omitempty"`
	AgentReplies    []AgentReply     `json:"agent_replies,omitempty"`
	Trace           []ExecutionStep  `json:"trace,omitempty"`
	TotalDurationMs int              `json:"total_duration_ms"`
	Success         bool             `json:"success"`
	ErrorMessage    *string          `json:"error_message,omitempty"`
	CreatedAt       string           `json:"created_at"`
}

// ListAdminChatsParams filters and pagination for admin chat history.
type ListAdminChatsParams struct {
	UserID string `query:"user_id"`
	Limit  int    `query:"limit"`
	Offset int    `query:"offset"`
}

// ListAdminChatsResponse lists stored pipeline executions (chat runs).
type ListAdminChatsResponse struct {
	Sessions   []AdminChatSummary `json:"sessions"`
	NextOffset int                `json:"next_offset"`
	HasMore    bool               `json:"has_more"`
}

// AdminChatThreadSummary groups all turns for one user + workflow (scrollable conversation).
type AdminChatThreadSummary struct {
	UserID        string `json:"user_id"`
	PipelineID    string `json:"pipeline_id"`
	PipelineName  string `json:"pipeline_name"`
	UserEmail     string `json:"user_email,omitempty"`
	TurnCount     int    `json:"turn_count"`
	StartedAt     string `json:"started_at"`
	LastMessageAt string `json:"last_message_at"`
}

// ListAdminChatThreadsParams paginates grouped conversations.
type ListAdminChatThreadsParams struct {
	UserID string `query:"user_id"`
	Limit  int    `query:"limit"`
	Offset int    `query:"offset"`
}

// ListAdminChatThreadsResponse lists conversation threads (user + pipeline).
type ListAdminChatThreadsResponse struct {
	Threads    []AdminChatThreadSummary `json:"threads"`
	NextOffset int                      `json:"next_offset"`
	HasMore    bool                     `json:"has_more"`
}

// AdminConversationTurn is one user message and assistant reply in order.
type AdminConversationTurn struct {
	ID              string  `json:"id"`
	Query           string  `json:"query"`
	FinalOutput     *string `json:"final_output,omitempty"`
	Success         bool    `json:"success"`
	ErrorMessage    *string `json:"error_message,omitempty"`
	TotalDurationMs int     `json:"total_duration_ms"`
	CreatedAt       string  `json:"created_at"`
}

// AdminConversation is the full chronological transcript for a thread.
type AdminConversation struct {
	UserID       string                  `json:"user_id"`
	PipelineID   string                  `json:"pipeline_id"`
	PipelineName string                  `json:"pipeline_name"`
	UserEmail    string                  `json:"user_email,omitempty"`
	Turns        []AdminConversationTurn `json:"turns"`
}

// GetAdminConversationParams identifies a thread (user + pipeline).
type GetAdminConversationParams struct {
	UserID     string `query:"user_id"`
	PipelineID string `query:"pipeline_id"`
}

func previewQuery(q string, max int) string {
	q = strings.TrimSpace(q)
	runes := []rune(q)
	if len(runes) <= max {
		return q
	}
	return string(runes[:max]) + "…"
}

func userEmailsForIDs(ctx context.Context, userIDs []string) (map[string]string, error) {
	out := make(map[string]string)
	if len(userIDs) == 0 {
		return out, nil
	}
	rows, err := authDB.Query(ctx, `
		SELECT firebase_uid, COALESCE(email, '')
		FROM users
		WHERE firebase_uid = ANY($1)
	`, pq.Array(userIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid, email string
		if err := rows.Scan(&uid, &email); err != nil {
			return nil, err
		}
		out[uid] = email
	}
	return out, rows.Err()
}

// ListAdminChats returns stored pipeline chat executions for administrators.
//
//encore:api auth method=GET path=/pipelines/admin/chats
func ListAdminChats(ctx context.Context, params *ListAdminChatsParams) (*ListAdminChatsResponse, error) {
	if !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}
	if params == nil {
		params = &ListAdminChatsParams{}
	}
	limit := params.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := params.Offset
	if offset < 0 {
		offset = 0
	}

	fetch := limit + 1
	userFilter := strings.TrimSpace(params.UserID)

	var rows *sqldb.Rows
	var err error
	if userFilter != "" {
		rows, err = pipelineDB.Query(ctx, `
			SELECT pe.id, pe.pipeline_id, COALESCE(p.name, ''), pe.user_id, pe.query, pe.success,
			       pe.total_duration_ms, pe.created_at
			FROM pipeline_executions pe
			LEFT JOIN pipelines p ON p.id = pe.pipeline_id
			WHERE pe.user_id = $1
			ORDER BY pe.created_at DESC
			OFFSET $2 LIMIT $3
		`, userFilter, offset, fetch)
	} else {
		rows, err = pipelineDB.Query(ctx, `
			SELECT pe.id, pe.pipeline_id, COALESCE(p.name, ''), pe.user_id, pe.query, pe.success,
			       pe.total_duration_ms, pe.created_at
			FROM pipeline_executions pe
			LEFT JOIN pipelines p ON p.id = pe.pipeline_id
			ORDER BY pe.created_at DESC
			OFFSET $1 LIMIT $2
		`, offset, fetch)
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to list chats"}
	}
	defer rows.Close()

	type rowT struct {
		id, pipelineID, pipelineName, userID, query string
		success                                     bool
		totalMs                                     int
		createdAt                                   time.Time
	}
	var list []rowT
	for rows.Next() {
		var r rowT
		if err := rows.Scan(&r.id, &r.pipelineID, &r.pipelineName, &r.userID, &r.query, &r.success, &r.totalMs, &r.createdAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chats"}
		}
		list = append(list, r)
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to list chats"}
	}

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}

	userIDs := make([]string, 0, len(list))
	seen := map[string]struct{}{}
	for _, r := range list {
		if _, ok := seen[r.userID]; ok {
			continue
		}
		seen[r.userID] = struct{}{}
		userIDs = append(userIDs, r.userID)
	}
	emails, err := userEmailsForIDs(ctx, userIDs)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to resolve users"}
	}

	sessions := make([]AdminChatSummary, 0, len(list))
	for _, r := range list {
		sessions = append(sessions, AdminChatSummary{
			ID:              r.id,
			PipelineID:      r.pipelineID,
			PipelineName:    r.pipelineName,
			UserID:          r.userID,
			UserEmail:       emails[r.userID],
			QueryPreview:    previewQuery(r.query, 200),
			Success:         r.success,
			TotalDurationMs: r.totalMs,
			CreatedAt:       r.createdAt.UTC().Format(time.RFC3339),
		})
	}

	nextOffset := offset
	if hasMore {
		nextOffset = offset + limit
	}

	return &ListAdminChatsResponse{
		Sessions:   sessions,
		NextOffset: nextOffset,
		HasMore:    hasMore,
	}, nil
}

// GetAdminChat returns one stored execution with full trace data for administrators.
//
//encore:api auth method=GET path=/pipelines/admin/chats/:id
func GetAdminChat(ctx context.Context, id string) (*AdminChatDetail, error) {
	if !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}
	if id == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "id is required"}
	}

	var (
		pipelineID, pipelineName, userID, query string
		finalOut                                sql.NullString
		pathRaw                                 []byte
		agentRaw, traceRaw                      []byte
		totalMs                                 int
		success                                 bool
		errMsg                                  sql.NullString
		createdAt                               time.Time
	)

	err := pipelineDB.QueryRow(ctx, `
		SELECT pe.pipeline_id, COALESCE(p.name, ''), pe.user_id, pe.query, pe.final_output,
		       pe.execution_path, pe.agent_replies, pe.trace, pe.total_duration_ms, pe.success, pe.error_message, pe.created_at
		FROM pipeline_executions pe
		LEFT JOIN pipelines p ON p.id = pe.pipeline_id
		WHERE pe.id = $1
	`, id).Scan(&pipelineID, &pipelineName, &userID, &query, &finalOut, &pathRaw, &agentRaw, &traceRaw, &totalMs, &success, &errMsg, &createdAt)

	if err == sql.ErrNoRows {
		return nil, &errs.Error{Code: errs.NotFound, Message: "chat session not found"}
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load chat"}
	}

	var execPath []string
	if len(pathRaw) > 0 {
		_ = json.Unmarshal(pathRaw, &execPath)
	}
	var agentReplies []AgentReply
	if len(agentRaw) > 0 {
		_ = json.Unmarshal(agentRaw, &agentReplies)
	}
	var trace []ExecutionStep
	if len(traceRaw) > 0 {
		_ = json.Unmarshal(traceRaw, &trace)
	}

	var email string
	_ = authDB.QueryRow(ctx, `SELECT COALESCE(email, '') FROM users WHERE firebase_uid = $1`, userID).Scan(&email)

	detail := &AdminChatDetail{
		ID:              id,
		PipelineID:      pipelineID,
		PipelineName:    pipelineName,
		UserID:          userID,
		UserEmail:       email,
		Query:           query,
		ExecutionPath:   execPath,
		AgentReplies:    agentReplies,
		Trace:           trace,
		TotalDurationMs: totalMs,
		Success:         success,
		CreatedAt:       createdAt.UTC().Format(time.RFC3339),
	}
	if finalOut.Valid {
		detail.FinalOutput = &finalOut.String
	}
	if errMsg.Valid {
		detail.ErrorMessage = &errMsg.String
	}
	return detail, nil
}

// ListAdminChatThreads returns conversations grouped by user and workflow (chronological turns load separately).
//
//encore:api auth method=GET path=/pipelines/admin/chat-threads
func ListAdminChatThreads(ctx context.Context, params *ListAdminChatThreadsParams) (*ListAdminChatThreadsResponse, error) {
	if !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}
	if params == nil {
		params = &ListAdminChatThreadsParams{}
	}
	limit := params.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := params.Offset
	if offset < 0 {
		offset = 0
	}
	fetch := limit + 1
	userFilter := strings.TrimSpace(params.UserID)

	var rows *sqldb.Rows
	var err error
	if userFilter != "" {
		rows, err = pipelineDB.Query(ctx, `
			SELECT pe.user_id, pe.pipeline_id, COALESCE(MAX(p.name), '') AS pipeline_name,
			       COUNT(*)::bigint AS turn_count,
			       MIN(pe.created_at) AS started_at,
			       MAX(pe.created_at) AS last_message_at
			FROM pipeline_executions pe
			LEFT JOIN pipelines p ON p.id = pe.pipeline_id
			WHERE pe.user_id = $1
			GROUP BY pe.user_id, pe.pipeline_id
			ORDER BY MAX(pe.created_at) DESC
			OFFSET $2 LIMIT $3
		`, userFilter, offset, fetch)
	} else {
		rows, err = pipelineDB.Query(ctx, `
			SELECT pe.user_id, pe.pipeline_id, COALESCE(MAX(p.name), '') AS pipeline_name,
			       COUNT(*)::bigint AS turn_count,
			       MIN(pe.created_at) AS started_at,
			       MAX(pe.created_at) AS last_message_at
			FROM pipeline_executions pe
			LEFT JOIN pipelines p ON p.id = pe.pipeline_id
			GROUP BY pe.user_id, pe.pipeline_id
			ORDER BY MAX(pe.created_at) DESC
			OFFSET $1 LIMIT $2
		`, offset, fetch)
	}
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to list chat threads"}
	}
	defer rows.Close()

	type rowT struct {
		userID, pipelineID, pipelineName string
		turnCount                        int64
		startedAt, lastAt                time.Time
	}
	var list []rowT
	for rows.Next() {
		var r rowT
		if err := rows.Scan(&r.userID, &r.pipelineID, &r.pipelineName, &r.turnCount, &r.startedAt, &r.lastAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan chat threads"}
		}
		list = append(list, r)
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to list chat threads"}
	}

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}

	userIDs := make([]string, 0, len(list))
	seen := map[string]struct{}{}
	for _, r := range list {
		if _, ok := seen[r.userID]; ok {
			continue
		}
		seen[r.userID] = struct{}{}
		userIDs = append(userIDs, r.userID)
	}
	emails, err := userEmailsForIDs(ctx, userIDs)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to resolve users"}
	}

	threads := make([]AdminChatThreadSummary, 0, len(list))
	for _, r := range list {
		threads = append(threads, AdminChatThreadSummary{
			UserID:        r.userID,
			PipelineID:    r.pipelineID,
			PipelineName:  r.pipelineName,
			UserEmail:     emails[r.userID],
			TurnCount:     int(r.turnCount),
			StartedAt:     r.startedAt.UTC().Format(time.RFC3339),
			LastMessageAt: r.lastAt.UTC().Format(time.RFC3339),
		})
	}

	nextOffset := offset
	if hasMore {
		nextOffset = offset + limit
	}

	return &ListAdminChatThreadsResponse{
		Threads:    threads,
		NextOffset: nextOffset,
		HasMore:    hasMore,
	}, nil
}

// GetAdminConversation returns all turns for one user + workflow, oldest first (full transcript).
//
//encore:api auth method=GET path=/pipelines/admin/chat-conversation
func GetAdminConversation(ctx context.Context, params *GetAdminConversationParams) (*AdminConversation, error) {
	if !a.IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}
	if params == nil || strings.TrimSpace(params.UserID) == "" || strings.TrimSpace(params.PipelineID) == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "user_id and pipeline_id are required"}
	}
	uid := strings.TrimSpace(params.UserID)
	pid := strings.TrimSpace(params.PipelineID)

	rows, err := pipelineDB.Query(ctx, `
		SELECT pe.id, pe.query, pe.final_output, pe.success, pe.error_message, pe.total_duration_ms, pe.created_at,
		       COALESCE(p.name, '')
		FROM pipeline_executions pe
		LEFT JOIN pipelines p ON p.id = pe.pipeline_id
		WHERE pe.user_id = $1 AND pe.pipeline_id = $2
		ORDER BY pe.created_at ASC
	`, uid, pid)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load conversation"}
	}
	defer rows.Close()

	var (
		turns        []AdminConversationTurn
		pipelineName string
	)
	for rows.Next() {
		var (
			id, query string
			finalOut  sql.NullString
			success   bool
			errMsg    sql.NullString
			totalMs   int
			createdAt time.Time
			pName     string
		)
		if err := rows.Scan(&id, &query, &finalOut, &success, &errMsg, &totalMs, &createdAt, &pName); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan conversation"}
		}
		if pipelineName == "" {
			pipelineName = pName
		}
		t := AdminConversationTurn{
			ID:              id,
			Query:           query,
			Success:         success,
			TotalDurationMs: totalMs,
			CreatedAt:       createdAt.UTC().Format(time.RFC3339),
		}
		if finalOut.Valid {
			s := finalOut.String
			t.FinalOutput = &s
		}
		if errMsg.Valid {
			s := errMsg.String
			t.ErrorMessage = &s
		}
		turns = append(turns, t)
	}
	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to load conversation"}
	}

	var email string
	_ = authDB.QueryRow(ctx, `SELECT COALESCE(email, '') FROM users WHERE firebase_uid = $1`, uid).Scan(&email)

	return &AdminConversation{
		UserID:       uid,
		PipelineID:   pid,
		PipelineName: pipelineName,
		UserEmail:    email,
		Turns:        turns,
	}, nil
}
