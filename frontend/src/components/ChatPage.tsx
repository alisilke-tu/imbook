import { useContext, useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Container,
  Paper,
  TextField,
  Typography,
  Chip,
  FormControl,
  Select,
  MenuItem,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { FirebaseContext } from "../lib/firebase.tsx";
import LearningSessionDialog, { type LearningSession } from "./LearningSessionDialog.tsx";
import SessionSidebar, { type SessionWithConversations } from "./SessionSidebar.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const HIDDEN_WORKFLOW_NAMES = new Set([
  "mas (book first + fallback)",
  "precise researcher",
]);

function isHiddenWorkflowName(name: string): boolean {
  return HIDDEN_WORKFLOW_NAMES.has(name.trim().toLowerCase());
}

type ChatStep = {
  tool: string;
  tool_input: string;
  observation: string;
  log?: string;
  agent_name?: string;
  graph_node_id?: string;
};

type StepGroup = { key: string; title: string; steps: ChatStep[] };

function groupStepsForThinking(steps: ChatStep[]): StepGroup[] {
  const order: string[] = [];
  const seen = new Map<string, ChatStep[]>();
  for (const s of steps) {
    const key = `${s.agent_name ?? ""}\0${s.graph_node_id ?? ""}`;
    if (!seen.has(key)) {
      seen.set(key, []);
      order.push(key);
    }
    seen.get(key)!.push(s);
  }
  return order.map((key) => {
    const bucket = seen.get(key)!;
    const first = bucket[0];
    const title = first.agent_name
      ? `${first.agent_name}${first.graph_node_id ? ` · node ${first.graph_node_id.slice(0, 8)}…` : ""}`
      : "Agent";
    return { key, title, steps: bucket };
  });
}

type AgentReply = {
  agent_name: string;
  graph_node_id?: string;
  content: string;
};

type Message = {
  role: "user" | "assistant";
  text: string;
  steps?: ChatStep[];
  agentReplies?: AgentReply[];
};

type ChatHistoryTurn = {
  user: string;
  assistant: string;
};

function buildLastTurns(messages: Message[], maxTurns: number): ChatHistoryTurn[] {
  const turns: ChatHistoryTurn[] = [];
  let pendingUser: string | null = null;

  for (const msg of messages) {
    const text = msg.text.trim();
    if (!text) continue;

    if (msg.role === "user") {
      pendingUser = text;
      continue;
    }

    if (msg.role === "assistant" && pendingUser) {
      turns.push({ user: pendingUser, assistant: text });
      pendingUser = null;
    }
  }

  if (turns.length <= maxTurns) return turns;
  return turns.slice(turns.length - maxTurns);
}

function showAgentReplyBlocks(agentReplies: AgentReply[] | undefined, finalText: string): boolean {
  const filtered = filterAgentRepliesForDisplay(agentReplies, finalText);
  return (filtered?.length ?? 0) > 0;
}

/** Omits the last agent when its text is identical to the pipeline final (avoids duplicate blocks). */
function filterAgentRepliesForDisplay(
  agentReplies: AgentReply[] | undefined,
  finalText: string
): AgentReply[] | undefined {
  if (!agentReplies?.length) return undefined;
  const ft = finalText.trim();
  return agentReplies.filter(
    (ar, i, arr) => !(i === arr.length - 1 && ar.content.trim() === ft)
  );
}

type TraceRow = {
  step_type?: string;
  tool_name?: string;
  agent_name?: string;
  graph_node_id?: string;
  input?: string;
  output?: string;
};

