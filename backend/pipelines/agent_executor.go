package pipelines

import (
	"context"
	"fmt"
	"time"

	"encore.app/backend/content"
	"encore.app/backend/learning"
	"encore.dev/rlog"
	"github.com/tmc/langchaingo/agents"
	"github.com/tmc/langchaingo/callbacks"
	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/openai"
	"github.com/tmc/langchaingo/schema"
	"github.com/tmc/langchaingo/tools"
)

const openRouterBaseURL = "https://openrouter.ai/api/v1"

// StreamWriter interface for sending streaming events
type StreamWriter interface {
	WriteEvent(eventType string, data any)
}

// AgentExecutor executes an agent configuration
type AgentExecutor struct {
	config       *AgentConfig
	userID       string
	apiKey       string
	trace        *ExecutionTrace
	streamWriter StreamWriter
	graphNodeID  string
	agentReplies []AgentReply
}

// NewAgentExecutor creates a new agent executor
func NewAgentExecutor(config *AgentConfig, userID string, apiKey string) *AgentExecutor {
	return &AgentExecutor{
		config: config,
		userID: userID,
		apiKey: apiKey,
		trace:  &ExecutionTrace{Steps: []ExecutionStep{}},
	}
}

// Execute runs the agent with the given query
func (e *AgentExecutor) Execute(ctx context.Context, query string) (*AgentResult, error) {
	return e.execute(ctx, query, nil)
}

// ExecuteWithStreaming runs the agent with streaming support
func (e *AgentExecutor) ExecuteWithStreaming(ctx context.Context, query string, stream StreamWriter) (*AgentResult, error) {
	e.streamWriter = stream
	
	if stream != nil {
		stream.WriteEvent("start", map[string]string{
			"query":  query,
			"config": e.config.Name,
		})
	}
	
	return e.execute(ctx, query, stream)
}

// execute is the internal execution method
func (e *AgentExecutor) execute(ctx context.Context, query string, stream StreamWriter) (*AgentResult, error) {
	startTime := time.Now()

	// Create LLM with config settings
	llm, err := e.createLLM()
	if err != nil {
		return nil, fmt.Errorf("failed to create LLM: %w", err)
	}

	// Create tools based on available_tools
	agentTools, err := e.createTools()
	if err != nil {
		return nil, fmt.Errorf("failed to create tools: %w", err)
	}

	// Create agent with system prompt
	agentExecutor, err := agents.Initialize(
		llm,
		agentTools,
		agents.ConversationalReactDescription,
		agents.WithMaxIterations(10),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize agent: %w", err)
	}

	// Add callbacks for tracing
	var callbacksHandler callbacks.Handler
	if stream != nil {
		callbacksHandler = &agentCallbacks{
			executor: e,
			stream:   stream,
		}
	} else {
		callbacksHandler = &agentCallbacks{
			executor: e,
			stream:   nil,
		}
	}

	// Execute agent
	result, err := chains.Run(
		ctx,
		agentExecutor,
		query,
		chains.WithCallback(callbacksHandler),
	)
	if err != nil {
		return nil, fmt.Errorf("agent execution failed: %w", err)
	}

	duration := time.Since(startTime)
	
	if stream != nil {
		stream.WriteEvent("done", map[string]string{
			"duration_ms": fmt.Sprintf("%d", duration.Milliseconds()),
		})
	}

	return &AgentResult{
		Answer:        result,
		ToolCallCount: e.countToolCalls(),
	}, nil
}

// createLLM creates an LLM instance based on config
func (e *AgentExecutor) createLLM() (llms.Model, error) {
	// Support multiple model providers
	// For now, use OpenRouter for all models
	llm, err := openai.New(
		openai.WithBaseURL(openRouterBaseURL),
		openai.WithToken(e.apiKey),
		openai.WithModel(e.config.Model),
	)
	if err != nil {
		return nil, err
	}
	return llm, nil
}

