package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"encore.app/backend/content"
	"encore.app/backend/learning"
	"encore.app/backend/pipelines"
	"encore.app/backend/settings"
	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/rlog"
	"github.com/tmc/langchaingo/agents"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/openai"
	"github.com/tmc/langchaingo/schema"
	"github.com/tmc/langchaingo/tools"
)

const openRouterBaseURL = "https://openrouter.ai/api/v1"
const openRouterChatModel = "google/gemini-2.0-flash-001"

// streamEventKey is the context key for the SSE stream writer (used so the tool can send observations).
type streamEventKey struct{}

// streamWriter sends SSE events to the client. Used by the streaming endpoint and the tool.
type streamWriter interface {
	WriteEvent(eventType string, data any)
}

// searchChunksTool is a tool that calls the content service to search embedded chunks.
// NOTE: This is a legacy implementation for standalone chat. 
// TODO: Add user setting for default_dataset_id to make this work with versioned datasets.
type searchChunksTool struct {
	userID    string
	datasetID string // Required - should be set from user settings
}

func (t *searchChunksTool) Name() string {
	return "search_chunks"
}

func (t *searchChunksTool) Description() string {
	return "Search the knowledge base of embedded text chunks from the book. Use this when the user asks about the book content, chapters, or needs to find relevant passages. Input should be the search query string."
}

func (t *searchChunksTool) Call(ctx context.Context, input string) (string, error) {
	if input == "" {
		return "Query is required.", nil
	}
	
	// Check if dataset_id is configured
	if t.datasetID == "" {
		rlog.Warn("search_chunks called without dataset_id in standalone chat")
		return "Knowledge base search is not configured. Please use pipeline-based chat with configured datasets.", nil
	}
	
	resp, err := content.SearchChunks(ctx, &content.SearchChunksParams{
		UserID:    t.userID,
		Query:     input,
		DatasetID: t.datasetID,
	})
	if err != nil {
		rlog.Error("search_chunks tool failed", "err", err, "dataset_id", t.datasetID)
		return fmt.Sprintf("Search failed: %v", err), nil
	}
	if len(resp.Chunks) == 0 {
		out := "No relevant chunks found."
		if w, _ := ctx.Value(streamEventKey{}).(streamWriter); w != nil {
			w.WriteEvent("observation", map[string]string{"content": out})
		}
		return out, nil
	}
	out := ""
	for i, c := range resp.Chunks {
		out += fmt.Sprintf("[%d] (paragraph %s, chunk %d): %s\n", i+1, c.ParagraphID[:8], c.ChunkIndex, truncate(c.Content, 400))
	}
	if w, _ := ctx.Value(streamEventKey{}).(streamWriter); w != nil {
		w.WriteEvent("observation", map[string]string{"content": out})
	}
	return out, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// streamingCallbacks sends agent steps and final reply as SSE events.
type streamingCallbacks struct {
	w streamWriter
}

func (s *streamingCallbacks) HandleAgentAction(ctx context.Context, action schema.AgentAction) {
	s.w.WriteEvent("step", map[string]string{
		"tool":      action.Tool,
		"tool_input": action.ToolInput,
		"log":       action.Log,
	})
}

func (s *streamingCallbacks) HandleAgentFinish(ctx context.Context, finish schema.AgentFinish) {
	if out, ok := finish.ReturnValues["output"].(string); ok && out != "" {
		s.w.WriteEvent("reply", map[string]string{"content": out})
	}
}

func (s *streamingCallbacks) HandleStreamingFunc(context.Context, []byte) {}
func (s *streamingCallbacks) HandleText(context.Context, string) {}
func (s *streamingCallbacks) HandleLLMStart(context.Context, []string) {}
func (s *streamingCallbacks) HandleLLMGenerateContentStart(ctx context.Context, _ []llms.MessageContent) {}
func (s *streamingCallbacks) HandleLLMGenerateContentEnd(ctx context.Context, _ *llms.ContentResponse)   {}
func (s *streamingCallbacks) HandleLLMError(context.Context, error) {}
func (s *streamingCallbacks) HandleChainStart(context.Context, map[string]any) {}
func (s *streamingCallbacks) HandleChainEnd(context.Context, map[string]any) {}
func (s *streamingCallbacks) HandleChainError(context.Context, error) {}
func (s *streamingCallbacks) HandleToolStart(context.Context, string) {}
func (s *streamingCallbacks) HandleToolEnd(context.Context, string) {}
func (s *streamingCallbacks) HandleToolError(context.Context, error) {}
func (s *streamingCallbacks) HandleRetrieverStart(context.Context, string) {}
func (s *streamingCallbacks) HandleRetrieverEnd(context.Context, string, []schema.Document) {}

// sseResponseWriter writes SSE events to an http.ResponseWriter.
type sseResponseWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
	enc     *json.Encoder
}

func newSSEResponseWriter(w http.ResponseWriter) (*sseResponseWriter, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("response writer does not support flushing")
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	return &sseResponseWriter{w: w, flusher: flusher}, nil
}

