import { useCallback, useContext, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type AdminChatThread = {
  user_id: string;
  pipeline_id: string;
  pipeline_name: string;
  user_email?: string;
  turn_count: number;
  started_at: string;
  last_message_at: string;
};

type ConversationTurn = {
  id: string;
  query: string;
  final_output?: string | null;
  success: boolean;
  error_message?: string | null;
  total_duration_ms: number;
  created_at: string;
};

type AdminConversation = {
  user_id: string;
  pipeline_id: string;
  pipeline_name: string;
  user_email?: string;
  turns: ConversationTurn[];
};

type AgentReply = {
  agent_name: string;
  graph_node_id?: string;
  content: string;
};

type ExecutionStep = {
  step_type: string;
  agent_name?: string;
  graph_node_id?: string;
  tool_name?: string;
  input: string;
  output: string;
  duration_ms: number;
  error?: string;
  timestamp: string;
};

type AdminChatDetail = {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  user_id: string;
  user_email?: string;
  query: string;
  final_output?: string | null;
  execution_path?: string[];
  agent_replies?: AgentReply[];
  trace?: ExecutionStep[];
  total_duration_ms: number;
  success: boolean;
  error_message?: string | null;
  created_at: string;
};

type ThreadsListResponse = {
  threads: AdminChatThread[];
  next_offset: number;
  has_more: boolean;
};

export default function AdminChatsPage() {
  const { auth } = useContext(FirebaseContext);
  const [threads, setThreads] = useState<AdminChatThread[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState("");

  const [conversation, setConversation] = useState<AdminConversation | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);

  const [technicalDetail, setTechnicalDetail] = useState<AdminChatDetail | null>(null);
  const [technicalLoading, setTechnicalLoading] = useState(false);

  const limit = 40;

  const fetchThreads = useCallback(
    async (reset: boolean, filterUidOverride?: string) => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;

      const nextOff = reset ? 0 : offset;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(nextOff),
        });
        const uid = (filterUidOverride ?? userFilter).trim();
        if (uid) params.set("user_id", uid);

        const res = await fetch(`${API_URL}/pipelines/admin/chat-threads?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }

        const data: ThreadsListResponse = await res.json();
        if (reset) {
          setThreads(data.threads || []);
          setOffset(data.next_offset ?? 0);
        } else {
          setThreads((prev) => [...prev, ...(data.threads || [])]);
          setOffset(data.next_offset ?? nextOff);
        }
        setHasMore(!!data.has_more);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load conversations");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [auth, offset, userFilter],
  );

  useEffect(() => {
    void fetchThreads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.currentUser?.uid]);

  const applyFilter = () => {
    setOffset(0);
    void fetchThreads(true, userFilter.trim());
  };

  const openConversation = async (t: AdminChatThread) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    setConversationLoading(true);
    setConversation(null);
    setTechnicalDetail(null);
    try {
      const params = new URLSearchParams({
        user_id: t.user_id,
        pipeline_id: t.pipeline_id,
      });
      const res = await fetch(
        `${API_URL}/pipelines/admin/chat-conversation?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data: AdminConversation = await res.json();
      setConversation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation");
    } finally {
      setConversationLoading(false);
    }
  };

  const openTechnical = async (executionId: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    setTechnicalLoading(true);
    setTechnicalDetail(null);
    try {
      const res = await fetch(
        `${API_URL}/pipelines/admin/chats/${encodeURIComponent(executionId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const d: AdminChatDetail = await res.json();
      setTechnicalDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load technical detail");
    } finally {
      setTechnicalLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Chat sessions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Conversations are grouped by user and workflow. Open one to scroll the full
        message history (each row in the database is one turn: your message and the
        assistant reply).
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <TextField
          size="small"
          label="Filter by user ID (Firebase UID)"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <Button variant="contained" onClick={applyFilter}>
          Apply filter
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setUserFilter("");
            setOffset(0);
            void fetchThreads(true, "");
          }}
        >
          Clear
        </Button>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Workflow</TableCell>
                  <TableCell align="right">Turns</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Last message</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {threads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary">
                        No conversations yet. Pipeline chats are stored when users send
                        messages through a workflow.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  threads.map((t) => (
                    <TableRow key={`${t.user_id}:${t.pipeline_id}`} hover>
                      <TableCell>
                        <Typography variant="body2">{t.user_email || "—"}</Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: "monospace", display: "block" }}
                        >
                          {t.user_id.length > 18
                            ? `${t.user_id.slice(0, 16)}…`
                            : t.user_id}
                        </Typography>
                      </TableCell>
                      <TableCell>{t.pipeline_name || t.pipeline_id}</TableCell>
                      <TableCell align="right">{t.turn_count}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                        {t.started_at}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                        {t.last_message_at}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => void openConversation(t)}
                        >
                          Open conversation
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {hasMore && (
            <Box sx={{ mt: 2 }}>
              <Button
                disabled={loadingMore}
                onClick={() => void fetchThreads(false)}
                variant="outlined"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Full conversation — scrollable transcript */}
      <Dialog
        open={conversation !== null || conversationLoading}
        onClose={() => {
          setConversation(null);
          setTechnicalDetail(null);
        }}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Conversation
          <IconButton
            aria-label="close"
            onClick={() => {
              setConversation(null);
              setTechnicalDetail(null);
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 1 }}>
          {conversationLoading && <CircularProgress />}
          {conversation && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {conversation.user_email && <>{conversation.user_email} · </>}
                <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                  {conversation.user_id}
                </Box>
              </Typography>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                {conversation.pipeline_name || conversation.pipeline_id}
              </Typography>

              <Paper
                variant="outlined"
                sx={{
                  maxHeight: "min(70vh, 640px)",
                  overflow: "auto",
                  p: 2,
                  bgcolor: "grey.50",
                }}
              >
                {conversation.turns.length === 0 ? (
                  <Typography color="text.secondary">No messages in this thread.</Typography>
                ) : (
                  conversation.turns.map((turn) => (
                    <Box key={turn.id} sx={{ mb: 3 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        {turn.created_at} · {turn.total_duration_ms} ms
                        {!turn.success && (
                          <Chip size="small" label="error" color="error" sx={{ ml: 1, height: 18 }} />
                        )}
                      </Typography>

                      <Typography
                        variant="caption"
                        sx={{
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "text.secondary",
                          display: "block",
                          mb: 0.5,
                        }}
                      >
                        User
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          mb: 2,
                          bgcolor: "background.paper",
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {turn.query}
                        </Typography>
                      </Paper>

                      <Typography
                        variant="caption"
                        sx={{
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "text.secondary",
                          display: "block",
                          mb: 0.5,
                        }}
                      >
                        Assistant
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          mb: 1,
                          bgcolor: "grey.100",
                          borderRadius: 2,
                          borderLeft: "3px solid",
                          borderLeftColor: "primary.main",
                        }}
                      >
                        {turn.error_message && (
                          <Alert severity="error" sx={{ mb: 1 }}>
                            {turn.error_message}
                          </Alert>
                        )}
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {turn.final_output?.trim()
                            ? turn.final_output
                            : turn.success
                              ? "(empty response)"
                              : "—"}
                        </Typography>
                      </Paper>

                      <Button
                        size="small"
                        variant="text"
                        onClick={() => void openTechnical(turn.id)}
                      >
                        Execution detail (trace, tools, agents)
                      </Button>
                    </Box>
                  ))
                )}
              </Paper>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Single-turn technical audit */}
      <Dialog
        open={technicalDetail !== null || technicalLoading}
        onClose={() => setTechnicalDetail(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Execution detail
          <IconButton aria-label="close" onClick={() => setTechnicalDetail(null)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {technicalLoading && <CircularProgress />}
          {technicalDetail && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {technicalDetail.created_at} · {technicalDetail.pipeline_name} ·{" "}
                {technicalDetail.total_duration_ms} ms
              </Typography>

              {technicalDetail.execution_path && technicalDetail.execution_path.length > 0 && (
                <>
                  <Typography variant="subtitle2">Execution path</Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                    {technicalDetail.execution_path.join(" → ")}
                  </Typography>
                </>
              )}

              {technicalDetail.agent_replies && technicalDetail.agent_replies.length > 0 && (
                <>
                  <Typography variant="subtitle2">Agent replies</Typography>
                  {technicalDetail.agent_replies.map((ar, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="caption" color="primary">
                        {ar.agent_name}
                        {ar.graph_node_id ? ` · ${ar.graph_node_id}` : ""}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                        {ar.content}
                      </Typography>
                    </Paper>
                  ))}
                </>
              )}

              {technicalDetail.trace && technicalDetail.trace.length > 0 && (
                <>
                  <Typography variant="subtitle2">Trace</Typography>
                  {technicalDetail.trace.map((step, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {step.step_type}
                        {step.agent_name ? ` · ${step.agent_name}` : ""}
                        {step.tool_name ? ` · ${step.tool_name}` : ""}
                      </Typography>
                      {step.input && (
                        <Typography
                          variant="body2"
                          sx={{ mt: 0.5, fontFamily: "monospace", fontSize: "0.75rem", whiteSpace: "pre-wrap" }}
                        >
                          in: {step.input}
                        </Typography>
                      )}
                      {step.output && (
                        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                          {step.output}
                        </Typography>
                      )}
                      {step.error && (
                        <Typography variant="body2" color="error">
                          {step.error}
                        </Typography>
                      )}
                    </Paper>
                  ))}
                </>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
