import { useContext, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Paper,
  TextField,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type ChatStep = { tool: string; tool_input: string; observation: string; log?: string };
type Message = { role: "user" | "assistant"; text: string; steps?: ChatStep[] };

function MessageItem({ message }: { message: Message }) {
  const [stepsOpen, setStepsOpen] = useState(!!message.steps?.length);
  const hasSteps = message.steps && message.steps.length > 0;
  return (
    <ListItem alignItems="flex-start" sx={{ flexDirection: "column", alignItems: "flex-start", width: "100%" }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {message.role === "user" ? "You" : "Assistant"}
      </Typography>
      {hasSteps && (
        <Box sx={{ width: "100%", mt: 0.5, mb: 1 }}>
          <Button
            size="small"
            startIcon={<PsychologyIcon />}
            endIcon={stepsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setStepsOpen((o) => !o)}
            sx={{ textTransform: "none", color: "text.secondary" }}
          >
            Thinking ({message.steps!.length} step{message.steps!.length !== 1 ? "s" : ""})
          </Button>
          <Collapse in={stepsOpen}>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover", mt: 0.5 }}>
              {message.steps!.map((step, j) => (
                <Box key={j} sx={{ mb: j < message.steps!.length - 1 ? 1.5 : 0 }}>
                  <Chip label={step.tool || "tool"} size="small" sx={{ mb: 0.5 }} />
                  {step.tool_input && (
                    <Typography variant="caption" component="div" color="text.secondary" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                      Input: {step.tool_input}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                    {step.observation}
                  </Typography>
                </Box>
              ))}
            </Paper>
          </Collapse>
        </Box>
      )}
      <ListItemText
        primary={message.text}
        primaryTypographyProps={{ variant: "body2", sx: { whiteSpace: "pre-wrap" } }}
      />
    </ListItem>
  );
}

type StreamEvent = { type: string; data?: { tool?: string; tool_input?: string; content?: string; message?: string } };

export default function AdminChatPage() {
  const { auth } = useContext(FirebaseContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live stream state: steps and reply as they arrive
  const [streamSteps, setStreamSteps] = useState<ChatStep[]>([]);
  const [streamReply, setStreamReply] = useState("");

  const send = async () => {
    const text = input.trim();
    if (!text || !auth?.currentUser) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    setError(null);
    setStreamSteps([]);
    setStreamReply("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
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
      if (!reader) {
        setError("Stream not supported");
        setLoading(false);
        return;
      }
      let buffer = "";
      const steps: ChatStep[] = [];
      let reply = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const payload: StreamEvent = JSON.parse(line.slice(6));
              const ev = payload.data ?? {};
              if (payload.type === "step") {
                steps.push({ tool: ev.tool ?? "", tool_input: ev.tool_input ?? "", observation: "" });
                setStreamSteps([...steps]);
              } else if (payload.type === "observation") {
                if (steps.length) {
                  steps[steps.length - 1].observation = ev.content ?? "";
                  setStreamSteps([...steps]);
                }
              } else if (payload.type === "reply") {
                reply = ev.content ?? "";
                setStreamReply(reply);
              } else if (payload.type === "error") {
                setError(ev.message ?? "Agent error");
              }
            } catch {
              // skip malformed line
            }
          }
        }
      }
      setMessages((prev) => [...prev, { role: "assistant", text: reply || "No reply.", steps: steps.length ? steps : undefined }]);
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
      setStreamSteps([]);
      setStreamReply("");
    }
  };

  return (
    <>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Ask questions about the book. The agent can search embedded chunks when relevant.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Paper elevation={2} sx={{ p: 3, display: "flex", flexDirection: "column", minHeight: 420 }}>
        <Box sx={{ flex: 1, overflow: "auto", mb: 2, minHeight: 280 }}>
          {messages.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Send a message to start.
            </Typography>
          )}
          <List dense disablePadding>
            {messages.map((m, i) => (
              <MessageItem key={i} message={m} />
            ))}
            {loading && (streamSteps.length > 0 || streamReply) && (
              <ListItem alignItems="flex-start" sx={{ flexDirection: "column", alignItems: "flex-start", width: "100%" }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Assistant
                </Typography>
                <Box sx={{ width: "100%", mt: 0.5, mb: 1 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <PsychologyIcon fontSize="small" /> Thinking…
                    </Typography>
                    {streamSteps.map((step, j) => (
                      <Box key={j} sx={{ mt: 1 }}>
                        <Chip label={step.tool || "tool"} size="small" sx={{ mb: 0.5 }} />
                        {step.tool_input && (
                          <Typography variant="caption" component="div" color="text.secondary" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                            Input: {step.tool_input}
                          </Typography>
                        )}
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                          {step.observation || "…"}
                        </Typography>
                      </Box>
                    ))}
                  </Paper>
                </Box>
                {streamReply && (
                  <ListItemText
                    primary={streamReply}
                    primaryTypographyProps={{ variant: "body2", sx: { whiteSpace: "pre-wrap" } }}
                  />
                )}
              </ListItem>
            )}
            {loading && streamSteps.length === 0 && !streamReply && (
              <Typography variant="body2" color="text.secondary">
                Thinking…
              </Typography>
            )}
          </List>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            disabled={loading}
          />
          <Button variant="contained" onClick={send} disabled={loading || !input.trim()}>
            Send
          </Button>
        </Box>
      </Paper>
    </>
  );
}
