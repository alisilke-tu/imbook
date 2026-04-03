package pipelines

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"encore.dev/rlog"
)

// agentStreamFilter forwards agent streaming events to the outer pipeline stream but suppresses
// the inner agent's start/done events so the client sees one pipeline-level completion.
type agentStreamFilter struct {
	inner StreamWriter
}

func (f *agentStreamFilter) WriteEvent(eventType string, data any) {
	if eventType == "start" || eventType == "done" {
		return
	}
	f.inner.WriteEvent(eventType, data)
}

// agentStreamContext wraps agent SSE events with the pipeline node and config name so the UI
// can show which agent in a multi-step workflow produced each thought/tool call.
type agentStreamContext struct {
	inner     StreamWriter
	agentName string
	nodeID    string
}

func (a *agentStreamContext) WriteEvent(eventType string, data any) {
	if eventType == "start" || eventType == "done" {
		return
	}
	data = withAgentStreamMeta(data, a.agentName, a.nodeID)
	a.inner.WriteEvent(eventType, data)
}

func withAgentStreamMeta(data any, agentName, nodeID string) any {
	m, ok := data.(map[string]string)
	if !ok {
		return data
	}
	out := make(map[string]string, len(m)+3)
	for k, v := range m {
		out[k] = v
	}
	if agentName != "" {
		out["agent_name"] = agentName
	}
	if nodeID != "" {
		out["graph_node_id"] = nodeID
	}
	return out
}

func truncateForPipelineTrace(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "\n… [truncated]"
}

// pipelineAgentStartStep is inserted before each agent so the trace shows every agent segment
// and what prior output was passed into this node.
func pipelineAgentStartStep(config *AgentConfig, nodeID, prevOut string) ExecutionStep {
	var out string
	if strings.TrimSpace(prevOut) == "" {
		out = fmt.Sprintf("Starting agent %q on graph node %s. No prior agent output (first agent in this run).", config.Name, nodeID)
	} else {
		out = fmt.Sprintf("Starting agent %q on graph node %s.\n\nPrevious agent output passed into this agent:\n%s",
			config.Name, nodeID, truncateForPipelineTrace(prevOut, 8000))
	}
	return ExecutionStep{
		StepType:    "pipeline_agent_start",
		AgentName:   config.Name,
		GraphNodeID: nodeID,
		Output:      out,
		Timestamp:   time.Now(),
	}
}

// agentInputForNode builds the user message for this agent: later agents receive the original question plus prior output.
func (pe *PipelineExecutor) agentInputForNode(execContext map[string]interface{}, originalQuery string) string {
	prev, _ := execContext["previous_output"].(string)
	if strings.TrimSpace(prev) == "" {
		return originalQuery
	}
	return fmt.Sprintf("User question: %s\n\nOutput from the previous agent in this pipeline:\n%s", originalQuery, prev)
}

type PipelineExecutor struct {
	pipeline            *Pipeline
	nodes               map[string]*PipelineNode
	edges               []PipelineEdge
	configs             map[string]*AgentConfig
	userID              string
	apiKey              string
	learningSessionID   *string
}

func NewPipelineExecutor(pipeline *Pipeline, nodes []PipelineNode, edges []PipelineEdge, configs map[string]*AgentConfig, userID, apiKey string, learningSessionID *string) *PipelineExecutor {
	nodeMap := make(map[string]*PipelineNode)
	for i := range nodes {
		n := nodes[i]
		nodeMap[n.ID] = &n
	}
	return &PipelineExecutor{
		pipeline:          pipeline,
		nodes:             nodeMap,
		edges:             edges,
		configs:           configs,
		userID:            userID,
		apiKey:            apiKey,
		learningSessionID: learningSessionID,
	}
}

