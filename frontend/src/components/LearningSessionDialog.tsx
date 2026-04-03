import { useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

export type LearningSession = {
  id: string;
  user_id: string;
  title: string;
  what_to_learn: string;
  how_to_learn: string;
  additional_context?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (session: LearningSession) => void;
  apiUrl: string;
  getToken: () => Promise<string | null>;
};

function FieldShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        pl: 2.25,
        py: 0.5,
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 2,
          borderRadius: 1,
          bgcolor: "primary.main",
          opacity: 0.85,
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: "block",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "text.secondary",
          fontWeight: 600,
          fontSize: "0.6875rem",
          mb: 0.75,
        }}
      >
        {kicker}
      </Typography>
      <Typography
        component="h2"
        sx={{
          fontSize: "1.0625rem",
          fontWeight: 600,
          color: "text.primary",
          letterSpacing: "-0.02em",
          lineHeight: 1.35,
          mb: 1.75,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function LearningSessionDialog({
  open,
  onClose,
  onCreated,
  apiUrl,
  getToken,
}: Props) {
  const [title, setTitle] = useState("");
  const [what, setWhat] = useState("");
  const [how, setHow] = useState("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!title.trim() || !what.trim() || !how.trim()) {
      setError("Add a title, your learning goal, and how you’d like to learn.");
      return;
    }
    const token = await getToken();
    if (!token) {
      setError("Not signed in.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/learning/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          what_to_learn: what.trim(),
          how_to_learn: how.trim(),
          additional_context: extra.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { message?: string })?.message ?? res.statusText);
        return;
      }
      const session = (data as { session: LearningSession }).session;
      onCreated(session);
      setTitle("");
      setWhat("");
      setHow("");
      setExtra("");
      onClose();
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      bgcolor: "grey.50",
      borderRadius: 1,
      transition: "background-color 0.2s ease",
      "&:hover": {
        bgcolor: "action.hover",
      },
      "&.Mui-focused": {
        bgcolor: "background.paper",
      },
      "& fieldset": {
        borderColor: "divider",
      },
      "&:hover fieldset": {
        borderColor: "grey.400",
      },
      "&.Mui-focused fieldset": {
        borderColor: "primary.main",
        borderWidth: 1,
      },
    },
  } as const;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      scroll="body"
      PaperProps={{
        elevation: 0,
        sx: {
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 24px 48px -12px rgba(15, 23, 42, 0.12)",
          overflow: "hidden",
          maxWidth: 480,
        },
      }}
    >
      <DialogTitle
        sx={{
          pt: 3.5,
          px: 3,
          pb: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: "block",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "text.secondary",
            fontWeight: 600,
            fontSize: "0.6875rem",
            mb: 1,
          }}
        >
          Learning session
        </Typography>
        <Typography
          component="h1"
          sx={{
            fontSize: "1.375rem",
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.25,
            color: "text.primary",
          }}
        >
          Start something new
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 3, pb: 1 }}>
        <Stack spacing={3.5}>
          {error && (
            <Alert severity="error" sx={{ borderRadius: 1 }}>
              {error}
            </Alert>
          )}

          <Box>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "text.secondary",
                fontWeight: 600,
                fontSize: "0.6875rem",
                mb: 1,
              }}
            >
              Name
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Week 3 — databases"
              sx={fieldSx}
            />
          </Box>

          <FieldShell kicker="Focus" title="What do you want to learn?">
            <TextField
              fullWidth
              multiline
              minRows={4}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="Describe the topic, scope, or outcome you care about."
              sx={fieldSx}
            />
          </FieldShell>

          <FieldShell kicker="Approach" title="How do you want to learn?">
            <TextField
              fullWidth
              multiline
              minRows={4}
              value={how}
              onChange={(e) => setHow(e.target.value)}
              placeholder="e.g. Short explanations, then practice questions — or your own rhythm."
              sx={fieldSx}
            />
          </FieldShell>

          <Box>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mb: 1, fontWeight: 500 }}
            >
              Additional context
              <Typography component="span" sx={{ color: "text.disabled", fontWeight: 400, ml: 0.5 }}>
                (optional)
              </Typography>
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Constraints, materials, or anything else that helps."
              sx={fieldSx}
            />
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          pt: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Button
          onClick={onClose}
          disabled={loading}
          sx={{ color: "text.secondary", fontWeight: 500 }}
        >
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={loading} disableElevation>
          {loading ? "Saving…" : "Start session"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