// createTools creates tool instances based on tool_configs or available_tools (legacy)
func (e *AgentExecutor) createTools() ([]tools.Tool, error) {
	var toolsList []tools.Tool

	// Use ToolConfigs if available (new format)
		if len(e.config.ToolConfigs) > 0 {
		for _, tc := range e.config.ToolConfigs {
			switch tc.Name {
			case "search_chunks":
				if tc.DatasetID == "" {
					rlog.Warn("search_chunks tool missing dataset_id", "config", e.config.Name)
					continue
				}
				toolsList = append(toolsList, &searchChunksTool{
					userID:    e.userID,
					datasetID: tc.DatasetID,
					executor:  e,
				})
			case "get_learning_context":
				toolsList = append(toolsList, &learningContextTool{userID: e.userID})
			default:
				rlog.Warn("unknown tool in config", "tool", tc.Name)
			}
		}
	} else {
		// Fallback to legacy AvailableTools (without dataset_id)
		// This will fail at runtime if search_chunks is used without dataset
		for _, toolName := range e.config.AvailableTools {
			switch toolName {
			case "search_chunks":
				rlog.Warn("using legacy available_tools without dataset_id", "config", e.config.Name)
				toolsList = append(toolsList, &searchChunksTool{
					userID:    e.userID,
					datasetID: "", // Will cause error when called
					executor:  e,
				})
			case "get_learning_context":
				toolsList = append(toolsList, &learningContextTool{userID: e.userID})
			default:
				rlog.Warn("unknown tool in config", "tool", toolName)
			}
		}
	}

	return toolsList, nil
}

// countToolCalls counts how many tool calls were made
func (e *AgentExecutor) countToolCalls() int {
	count := 0
	for _, step := range e.trace.Steps {
		if step.StepType == "tool_call" {
			count++
		}
	}
	return count
}

// GetTrace returns the execution trace
func (e *AgentExecutor) GetTrace() *ExecutionTrace {
	return e.trace
}

// SetGraphNodeID sets the pipeline graph node id (for multi-agent agent_replies metadata).
func (e *AgentExecutor) SetGraphNodeID(id string) {
	e.graphNodeID = id
}

// AgentReplies returns each agent completion in order (populated in HandleAgentFinish).
func (e *AgentExecutor) AgentReplies() []AgentReply {
	return e.agentReplies
}

func (e *AgentExecutor) appendAgentReply(content string) {
	if e.config == nil {
		return
	}
	e.agentReplies = append(e.agentReplies, AgentReply{
		AgentName:   e.config.Name,
		GraphNodeID: e.graphNodeID,
		Content:     content,
	})
}

// addTraceStep adds a step to the execution trace
func (e *AgentExecutor) addTraceStep(step ExecutionStep) {
	if e.config != nil {
		step.AgentName = e.config.Name
	}
	if e.graphNodeID != "" {
		step.GraphNodeID = e.graphNodeID
	}
	e.trace.Steps = append(e.trace.Steps, step)
}

// searchChunksTool implements the search_chunks tool
type searchChunksTool struct {
	userID    string
	datasetID string
	executor  *AgentExecutor
}

func (t *searchChunksTool) Name() string {
	return "search_chunks"
}

func (t *searchChunksTool) Description() string {
	return "Search the knowledge base of embedded text chunks from the book. Use this when the user asks about the book content, chapters, or needs to find relevant passages. Input should be the search query string."
}