func (pe *PipelineExecutor) Execute(ctx context.Context, query string) (*PipelineExecution, error) {
	startTime := time.Now()
	executionPath := []string{}
	var combinedAgentReplies []AgentReply
	var combinedTrace []ExecutionStep

	// Find start node
	currentNodeID := pe.findStartNode()
	if currentNodeID == "" {
		return nil, fmt.Errorf("no start node found")
	}

	// Execution context carries data between nodes
	execContext := map[string]interface{}{
		"query":           query,
		"output":          "",
		"previous_output": "",
	}

	// Execute workflow
	for currentNodeID != "" {
		node := pe.nodes[currentNodeID]
		executionPath = append(executionPath, currentNodeID)

		rlog.Info("pipeline: executing node", "node_id", currentNodeID, "node_type", node.NodeType)

		switch node.NodeType {
		case "start":
			// Just move to next node
			currentNodeID = pe.getNextNode(currentNodeID, execContext)

		case "agent":
			// Execute agent
			if node.AgentConfigID == nil {
				return nil, fmt.Errorf("agent node missing config_id")
			}
			config := pe.configs[*node.AgentConfigID]
			if config == nil {
				return nil, fmt.Errorf("agent config not found: %s", *node.AgentConfigID)
			}

			rlog.Info("pipeline: executing agent", "agent_name", config.Name, "query", execContext["query"])

			prevOut := ""
			if v, ok := execContext["previous_output"].(string); ok {
				prevOut = v
			}
			combinedTrace = append(combinedTrace, pipelineAgentStartStep(config, currentNodeID, prevOut))

			executor := NewAgentExecutor(config, pe.userID, pe.apiKey)
			executor.SetGraphNodeID(currentNodeID)
			result, err := executor.Execute(ctx, pe.agentInputForNode(execContext, query))
			combinedAgentReplies = append(combinedAgentReplies, executor.AgentReplies()...)
			combinedTrace = append(combinedTrace, executor.GetTrace().Steps...)
			if err != nil {
				errMsg := err.Error()
				return &PipelineExecution{
					PipelineID:        pe.pipeline.ID,
					UserID:            pe.userID,
					Query:             query,
					AgentReplies:      combinedAgentReplies,
					Trace:             combinedTrace,
					ExecutionPath:     executionPath,
					TotalDurationMs:   int(time.Since(startTime).Milliseconds()),
					Success:           false,
					ErrorMessage:      &errMsg,
					CreatedAt:         time.Now(),
					LearningSessionID: pe.learningSessionID,
				}, err
			}

			// Update context with agent output
			execContext["output"] = result.Answer
			execContext["previous_output"] = result.Answer

			rlog.Info("pipeline: agent completed", "output_length", len(result.Answer))

			// Move to next node
			currentNodeID = pe.getNextNode(currentNodeID, execContext)

		case "condition":
			// Evaluate condition and route
			currentNodeID = pe.evaluateCondition(node.ID, execContext)
			rlog.Info("pipeline: condition evaluated", "next_node", currentNodeID)

		case "end":
			// Workflow complete
			duration := int(time.Since(startTime).Milliseconds())
			output := execContext["output"].(string)
			rlog.Info("pipeline: workflow completed", "duration_ms", duration)
			return &PipelineExecution{
				PipelineID:        pe.pipeline.ID,
				UserID:            pe.userID,
				Query:             query,
				FinalOutput:       &output,
				AgentReplies:      combinedAgentReplies,
				Trace:             combinedTrace,
				ExecutionPath:     executionPath,
				TotalDurationMs:   duration,
				Success:           true,
				CreatedAt:         time.Now(),
				LearningSessionID: pe.learningSessionID,
			}, nil
		}
	}

	return nil, fmt.Errorf("workflow ended without reaching end node")
}