func (s *sseResponseWriter) WriteEvent(eventType string, data any) {
	payload := map[string]any{"type": eventType}
	if data != nil {
		payload["data"] = data
	}
	body, _ := json.Marshal(payload)
	s.w.Write([]byte("data: "))
	s.w.Write(body)
	s.w.Write([]byte("\n\n"))
	s.flusher.Flush()
}

// ChatParams are the parameters for the chat endpoint.
type ChatParams struct {
	Message string `json:"message"`
}

// ChatStep represents one step of the agent's thinking (tool use + observation).
type ChatStep struct {
	Tool        string `json:"tool"`
	ToolInput   string `json:"tool_input"`
	Observation string `json:"observation"`
	Log         string `json:"log,omitempty"`
}

// ChatResponse is the response from the chat endpoint.
type ChatResponse struct {
	Reply string     `json:"reply"`
	Steps []ChatStep `json:"steps,omitempty"`
}

// Chat sends a message to the agent and returns the reply. The agent may use the search_chunks tool to query embedded chunks. Requires authentication.
//
//encore:api auth method=POST path=/chat
func Chat(ctx context.Context, params *ChatParams) (*ChatResponse, error) {
	if params == nil || params.Message == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "message is required"}
	}
	uid, _ := auth.UserID()
	apiKeyResp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{UserID: string(uid)})
	if err != nil {
		if errs.Code(err) == errs.NotFound {
			return nil, &errs.Error{Code: errs.FailedPrecondition, Message: "Set your OpenRouter API key in Settings."}
		}
		return nil, err
	}
	llm, err := openai.New(
		openai.WithBaseURL(openRouterBaseURL),
		openai.WithToken(apiKeyResp.Key),
		openai.WithModel(openRouterChatModel),
	)
	if err != nil {
		rlog.Error("failed to create llm", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create model"}
	}
	// TODO: Get default_dataset_id from user settings
	// For now, search tool will return a message that it's not configured
	searchTool := &searchChunksTool{userID: string(uid), datasetID: ""}
	agentTools := []tools.Tool{searchTool}
	agent := agents.NewOneShotAgent(llm, agentTools)
	executor := agents.NewExecutor(agent, agents.WithReturnIntermediateSteps())
	inputValues := map[string]any{"input": params.Message}
	result, err := executor.Call(ctx, inputValues)
	if err != nil {
		rlog.Error("executor call failed", "err", err)
		return nil, &errs.Error{Code: errs.Internal, Message: "agent failed"}
	}
	output, _ := result["output"].(string)
	if output == "" {
		output = "I couldn't generate a response."
	}
	resp := &ChatResponse{Reply: output}
	if stepsVal, ok := result["intermediateSteps"]; ok {
		if steps, ok := stepsVal.([]schema.AgentStep); ok {
			for _, s := range steps {
				resp.Steps = append(resp.Steps, ChatStep{
					Tool:        s.Action.Tool,
					ToolInput:   s.Action.ToolInput,
					Observation: s.Observation,
					Log:         s.Action.Log,
				})
			}
		}
	}
	return resp, nil
}

// streamChatBody is the JSON body for the streaming chat endpoint.
type streamChatBody struct {
	Message string `json:"message"`
}

// ChatStream streams agent steps and the final reply as SSE. Requires authentication.
//
//encore:api auth raw method=POST path=/chat/stream
func ChatStream(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	uid, _ := auth.UserID()
	if uid == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body streamChatBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Message == "" {
		http.Error(w, "bad request: message required", http.StatusBadRequest)
		return
	}
	apiKeyResp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{UserID: string(uid)})
	if err != nil {
		if errs.Code(err) == errs.NotFound {
			http.Error(w, "set OpenRouter API key in Settings", http.StatusPreconditionFailed)
			return
		}
		http.Error(w, "failed to get API key", http.StatusInternalServerError)
		return
	}
	llm, err := openai.New(
		openai.WithBaseURL(openRouterBaseURL),
		openai.WithToken(apiKeyResp.Key),
		openai.WithModel(openRouterChatModel),
	)
	if err != nil {
		rlog.Error("failed to create llm", "err", err)
		http.Error(w, "failed to create model", http.StatusInternalServerError)
		return
	}
	sse, err := newSSEResponseWriter(w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	streamCb := &streamingCallbacks{w: sse}
	// TODO: Get default_dataset_id from user settings
	// For now, search tool will return a message that it's not configured
	searchTool := &searchChunksTool{userID: string(uid), datasetID: ""}
	agentTools := []tools.Tool{searchTool}
	agent := agents.NewOneShotAgent(llm, agentTools)
	executor := agents.NewExecutor(agent, agents.WithReturnIntermediateSteps(), agents.WithCallbacksHandler(streamCb))
	ctx = context.WithValue(ctx, streamEventKey{}, sse)
	inputValues := map[string]any{"input": body.Message}
	result, err := executor.Call(ctx, inputValues)
	if err != nil {
		rlog.Error("chat stream executor failed", "err", err)
		sse.WriteEvent("error", map[string]string{"message": err.Error()})
		sse.WriteEvent("done", nil)
		return
	}
	// Reply is already sent by HandleAgentFinish when the agent finishes
	_ = result
	sse.WriteEvent("done", nil)
}

