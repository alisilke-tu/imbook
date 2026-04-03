import { useContext, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";
import { FirebaseContext } from "../lib/firebase.tsx";
import ReferenceGraphView, { type ContentListResponse } from "./ReferenceGraphView.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type DatasetRow = {
  id: string;
  name: string;
  version: number;
  description: string;
  chunk_size: number;
  embedding_model: string;
  embedding_dim: number;
  status: string;
  created_by: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  total_chunks: number;
};

type ChapterInfo = {
  id: string;
  chapter_number: string;
  title: string;
  sort_order: number;
  start_page: number;
  end_page: number;
  content_length: number;
};

type DatasetDetail = {
  dataset: DatasetRow;
  chapters: ChapterInfo[];
  chunks: Array<{
    id: string;
    paragraph_id: string;
    chunk_index: number;
    content: string;
  }>;
};

export default function AdminDatasetEmbeddingDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const { auth } = useContext(FirebaseContext);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [structure, setStructure] = useState<ContentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId || !auth?.currentUser) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const [dRes, sRes] = await Promise.all([
          fetch(`${API_URL}/content/datasets/${datasetId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/content/datasets/${datasetId}/structure`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (cancelled) return;

        if (!dRes.ok) {
          const data = await dRes.json().catch(() => ({}));
          setError(data.message || "Failed to load dataset");
          setDetail(null);
          setStructure(null);
          return;
        }

        const d: DatasetDetail = await dRes.json();
        setDetail(d);

        if (sRes.ok) {
          const s: ContentListResponse = await sRes.json();
          setStructure(s);
        } else {
          setStructure(null);
        }
      } catch {
        if (!cancelled) setError("Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [datasetId, auth?.currentUser]);

  if (!datasetId) {
    return (
      <Typography color="text.secondary">
        Missing dataset id in the URL.
      </Typography>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !detail) {
    return (
      <Box>
        <Button component={RouterLink} to="/admin/datasets" sx={{ mb: 2 }}>
          ← Back to datasets
        </Button>
        <Alert severity="error">{error || "Dataset not found"}</Alert>
      </Box>
    );
  }

  const ds = detail.dataset;

  return (
    <Box>
      <Button component={RouterLink} to="/admin/datasets" sx={{ mb: 2 }}>
        ← Back to datasets
      </Button>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: "2rem", fontWeight: 700, mb: 1 }}>
          {ds.name}{" "}
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
            v{ds.version}
          </Box>
        </Typography>
        <Typography sx={{ fontSize: "1.0625rem", color: "#666666" }}>
          Dataset ID: <Box component="code" sx={{ fontSize: "0.9em" }}>{ds.id}</Box>
        </Typography>
      </Box>

      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
        Dataset information
      </Typography>
      <Paper sx={{ p: 2, mb: 3, bgcolor: "#f5f5f5" }}>
        <Typography variant="body2">
          <strong>Model:</strong> {ds.embedding_model} ({ds.embedding_dim}d)
        </Typography>
        <Typography variant="body2">
          <strong>Chunk size:</strong> {ds.chunk_size} characters
        </Typography>
        <Typography variant="body2">
          <strong>Total chunks:</strong> {ds.total_chunks}
        </Typography>
        <Typography variant="body2">
          <strong>Status:</strong> {ds.status}
        </Typography>
        {ds.description && (
          <Typography variant="body2">
            <strong>Description:</strong> {ds.description}
          </Typography>
        )}
      </Paper>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Chapters ({detail.chapters.length})
      </Typography>
      {detail.chapters.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          No chapters found in this dataset.
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ mb: 3, maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Chapter</TableCell>
                <TableCell>Title</TableCell>
                <TableCell align="right">Pages</TableCell>
                <TableCell align="right">Content length</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.chapters.map((chapter) => (
                <TableRow key={chapter.id} hover>
                  <TableCell>{chapter.chapter_number}</TableCell>
                  <TableCell>{chapter.title}</TableCell>
                  <TableCell align="right">
                    {chapter.start_page}-{chapter.end_page}
                  </TableCell>
                  <TableCell align="right">
                    {chapter.content_length.toLocaleString()} chars
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Sample chunks (first 100)
      </Typography>
      {detail.chunks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          No chunks found in this dataset.
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ mb: 3, maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Paragraph ID</TableCell>
                <TableCell>Index</TableCell>
                <TableCell>Content preview</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.chunks.map((chunk) => (
                <TableRow key={chunk.id} hover>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                      {chunk.paragraph_id.slice(0, 8)}…
                    </Typography>
                  </TableCell>
                  <TableCell>{chunk.chunk_index}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 560 }}>
                      {chunk.content.slice(0, 100)}…
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ReferenceGraphView contentList={structure} title="Reference dependency graph" height={520} />
    </Box>
  );
}
