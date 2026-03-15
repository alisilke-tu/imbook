import {
  Box,
  Paper,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import EventIcon from "@mui/icons-material/Event";

const ROADMAP_ENTRIES = [
  {
    date: "15.03.2026",
    label: "First pipeline & chat",
    status: "done" as const,
    title: "First ETL pipeline version and first chat version",
    body: (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          <strong>Log:</strong> We implemented the first ETL pipeline and the first chat version.
          We have a basic pipeline that gets from PDF to chat. Along the way, document and table
          retrieval is not yet reliable — &quot;we still can&apos;t find you yet&quot; — so the next
          phase focuses on fine-tuning retrieval, chunking, and embeddings.
        </Typography>
      </>
    ),
  },
  {
    date: "Next steps",
    label: "Still missing",
    status: "pending" as const,
    title: "Planned improvements",
    body: (
      <List dense disablePadding>
        {[
          "Fine-tuning the embedding",
          "Trying out (evaluation / experiments)",
          "Fine-tuning the chapters and reference graph",
          "Fine-tuning the graph relation extraction (embeddings and context for documents and tables)",
        ].map((text, i) => (
          <ListItem key={i} disableGutters>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </ListItemIcon>
            <ListItemText primary={text} primaryTypographyProps={{ variant: "body2" }} />
          </ListItem>
        ))}
      </List>
    ),
  },
  {
    date: "01.04.2026",
    label: "Next check-in",
    status: "milestone" as const,
    title: "Check-in goal",
    body: (
      <Typography variant="body2" color="text.secondary">
        Have chunking and embedding more fine-tuned, and a first version for the frontend
        brainstormed: how the end user will interact with the system.
      </Typography>
    ),
  },
];

function TimelineDotIcon({
  status,
}: {
  status: "done" | "pending" | "milestone";
}) {
  const sx = { fontSize: 20 };
  if (status === "done") return <CheckCircleOutlineIcon sx={sx} color="success" />;
  if (status === "milestone") return <EventIcon sx={sx} color="primary" />;
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: 2,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    />
  );
}

export default function AdminRoadmapPage() {
  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 2 }}>
        Roadmap
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Project timeline and next steps (frontend-only; no backend).
      </Typography>

      <Box sx={{ position: "relative", pl: 3 }}>
        {/* Vertical line */}
        <Box
          sx={{
            position: "absolute",
            left: 7,
            top: 12,
            bottom: 12,
            width: 2,
            bgcolor: "divider",
            borderRadius: 1,
          }}
        />
        {ROADMAP_ENTRIES.map((entry, index) => (
          <Box
            key={index}
            sx={{
              position: "relative",
              display: "flex",
              gap: 2,
              mb: index < ROADMAP_ENTRIES.length - 1 ? 3 : 0,
            }}
          >
            <Box
              sx={{
                position: "absolute",
                left: -24,
                top: 4,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                bgcolor: "background.paper",
              }}
            >
              <TimelineDotIcon status={entry.status} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" sx={{ mb: 0.5 }}>
                {entry.date}
              </Typography>
              <Paper
                elevation={0}
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, borderColor: "divider" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {entry.title}
                  </Typography>
                  <Chip
                    size="small"
                    label={entry.label}
                    color={
                      entry.status === "done"
                        ? "success"
                        : entry.status === "milestone"
                          ? "primary"
                          : "default"
                    }
                    variant={entry.status === "pending" ? "outlined" : "filled"}
                  />
                </Box>
                {entry.body}
              </Paper>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
