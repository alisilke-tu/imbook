import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useState } from "react";
import type { LearningSession } from "./LearningSessionDialog.tsx";

export type ConversationSummary = {
  execution_id: string;
  pipeline_id: string;
  preview: string;
  created_at: string;
};

export type SessionWithConversations = {
  session: LearningSession;
  conversations: ConversationSummary[];
};

type Props = {
  sessions: SessionWithConversations[];
  activeSessionId: string | null;
  selectedSessionId: string | null;
  selectedExecutionId: string | null;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectConversation: (sessionId: string, executionId: string) => void;
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  selectedSessionId,
  selectedExecutionId,
  onNewSession,
  onSelectSession,
  onSelectConversation,
}: Props) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Box
      sx={{
        width: isNarrow ? "100%" : 260,
        flexShrink: 0,
        borderRight: isNarrow ? "none" : "1px solid #E5E5E5",
        bgcolor: "white",
        display: "flex",
        flexDirection: "column",
        minHeight: isNarrow ? "auto" : "100vh",
        maxHeight: isNarrow ? 320 : "none",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #E5E5E5",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#999999",
          }}
        >
          Sessions
        </Typography>
        <IconButton
          size="small"
          onClick={onNewSession}
          aria-label="New session"
          sx={{ color: "#666666", p: 0.5 }}
        >
          <AddIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <List dense disablePadding sx={{ overflow: "auto", flex: 1, py: 0.5 }}>
        {sessions.length === 0 && (
          <Box sx={{ px: 2.5, py: 5, textAlign: "center" }}>
            <Typography
              sx={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#4A4A4A",
                letterSpacing: "-0.01em",
                lineHeight: 1.45,
              }}
            >
              No sessions yet
            </Typography>
            <Typography
              sx={{
                fontSize: "0.8125rem",
                color: "#999999",
                mt: 1,
                lineHeight: 1.5,
                maxWidth: 200,
                mx: "auto",
              }}
            >
              Tap + to add what you want to learn and how you like to study.
            </Typography>
          </Box>
        )}
        {sessions.map(({ session, conversations }) => {
          const isOpen = expanded[session.id] ?? true;
          const sessionSelected = selectedSessionId === session.id && !selectedExecutionId;
          const isActive = activeSessionId === session.id;
          return (
            <Box key={session.id}>
              <ListItemButton
                onClick={() => {
                  toggle(session.id);
                  onSelectSession(session.id);
                }}
                selected={sessionSelected}
                sx={{
                  py: 0.75,
                  pl: 1,
                  pr: 1.5,
                  minHeight: 40,
                  borderLeft: "2px solid",
                  borderLeftColor: sessionSelected ? "primary.main" : "transparent",
                  "&.Mui-selected": {
                    bgcolor: "transparent",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.03)" },
                  },
                  "&:hover": { bgcolor: "rgba(0,0,0,0.02)" },
                }}
              >
                <IconButton
                  size="small"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(session.id);
                  }}
                  sx={{ p: 0.25, mr: 0.5, color: "#BBBBBB" }}
                >
                  {isOpen ? (
                    <ExpandMoreIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <ChevronRightIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                      {isActive && (
                        <Box
                          component="span"
                          sx={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            bgcolor: "primary.main",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Typography
                        component="span"
                        noWrap
                        sx={{
                          fontSize: "0.8125rem",
                          fontWeight: isActive ? 600 : 400,
                          color: "#333333",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {session.title}
                      </Typography>
                    </Box>
                  }
                />
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {conversations.map((c) => {
                    const convSelected = selectedExecutionId === c.execution_id;
                    return (
                      <ListItemButton
                        key={c.execution_id}
                        onClick={() => onSelectConversation(session.id, c.execution_id)}
                        selected={convSelected}
                        sx={{
                          py: 0.5,
                          pl: 3.5,
                          pr: 1.5,
                          minHeight: 34,
                          borderLeft: "2px solid",
                          borderLeftColor: convSelected ? "primary.main" : "transparent",
                          "&.Mui-selected": {
                            bgcolor: "rgba(0,0,0,0.03)",
                            "&:hover": { bgcolor: "rgba(0,0,0,0.04)" },
                          },
                        }}
                      >
                        <ListItemText
                          primary={c.preview}
                          secondary={formatTime(c.created_at)}
                          primaryTypographyProps={{
                            variant: "body2",
                            noWrap: true,
                            sx: { fontSize: "0.75rem", color: "#555555", lineHeight: 1.35 },
                          }}
                          secondaryTypographyProps={{
                            sx: { fontSize: "0.65rem", color: "#AAAAAA", mt: 0.15 },
                          }}
                        />
                      </ListItemButton>
                    );
                  })}
                  {conversations.length === 0 && (
                    <Typography
                      sx={{
                        pl: 3.5,
                        pr: 2,
                        py: 0.75,
                        fontSize: "0.6875rem",
                        color: "#BBBBBB",
                      }}
                    >
                      No chats
                    </Typography>
                  )}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );
}