func (t *searchChunksTool) Call(ctx context.Context, input string) (string, error) {
	startTime := time.Now()

	if input == "" {
		return "Query is required.", nil
	}

	if t.datasetID == "" {
		output := "Tool configuration error: dataset_id is required for search_chunks"
		rlog.Error("search_chunks called without dataset_id")
		
		t.executor.addTraceStep(ExecutionStep{
			StepType:   "tool_call",
			ToolName:   "search_chunks",
			Input:      input,
			Output:     output,
			DurationMs: time.Since(startTime).Milliseconds(),
			Error:      "missing dataset_id",
			Timestamp:  time.Now(),
		})
		
		return output, nil
	}

	resp, err := content.SearchChunks(ctx, &content.SearchChunksParams{
		UserID:    t.userID,
		Query:     input,
		DatasetID: t.datasetID,
	})
	if err != nil {
		rlog.Error("search_chunks tool failed", "err", err, "dataset_id", t.datasetID)
		output := fmt.Sprintf("Search failed: %v", err)
		
		t.executor.addTraceStep(ExecutionStep{
			StepType:   "tool_call",
			ToolName:   "search_chunks",
			Input:      input,
			Output:     output,
			DurationMs: time.Since(startTime).Milliseconds(),
			Error:      err.Error(),
			Timestamp:  time.Now(),
		})
		
		return output, nil
	}

	if len(resp.Chunks) == 0 {
		output := "No relevant chunks found."
		
		if t.executor.streamWriter != nil {
			t.executor.streamWriter.WriteEvent("observation", map[string]string{"content": output})
		}
		
		t.executor.addTraceStep(ExecutionStep{
			StepType:   "tool_call",
			ToolName:   "search_chunks",
			Input:      input,
			Output:     output,
			DurationMs: time.Since(startTime).Milliseconds(),
			Timestamp:  time.Now(),
		})
		
		return output, nil
	}

	output := ""
	for i, c := range resp.Chunks {
		output += fmt.Sprintf("[%d] (paragraph %s, chunk %d): %s\n", 
			i+1, c.ParagraphID[:8], c.ChunkIndex, truncate(c.Content, 400))
	}

	if t.executor.streamWriter != nil {
		t.executor.streamWriter.WriteEvent("observation", map[string]string{"content": output})
	}

	t.executor.addTraceStep(ExecutionStep{
		StepType:   "tool_call",
		ToolName:   "search_chunks",
		Input:      input,
		Output:     output,
		DurationMs: time.Since(startTime).Milliseconds(),
		Timestamp:  time.Now(),
	})

	return output, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// learningContextTool returns the active learning session summary for the user.
type learningContextTool struct {
	userID string
}

func (t *learningContextTool) Name() string {
	return "get_learning_context"
}

func (t *learningContextTool) Description() string {
	return "Retrieves the user's current learning session: what they want to learn and how they prefer to learn. Input is ignored."
}

func (t *learningContextTool) Call(ctx context.Context, input string) (string, error) {
	resp, err := learning.GetCurrentSessionContext(ctx, &learning.GetCurrentSessionContextParams{UserID: t.userID})
	if err != nil {
		return "", err
	}
	return resp.Summary, nil
}

// agentCallbacks handles agent execution callbacks for tracing and streaming
type agentCallbacks struct {
	executor *AgentExecutor
	stream   StreamWriter
}

func (c *agentCallbacks) HandleAgentAction(ctx context.Context, action schema.AgentAction) {
	if c.stream != nil {
		c.stream.WriteEvent("step", map[string]string{
			"tool":       action.Tool,
			"tool_input": action.ToolInput,
			"log":        action.Log,
		})
	}
	if action.Log != "" {
		c.executor.addTraceStep(ExecutionStep{
			StepType:  "reasoning",
			Output:    action.Log,
			Timestamp: time.Now(),
		})
	}
}

func (c *agentCallbacks) HandleAgentFinish(ctx context.Context, finish schema.AgentFinish) {
	outStr := ""
	if out, ok := finish.ReturnValues["output"].(string); ok {
		outStr = out
	}
	if c.stream != nil && outStr != "" {
		c.stream.WriteEvent("reply", map[string]string{"content": outStr})
	}
	c.executor.appendAgentReply(outStr)
	c.executor.addTraceStep(ExecutionStep{
		StepType:  "agent_output",
		Output:    outStr,
		Timestamp: time.Now(),
	})
}

func (c *agentCallbacks) HandleStreamingFunc(context.Context, []byte)                          {}
func (c *agentCallbacks) HandleText(context.Context, string)                                   {}
func (c *agentCallbacks) HandleLLMStart(context.Context, []string)                             {}
func (c *agentCallbacks) HandleLLMGenerateContentStart(context.Context, []llms.MessageContent) {}
func (c *agentCallbacks) HandleLLMGenerateContentEnd(context.Context, *llms.ContentResponse)   {}
func (c *agentCallbacks) HandleLLMError(context.Context, error)                                {}
func (c *agentCallbacks) HandleChainStart(context.Context, map[string]any)                     {}
func (c *agentCallbacks) HandleChainEnd(context.Context, map[string]any)                       {}
func (c *agentCallbacks) HandleChainError(context.Context, error)                              {}
func (c *agentCallbacks) HandleToolStart(context.Context, string)                              {}
func (c *agentCallbacks) HandleToolEnd(context.Context, string)                                {}
func (c *agentCallbacks) HandleToolError(context.Context, error)                               {}
func (c *agentCallbacks) HandleRetrieverStart(context.Context, string)                         {}
func (c *agentCallbacks) HandleRetrieverEnd(context.Context, string, []schema.Document)        {}