// ChatPipelineParams for pipeline-powered chat
type ChatPipelineParams struct {
	Message             string  `json:"message"`
	PipelineID          string  `json:"pipeline_id"` // Optional; uses first available workflow if empty
	LearningSessionID   *string `json:"learning_session_id,omitempty"`
}

// ChatPipelineResponse includes execution metadata
type ChatPipelineResponse struct {
	Reply        string                  `json:"reply"`
	ChunksUsed   int                     `json:"chunks_used"`
	ConfigUsed   string                  `json:"config_used"`
	Trace        []pipelines.ExecutionStep `json:"trace,omitempty"`
	AgentReplies []pipelines.AgentReply  `json:"agent_replies,omitempty"`
}

// ChatWithPipeline executes chat using a saved workflow (pipeline graph).
//
//encore:api auth method=POST path=/chat/pipeline
func ChatWithPipeline(ctx context.Context, params *ChatPipelineParams) (*ChatPipelineResponse, error) {
	if params == nil || params.Message == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "message is required"}
	}

	pipelineID := params.PipelineID
	if pipelineID == "" {
		var err error
		pipelineID, err = pipelines.GetFirstPipelineIDForUser(ctx)
		if err != nil {
			return nil, err
		}
	}

	lsID := resolveLearningSessionID(ctx, params.LearningSessionID)
	execResult, err := pipelines.ExecutePipeline(ctx, pipelineID, &pipelines.ExecutePipelineParams{
		Query:             params.Message,
		LearningSessionID: lsID,
	})
	if err != nil {
		return nil, err
	}

	reply := ""
	if execResult.FinalOutput != nil {
		reply = *execResult.FinalOutput
	}

	detail, err := pipelines.GetPipeline(ctx, pipelineID)
	name := pipelineID
	if err == nil && detail != nil {
		name = detail.Pipeline.Name
	}

	return &ChatPipelineResponse{
		Reply:        reply,
		ChunksUsed:   0,
		ConfigUsed:   name,
		Trace:        nil,
		AgentReplies: execResult.AgentReplies,
	}, nil
}

// StreamPipeline streams chat responses by executing a saved workflow (pipeline graph).
//
//encore:api auth raw method=POST path=/chat/pipeline/stream
func StreamPipeline(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()
	uid, _ := auth.UserID()

	var params ChatPipelineParams
	if err := json.NewDecoder(req.Body).Decode(&params); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if params.Message == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}

	pipelineID := params.PipelineID
	if pipelineID == "" {
		var err error
		pipelineID, err = pipelines.GetFirstPipelineIDForUser(ctx)
		if err != nil {
			code := http.StatusPreconditionFailed
			if errs.Code(err) != errs.FailedPrecondition {
				code = http.StatusInternalServerError
			}
			http.Error(w, err.Error(), code)
			return
		}
	}

	apiKeyResp, err := settings.GetGeminiKey(ctx, &settings.GetGeminiKeyParams{UserID: string(uid)})
	if err != nil {
		if errs.Code(err) == errs.NotFound {
			http.Error(w, "API key not configured", http.StatusPreconditionFailed)
			return
		}
		http.Error(w, "failed to get API key", http.StatusInternalServerError)
		return
	}

	lsID := resolveLearningSessionID(ctx, params.LearningSessionID)
	executor, err := pipelines.LoadPipelineExecutor(ctx, pipelineID, string(uid), apiKeyResp.Key, lsID)
	if err != nil {
		code := http.StatusInternalServerError
		switch errs.Code(err) {
		case errs.NotFound:
			code = http.StatusNotFound
		case errs.FailedPrecondition:
			code = http.StatusPreconditionFailed
		}
		http.Error(w, err.Error(), code)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	stream := &sseWriter{w: w, flusher: flusher}

	execution, trace, agentReplies, err := executor.ExecuteWithStreaming(ctx, params.Message, stream)
	if execution != nil {
		_ = pipelines.PersistPipelineExecution(ctx, execution)
	}
	if err != nil {
		stream.WriteEvent("error", map[string]string{"message": err.Error()})
		return
	}

	reply := ""
	if execution != nil && execution.FinalOutput != nil {
		reply = *execution.FinalOutput
	}

	toolCalls := 0
	for _, step := range trace {
		if step.StepType == "tool_call" {
			toolCalls++
		}
	}

	stream.WriteEvent("done", map[string]interface{}{
		"reply":         reply,
		"tool_calls":    toolCalls,
		"tokens_used":   0,
		"trace":         trace,
		"agent_replies": agentReplies,
	})
}

// sseWriter implements streamWriter for SSE
type sseWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

func (s *sseWriter) WriteEvent(eventType string, data any) {
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", eventType, jsonData)
	s.flusher.Flush()
}

// resolveLearningSessionID uses an explicit id from the client, or the user's active learning session.
func resolveLearningSessionID(ctx context.Context, explicit *string) *string {
	if explicit != nil && strings.TrimSpace(*explicit) != "" {
		return explicit
	}
	sess, err := learning.GetActiveLearningSession(ctx)
	if err != nil {
		return nil
	}
	id := sess.ID
	return &id
}