function MessageItem({ message }: { message: Message }) {
  const [stepsOpen, setStepsOpen] = useState(true);
  const hasSteps = message.steps && message.steps.length > 0;
  return (
    <Box sx={{ mb: 6 }}>
      <Typography 
        variant="caption" 
        sx={{ 
          textTransform: "uppercase",
          letterSpacing: "0.0625rem",
          fontWeight: 500,
          color: "#999999",
          fontSize: "0.75rem",
          mb: 1.5,
          display: "block"
        }}
      >
        {message.role === "user" ? "You" : "Assistant"}
      </Typography>
      
      {hasSteps && (
        <Box sx={{ mb: 3 }}>
          <Paper 
            elevation={0}
            sx={{ 
              bgcolor: "#FAFAFA", 
              borderRadius: 2,
              p: 3,
              border: "none"
            }}
          >
            <Box 
              sx={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between",
                mb: 2,
                cursor: "pointer"
              }}
              onClick={() => setStepsOpen((o) => !o)}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 500,
                  color: "#666666",
                  fontSize: "0.9375rem"
                }}
              >
                Thinking ({message.steps!.length} step{message.steps!.length !== 1 ? "s" : ""})
              </Typography>
              {stepsOpen ? <ExpandLessIcon sx={{ color: "#666666" }} /> : <ExpandMoreIcon sx={{ color: "#666666" }} />}
            </Box>
            
            <Collapse in={stepsOpen}>
              <Box>
                {groupStepsForThinking(message.steps!).map((group) => (
                  <Box key={group.key} sx={{ mb: 3 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        color: "#555555",
                        fontSize: "0.875rem",
                        mb: 1.5,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {group.title}
                    </Typography>
                    {group.steps.map((step, j) => (
                      <Box
                        key={`${group.key}-${j}`}
                        sx={{ mb: j < group.steps.length - 1 ? 3 : 0 }}
                      >
                        <Box
                          sx={{
                            bgcolor:
                              step.tool === "Pipeline: agent run" ? "#E8F0FE" : "#F8F8F8",
                            borderRadius: 1,
                            px: 2,
                            py: 1.5,
                            mb: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          {step.agent_name ? (
                            <Chip
                              label={step.agent_name}
                              size="small"
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600 }}
                            />
                          ) : null}
                          <Typography
                            variant="caption"
                            sx={{
                              textTransform: "uppercase",
                              letterSpacing: "0.0625rem",
                              fontWeight: 500,
                              color: "#999999",
                              fontSize: "0.75rem",
                            }}
                          >
                            {step.tool || "tool"}
                          </Typography>
                        </Box>
                        <Paper
                          elevation={0}
                          sx={{
                            bgcolor: "white",
                            border: "1px solid #E5E5E5",
                            borderRadius: 1,
                            px: 2,
                            py: 1.5,
                          }}
                        >
                          <Typography
                            component="pre"
                            sx={{
                              whiteSpace: "pre-wrap",
                              fontFamily: "monospace",
                              fontSize: "0.8125rem",
                              color: "#4A4A4A",
                              lineHeight: 1.6,
                              m: 0,
                            }}
                          >
                            {step.log ? `REASONING:\n${step.log}\n\n` : ""}
                            {step.tool_input ? `INPUT: ${step.tool_input}\n\n` : ""}
                            {step.observation}
                          </Typography>
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Paper>
        </Box>
      )}

      {message.role === "assistant" &&
        showAgentReplyBlocks(message.agentReplies, message.text) && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="caption"
              sx={{
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                mb: 1.5,
                display: "block",
              }}
            >
              Agent outputs
            </Typography>
            {filterAgentRepliesForDisplay(message.agentReplies, message.text)!.map((ar, idx, arr) => (
              <Paper
                key={`${ar.graph_node_id ?? ar.agent_name}-${idx}`}
                elevation={0}
                sx={{
                  bgcolor: "#F5F7FA",
                  border: "1px solid #E5E5E5",
                  borderRadius: 2,
                  p: 2,
                  mb: idx < arr.length - 1 ? 2 : 0,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                  {ar.agent_name ? (
                    <Chip
                      label={ar.agent_name}
                      size="small"
                      sx={{ height: 24, fontSize: "0.75rem", fontWeight: 600 }}
                    />
                  ) : null}
                  {ar.graph_node_id ? (
                    <Typography variant="caption" sx={{ color: "#999999", fontFamily: "monospace" }}>
                      {ar.graph_node_id.slice(0, 8)}…
                    </Typography>
                  ) : null}
                </Box>
                <Typography
                  sx={{
                    fontSize: "1rem",
                    lineHeight: 1.7,
                    color: "#4A4A4A",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {ar.content}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}

      {message.role === "assistant" && showAgentReplyBlocks(message.agentReplies, message.text) && (
        <Typography
          variant="caption"
          sx={{
            textTransform: "uppercase",
            letterSpacing: "0.0625rem",
            fontWeight: 500,
            color: "#999999",
            fontSize: "0.75rem",
            mb: 1,
            display: "block",
          }}
        >
          Final answer
        </Typography>
      )}

      <Typography 
        sx={{ 
          fontSize: "1.0625rem",
          lineHeight: 1.7,
          color: message.role === "user" ? "#1A1A1A" : "#4A4A4A",
          whiteSpace: "pre-wrap"
        }}
      >
        {message.text}
      </Typography>
    </Box>
  );
}

type Workflow = {
  id: string;
  name: string;
  description: string;
  is_enabled: boolean;
};

export default function ChatPage() {
  const { auth } = useContext(FirebaseContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamSteps, setStreamSteps] = useState<ChatStep[]>([]);
  const [streamAgentReplies, setStreamAgentReplies] = useState<AgentReply[]>([]);
  const [streamReply, setStreamReply] = useState("");
  const [currentNode, setCurrentNode] = useState<string>("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [workflowsLoading, setWorkflowsLoading] = useState(true);

  const [sessionTree, setSessionTree] = useState<SessionWithConversations[]>([]);
  const [activeSession, setActiveSession] = useState<LearningSession | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);

  const loadLearningData = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    try {
      const [treeRes, activeRes] = await Promise.all([
        fetch(`${API_URL}/learning/session-tree`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/learning/me/active`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        setSessionTree((treeData.sessions as SessionWithConversations[]) ?? []);
      }
      if (activeRes.ok) {
        const s = (await activeRes.json()) as LearningSession;
        setActiveSession(s);
        setSelectedSessionId(s.id);
      } else {
        setActiveSession(null);
      }
    } catch (e) {
      console.error("Failed to load learning sessions:", e);
    }
  };

  useEffect(() => {
    if (auth?.currentUser) {
      void loadLearningData();
    }
  }, [auth?.currentUser]);

  useEffect(() => {
    const fetchWorkflows = async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/pipelines/workflows`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const all: Workflow[] = data.pipelines || [];
          const list = all.filter((wf) => !isHiddenWorkflowName(wf.name));
          setWorkflows(list);
          if (list.length > 0) {
            setSelectedWorkflow(list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch workflows:", err);
      } finally {
        setWorkflowsLoading(false);
      }
    };

    if (auth?.currentUser) {
      fetchWorkflows();
    }
  }, [auth?.currentUser]);

  const handleSelectSession = async (sessionId: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/learning/sessions/${sessionId}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { session: LearningSession };
        setActiveSession(data.session);
        setSelectedSessionId(sessionId);
        setViewingHistory(false);
        setMessages([]);
        await loadLearningData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    // Optimistic update: remove from UI immediately
    const previous = sessionTree;
    setSessionTree((prev) => prev.filter((s) => s.session.id !== sessionId));
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
      setActiveSession(null);
      setMessages([]);
      setViewingHistory(false);
    }

    try {
      const res = await fetch(`${API_URL}/learning/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Rollback on failure
        setSessionTree(previous);
        console.error("Delete failed:", await res.text());
      }
    } catch (e) {
      // Rollback on failure
      setSessionTree(previous);
      console.error(e);
    }
  };

  const startNewChat = () => {
    setViewingHistory(false);
    setMessages([]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !auth?.currentUser) return;
    if (viewingHistory) {
      setError('Click "Start new chat" to continue.');
      return;
    }
    const sid = activeSession?.id ?? selectedSessionId;
    if (!sid) {
      setError('Create a learning session with "New session" before chatting.');
      return;
    }
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    setError(null);
    setStreamSteps([]);
    setStreamAgentReplies([]);
    setStreamReply("");
    setCurrentNode("");
    const historyTurns = buildLastTurns(messages, 6);
    
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/chat/pipeline/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          pipeline_id: selectedWorkflow,
          learning_session_id: sid,
          history_turns: historyTurns,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { message?: string })?.message ?? res.statusText ?? "Request failed";
        setError(msg);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sseEvent = "";

      if (!reader) {
        setError("Streaming not supported");
        setLoading(false);
        return;
      }

      const handlePipelineSSE = (eventName: string, data: Record<string, unknown>) => {
        if (eventName === "error") {
          setError(String(data.message ?? "Pipeline error"));
          return;
        }
        if (eventName === "start") {
          const name = typeof data.pipeline === "string" ? data.pipeline : "";
          setCurrentNode(name ? `Pipeline: ${name}` : "Starting…");
          return;
        }
        if (eventName === "node") {
          const nt = data.node_type;
          const nid = data.node_id;
          if (typeof nt === "string" && typeof nid === "string") {
            setCurrentNode(`${nt} (${nid})`);
          }
          return;
        }
        if (eventName === "pipeline_step") {
          setStreamSteps((prev) => [
            ...prev,
            {
              tool: "Pipeline: agent run",
              tool_input: "",
              observation: String(data.detail ?? ""),
              agent_name: String(data.agent_name ?? ""),
              graph_node_id:
                data.graph_node_id != null ? String(data.graph_node_id) : undefined,
            },
          ]);
          return;
        }
        if (eventName === "step") {
          setStreamSteps((prev) => [
            ...prev,
            {
              tool: String(data.tool ?? ""),
              tool_input: String(data.tool_input ?? ""),
              observation: "",
              log: data.log != null && data.log !== "" ? String(data.log) : undefined,
              agent_name: data.agent_name != null ? String(data.agent_name) : undefined,
              graph_node_id: data.graph_node_id != null ? String(data.graph_node_id) : undefined,
            },
          ]);
          return;
        }
        if (eventName === "observation") {
          const content = String(data.content ?? "");
          setStreamSteps((prev) => {
            if (prev.length === 0) {
              return [
                {
                  tool: "observation",
                  tool_input: "",
                  observation: content,
                },
              ];
            }
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            last.observation = last.observation ? `${last.observation}\n\n${content}` : content;
            next[next.length - 1] = last;
            return next;
          });
          return;
        }
        if (eventName === "reply") {
          setStreamAgentReplies((prev) => [
            ...prev,
            {
              agent_name: String(data.agent_name ?? ""),
              graph_node_id:
                data.graph_node_id != null ? String(data.graph_node_id) : undefined,
              content: String(data.content ?? ""),
            },
          ]);
          setCurrentNode("");
          return;
        }
        if (eventName === "done") {
          const reply = (typeof data.reply === "string" && data.reply) || "No reply.";
          const trace = data.trace as TraceRow[] | undefined;
          const steps: ChatStep[] =
            trace?.map((t) => ({
              tool:
                t.step_type === "reasoning"
                  ? "Reasoning"
                  : t.step_type === "agent_output"
                    ? "Agent reply"
                    : t.step_type === "pipeline_agent_start"
                      ? "Pipeline: agent run"
                      : t.tool_name || t.step_type || "step",
              tool_input: typeof t.input === "string" ? t.input : JSON.stringify(t.input ?? ""),
              observation: typeof t.output === "string" ? t.output : JSON.stringify(t.output ?? ""),
              agent_name: t.agent_name,
              graph_node_id:
                t.graph_node_id != null && t.graph_node_id !== ""
                  ? String(t.graph_node_id)
                  : undefined,
            })) ?? [];

          const rawAr = data.agent_replies as
            | { agent_name?: string; graph_node_id?: string; content?: string }[]
            | undefined;
          const agentReplies: AgentReply[] =
            rawAr?.map((a) => ({
              agent_name: String(a.agent_name ?? ""),
              graph_node_id: a.graph_node_id != null ? String(a.graph_node_id) : undefined,
              content: String(a.content ?? ""),
            })) ?? [];

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: reply,
              steps: steps.length ? steps : undefined,
              agentReplies: agentReplies.length ? agentReplies : undefined,
            },
          ]);
          setStreamReply("");
          setStreamSteps([]);
          setStreamAgentReplies([]);
          void loadLearningData();
          return;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("event: ")) {
            sseEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (sseEvent) {
              handlePipelineSSE(sseEvent, data);
              sseEvent = "";
              continue;
            }

            if (data.reply != null && (data as { trace?: unknown }).trace !== undefined) {
              handlePipelineSSE("done", data);
            } else if (data.token) {
              setStreamReply((r) => r + String(data.token));
            } else if (data.node_id && data.node_type && !data.token && !data.answer) {
              setCurrentNode(`${data.node_type} (${data.node_id})`);
            } else if (data.node_id && data.answer) {
              setStreamReply(String(data.answer));
              setCurrentNode("");
            } else if (data.chunks_found !== undefined) {
              setCurrentNode("");
            }
          }
        }
      }
    } catch (err) {
      setError("Request failed");
    } finally {
      setLoading(false);
      setStreamSteps([]);
      setStreamAgentReplies([]);
      setStreamReply("");
      setCurrentNode("");
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "white",
        minHeight: "100vh",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        alignItems: { xs: "stretch", md: "flex-start" },
      }}
    >
      <LearningSessionDialog
        open={sessionDialogOpen}
        onClose={() => setSessionDialogOpen(false)}
        apiUrl={API_URL}
        getToken={() => auth?.currentUser?.getIdToken() ?? Promise.resolve(null)}
        onCreated={async (session) => {
          setActiveSession(session);
          setSelectedSessionId(session.id);
          setViewingHistory(false);
          await loadLearningData();
        }}
      />
      <SessionSidebar
        sessions={sessionTree}
        activeSessionId={activeSession?.id ?? null}
        selectedSessionId={selectedSessionId}
        onNewSession={() => setSessionDialogOpen(true)}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 7.5 }, px: { xs: 3, md: 5 } }}>
        <Box sx={{ mb: 5 }}>
          <Typography 
            variant="h2" 
            component="h1" 
            sx={{ 
              fontSize: { xs: "2rem", md: "2.625rem" },
              fontWeight: 700,
              color: "black",
              letterSpacing: "-0.03125rem",
              mb: 1.5
            }}
          >
            Chat
          </Typography>
          <Typography 
            sx={{ 
              fontSize: "1.0625rem",
              color: "#666666",
              lineHeight: 1.6
            }}
          >
            Ask questions about the book. The agent can search embedded chunks when relevant.
          </Typography>
        </Box>

        <Box sx={{ 
          mb: 5,
          pb: 5,
          borderBottom: "1px solid #E5E5E5"
        }}>
          <Typography 
            variant="caption" 
            sx={{ 
              textTransform: "uppercase",
              letterSpacing: "0.0625rem",
              fontWeight: 500,
              color: "#999999",
              fontSize: "0.75rem",
              mb: 1.5,
              display: "block"
            }}
          >
            Workflow
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <FormControl sx={{ minWidth: 300 }}>
              <Select
                value={selectedWorkflow}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
                disabled={workflowsLoading || loading || workflows.length === 0}
                displayEmpty
                sx={{
                  bgcolor: "white",
                  border: "1px solid #E5E5E5",
                  borderRadius: 2,
                  height: "44px",
                  fontSize: "0.9375rem",
                  "& .MuiOutlinedInput-notchedOutline": {
                    border: "none"
                  },
                  "&:hover": {
                    borderColor: "primary.main"
                  },
                  "&.Mui-focused": {
                    borderColor: "primary.main"
                  }
                }}
              >
                {workflows.map((wf) => (
                  <MenuItem key={wf.id} value={wf.id}>
                    {wf.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {viewingHistory && (
          <Alert
            severity="warning"
            sx={{ mb: 3 }}
            action={
              <Button color="inherit" size="small" onClick={startNewChat}>
                Start new chat
              </Button>
            }
          >
            Viewing a past conversation. Messages are read-only until you start a new chat.
          </Alert>
        )}

        <Box sx={{ mb: 5 }}>
          {messages.length === 0 && !loading && (
            <Typography sx={{ color: "#999999", fontSize: "0.9375rem" }}>
              Send a message to start.
            </Typography>
          )}
          
          {messages.map((m, i) => (
            <MessageItem key={i} message={m} />
          ))}
          
          {loading &&
            (streamSteps.length > 0 ||
              streamAgentReplies.length > 0 ||
              streamReply ||
              currentNode) && (
            <Box sx={{ mb: 6 }}>
              <Typography 
                variant="caption" 
                sx={{ 
                  textTransform: "uppercase",
                  letterSpacing: "0.0625rem",
                  fontWeight: 500,
                  color: "#999999",
                  fontSize: "0.75rem",
                  mb: 1.5,
                  display: "block"
                }}
              >
                Assistant
              </Typography>

              {streamSteps.length > 0 && (
                <Paper
                  elevation={0}
                  sx={{
                    bgcolor: "#FAFAFA",
                    borderRadius: 2,
                    p: 3,
                    mb: 3,
                    border: "none",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: "#666666",
                      fontSize: "0.9375rem",
                      mb: 2,
                    }}
                  >
                    Thinking ({streamSteps.length} step{streamSteps.length !== 1 ? "s" : ""})
                  </Typography>
                  {groupStepsForThinking(streamSteps).map((group) => (
                    <Box key={group.key} sx={{ mb: 2 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 600,
                          color: "#555555",
                          fontSize: "0.875rem",
                          mb: 1,
                        }}
                      >
                        {group.title}
                      </Typography>
                      {group.steps.map((step, j) => (
                        <Box key={`${group.key}-${j}`} sx={{ mb: j < group.steps.length - 1 ? 2 : 0 }}>
                          <Box
                            sx={{
                              bgcolor:
                                step.tool === "Pipeline: agent run" ? "#E8F0FE" : "#F8F8F8",
                              borderRadius: 1,
                              px: 2,
                              py: 1,
                              mb: 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              flexWrap: "wrap",
                            }}
                          >
                            {step.agent_name ? (
                              <Chip
                                label={step.agent_name}
                                size="small"
                                sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600 }}
                              />
                            ) : null}
                            <Typography variant="caption" sx={{ color: "#999999", fontWeight: 500 }}>
                              {step.tool || "tool"}
                            </Typography>
                          </Box>
                          <Paper
                            elevation={0}
                            sx={{
                              bgcolor: "white",
                              border: "1px solid #E5E5E5",
                              borderRadius: 1,
                              px: 2,
                              py: 1.5,
                            }}
                          >
                            <Typography
                              component="pre"
                              sx={{
                                whiteSpace: "pre-wrap",
                                fontFamily: "monospace",
                                fontSize: "0.8125rem",
                                color: "#4A4A4A",
                                lineHeight: 1.6,
                                m: 0,
                              }}
                            >
                              {step.log ? `REASONING:\n${step.log}\n\n` : ""}
                              {step.tool_input ? `INPUT: ${step.tool_input}\n\n` : ""}
                              {step.observation}
                            </Typography>
                          </Paper>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Paper>
              )}

              {streamAgentReplies.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      textTransform: "uppercase",
                      letterSpacing: "0.0625rem",
                      fontWeight: 500,
                      color: "#999999",
                      fontSize: "0.75rem",
                      mb: 1.5,
                      display: "block",
                    }}
                  >
                    Agent outputs
                  </Typography>
                  {streamAgentReplies.map((ar, idx) => (
                    <Paper
                      key={`${ar.graph_node_id ?? ar.agent_name}-${idx}`}
                      elevation={0}
                      sx={{
                        bgcolor: "#F5F7FA",
                        border: "1px solid #E5E5E5",
                        borderRadius: 2,
                        p: 2,
                        mb: idx < streamAgentReplies.length - 1 ? 2 : 0,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                        {ar.agent_name ? (
                          <Chip
                            label={ar.agent_name}
                            size="small"
                            sx={{ height: 24, fontSize: "0.75rem", fontWeight: 600 }}
                          />
                        ) : null}
                        {ar.graph_node_id ? (
                          <Typography variant="caption" sx={{ color: "#999999", fontFamily: "monospace" }}>
                            {ar.graph_node_id.slice(0, 8)}…
                          </Typography>
                        ) : null}
                      </Box>
                      <Typography sx={{ fontSize: "1rem", lineHeight: 1.7, color: "#4A4A4A", whiteSpace: "pre-wrap" }}>
                        {ar.content}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              )}

              {streamSteps.length === 0 && streamAgentReplies.length === 0 && (
                <Paper 
                  elevation={0}
                  sx={{ 
                    bgcolor: "#FAFAFA", 
                    borderRadius: 2,
                    p: 3,
                    mb: 3
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: 500,
                      color: "#666666",
                      fontSize: "0.9375rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5
                    }}
                  >
                    <PsychologyIcon fontSize="small" /> 
                    {currentNode ? `Executing: ${currentNode}` : "Thinking…"}
                  </Typography>
                </Paper>
              )}

              {streamReply && (
                <Typography 
                  sx={{ 
                    fontSize: "1.0625rem",
                    lineHeight: 1.7,
                    color: "#4A4A4A",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {streamReply}
                </Typography>
              )}
            </Box>
          )}
          
          {loading &&
            streamSteps.length === 0 &&
            streamAgentReplies.length === 0 &&
            !streamReply &&
            !currentNode && (
            <Typography sx={{ color: "#999999", fontSize: "0.9375rem" }}>
              Thinking…
            </Typography>
          )}
        </Box>

        <Box sx={{ 
          pt: 4,
          borderTop: "1px solid #E5E5E5"
        }}>
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>
            <TextField
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              disabled={loading || viewingHistory}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "white",
                  border: "1px solid #E5E5E5",
                  borderRadius: 2,
                  minHeight: "44px",
                  fontSize: "0.9375rem",
                  px: 2.5,
                  py: 1.5,
                  "& fieldset": {
                    border: "none"
                  },
                  "&:hover": {
                    borderColor: "primary.main"
                  },
                  "&.Mui-focused": {
                    borderColor: "primary.main"
                  }
                },
                "& .MuiInputBase-input::placeholder": {
                  color: "#999999",
                  opacity: 1
                }
              }}
            />
            <Button 
              variant="contained" 
              onClick={send} 
              disabled={loading || !input.trim() || viewingHistory}
              sx={{
                minWidth: "100px",
                minHeight: "44px",
                borderRadius: 2,
                fontSize: "0.9375rem",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "none",
                "&:hover": {
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)"
                }
              }}
            >
              Send
            </Button>
          </Box>
        </Box>
      </Container>
      </Box>
    </Box>
  );
}