// ExecuteWithStreaming runs the workflow like Execute but streams agent activity through stream.
// Returns aggregated trace steps from all agent nodes and per-agent final texts (also attached to PipelineExecution for persistence).
func (pe *PipelineExecutor) ExecuteWithStreaming(ctx context.Context, query string, stream StreamWriter) (*PipelineExecution, []ExecutionStep, []AgentReply, error) {
	if stream != nil {
		stream.WriteEvent("start", map[string]string{
			"query":       query,
			"pipeline":    pe.pipeline.Name,
			"pipeline_id": pe.pipeline.ID,
		})
	}

	startTime := time.Now()
	executionPath := []string{}
	var combinedTrace []ExecutionStep
	var combinedAgentReplies []AgentReply

	currentNodeID := pe.findStartNode()
	if currentNodeID == "" {
		return nil, nil, nil, fmt.Errorf("no start node found")
	}

	execContext := map[string]interface{}{
		"query":           query,
		"output":          "",
		"previous_output": "",
	}

	for currentNodeID != "" {
		node := pe.nodes[currentNodeID]
		executionPath = append(executionPath, currentNodeID)

		if stream != nil {
			stream.WriteEvent("node", map[string]string{
				"node_id":   currentNodeID,
				"node_type": node.NodeType,
			})
		}

		rlog.Info("pipeline: executing node", "node_id", currentNodeID, "node_type", node.NodeType)

		switch node.NodeType {
		case "start":
			currentNodeID = pe.getNextNode(currentNodeID, execContext)

		case "agent":
			if node.AgentConfigID == nil {
				return nil, combinedTrace, nil, fmt.Errorf("agent node missing config_id")
			}
			config := pe.configs[*node.AgentConfigID]
			if config == nil {
				return nil, combinedTrace, nil, fmt.Errorf("agent config not found: %s", *node.AgentConfigID)
			}

			rlog.Info("pipeline: executing agent", "agent_name", config.Name, "query", execContext["query"])

			prevOut := ""
			if v, ok := execContext["previous_output"].(string); ok {
				prevOut = v
			}
			startStep := pipelineAgentStartStep(config, currentNodeID, prevOut)
			combinedTrace = append(combinedTrace, startStep)
			if stream != nil {
				stream.WriteEvent("pipeline_step", map[string]string{
					"agent_name":    config.Name,
					"graph_node_id": currentNodeID,
					"detail":        truncateForPipelineTrace(startStep.Output, 12000),
				})
			}

			executor := NewAgentExecutor(config, pe.userID, pe.apiKey)
			executor.SetGraphNodeID(currentNodeID)
			var agentStream StreamWriter
			if stream != nil {
				agentStream = &agentStreamContext{
					inner:     &agentStreamFilter{inner: stream},
					agentName: config.Name,
					nodeID:    currentNodeID,
				}
			}
			result, err := executor.ExecuteWithStreaming(ctx, pe.agentInputForNode(execContext, query), agentStream)
			combinedTrace = append(combinedTrace, executor.GetTrace().Steps...)
			combinedAgentReplies = append(combinedAgentReplies, executor.AgentReplies()...)
			if err != nil {
				errMsg := err.Error()
				return &PipelineExecution{
					PipelineID:        pe.pipeline.ID,
					UserID:            pe.userID,
					Query:             query,
					AgentReplies:      combinedAgentReplies,
					Trace:             combinedTrace,
					ExecutionPath:     executionPath,
					TotalDurationMs:   int(time.Since(startTime).Milliseconds()),
					Success:           false,
					ErrorMessage:      &errMsg,
					CreatedAt:         time.Now(),
					LearningSessionID: pe.learningSessionID,
				}, combinedTrace, combinedAgentReplies, err
			}

			execContext["output"] = result.Answer
			execContext["previous_output"] = result.Answer
			rlog.Info("pipeline: agent completed", "output_length", len(result.Answer))
			currentNodeID = pe.getNextNode(currentNodeID, execContext)

		case "condition":
			currentNodeID = pe.evaluateCondition(node.ID, execContext)
			rlog.Info("pipeline: condition evaluated", "next_node", currentNodeID)

		case "end":
			duration := int(time.Since(startTime).Milliseconds())
			output := execContext["output"].(string)
			rlog.Info("pipeline: workflow completed", "duration_ms", duration)
			return &PipelineExecution{
				PipelineID:        pe.pipeline.ID,
				UserID:            pe.userID,
				Query:             query,
				FinalOutput:       &output,
				AgentReplies:      combinedAgentReplies,
				Trace:             combinedTrace,
				ExecutionPath:     executionPath,
				TotalDurationMs:   duration,
				Success:           true,
				CreatedAt:         time.Now(),
				LearningSessionID: pe.learningSessionID,
			}, combinedTrace, combinedAgentReplies, nil
		}
	}

	return nil, combinedTrace, combinedAgentReplies, fmt.Errorf("workflow ended without reaching end node")
}

func (pe *PipelineExecutor) findStartNode() string {
	for id, node := range pe.nodes {
		if node.NodeType == "start" {
			return id
		}
	}
	return ""
}

func (pe *PipelineExecutor) getNextNode(currentNodeID string, context map[string]interface{}) string {
	// Find edges from current node
	for i := range pe.edges {
		edge := &pe.edges[i]
		if edge.SourceNodeID == currentNodeID {
			// For non-condition nodes, just take the first edge
			return edge.TargetNodeID
		}
	}
	return ""
}

func (pe *PipelineExecutor) evaluateCondition(nodeID string, context map[string]interface{}) string {
	output := context["output"].(string)

	// Find all edges from this condition node
	var defaultEdge *PipelineEdge
	for i := range pe.edges {
		edge := &pe.edges[i]
		if edge.SourceNodeID != nodeID {
			continue
		}

		// Check if this is the default edge
		if edge.ConditionType == nil || *edge.ConditionType == string(ConditionAlways) {
			defaultEdge = edge
			continue
		}

		// Evaluate condition
		if pe.checkCondition(*edge.ConditionType, *edge.ConditionValue, output) {
			rlog.Info("pipeline: condition matched", "type", *edge.ConditionType, "value", *edge.ConditionValue)
			return edge.TargetNodeID
		}
	}

	// No condition matched, use default
	if defaultEdge != nil {
		rlog.Info("pipeline: using default edge")
		return defaultEdge.TargetNodeID
	}

	return ""
}

func (pe *PipelineExecutor) checkCondition(condType, condValue, output string) bool {
	switch ConditionType(condType) {
	case ConditionContains:
		return strings.Contains(strings.ToLower(output), strings.ToLower(condValue))

	case ConditionLengthGT:
		threshold, err := strconv.Atoi(condValue)
		if err != nil {
			rlog.Error("pipeline: invalid threshold for length_gt", "value", condValue, "error", err)
			return false
		}
		return len(output) > threshold

	case ConditionLengthLT:
		threshold, err := strconv.Atoi(condValue)
		if err != nil {
			rlog.Error("pipeline: invalid threshold for length_lt", "value", condValue, "error", err)
			return false
		}
		return len(output) < threshold

	default:
		return false
	}
}
