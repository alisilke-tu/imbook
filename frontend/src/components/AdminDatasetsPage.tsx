import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";

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

type EmbeddingModel = {
  id: string;
  name: string;
  provider: string;
  model_path: string;
  dimensions: number;
  base_url: string;
  max_tokens: number;
};

export default function AdminDatasetsPage() {
  const navigate = useNavigate();
  const { auth } = useContext(FirebaseContext);
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [models, setModels] = useState<EmbeddingModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetRow | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1");
  const [description, setDescription] = useState("");
  const [chunkSize, setChunkSize] = useState("500");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchDatasets();
    fetchModels();
    // Poll for status updates every 5 seconds
    const interval = setInterval(fetchDatasets, 5000);
    return () => clearInterval(interval);
  }, [auth?.currentUser]);

  const fetchDatasets = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/content/datasets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDatasets(data.datasets || []);
      }
    } catch (err) {
      console.error("Failed to fetch datasets", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/content/embedding-models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.models && data.models.length > 0) {
          setEmbeddingModel(data.models[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch models", err);
    }
  };

  const handleCreate = async () => {
    if (!name || !xmlFile) {
      setError("Name and XML file are required");
      return;
    }

    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    setCreating(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("version", version);
      formData.append("description", description);
      formData.append("chunk_size", chunkSize);
      formData.append("embedding_model", embeddingModel);
      formData.append("file", xmlFile);

      const res = await fetch(`${API_URL}/content/datasets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setCreateDialogOpen(false);
        resetForm();
        fetchDatasets();
      } else {
        const data = await res.json();
        setError(data.message || "Failed to create dataset");
      }
    } catch (err) {
      setError("Request failed");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDataset) return;

    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/content/datasets/${selectedDataset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setDeleteDialogOpen(false);
        setSelectedDataset(null);
        fetchDatasets();
      } else {
        const data = await res.json();
        setError(data.message || "Failed to delete dataset");
      }
    } catch (err) {
      setError("Request failed");
    }
  };

  const resetForm = () => {
    setName("");
    setVersion("1");
    setDescription("");
    setChunkSize("500");
    setXmlFile(null);
    setError(null);
  };

  const getStatusChip = (status: string) => {
    const colors: Record<string, "default" | "primary" | "success" | "error"> = {
      draft: "default",
      processing: "primary",
      ready: "success",
      failed: "error",
    };
    return (
      <Chip
        label={status}
        color={colors[status] || "default"}
        size="small"
        icon={status === "processing" ? <CircularProgress size={16} /> : undefined}
      />
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
          Create Dataset
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Version</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Chunks</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {datasets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No datasets yet. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              datasets.map((dataset) => (
                <TableRow key={dataset.id} hover>
                  <TableCell>
                    <Typography fontWeight={500}>{dataset.name}</Typography>
                    {dataset.description && (
                      <Typography variant="body2" color="text.secondary">
                        {dataset.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>v{dataset.version}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{dataset.embedding_model}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dataset.embedding_dim}d
                    </Typography>
                  </TableCell>
                  <TableCell>{getStatusChip(dataset.status)}</TableCell>
                  <TableCell align="right">{dataset.total_chunks}</TableCell>
                  <TableCell>
                    {new Date(dataset.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => navigate(`/admin/datasets/${dataset.id}`)}
                      >
                        View
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          setSelectedDataset(dataset);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        Delete
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => !creating && setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Embedding Dataset</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Version"
              type="number"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Chunk Size (characters)"
              type="number"
              value={chunkSize}
              onChange={(e) => setChunkSize(e.target.value)}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Embedding Model</InputLabel>
              <Select
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                label="Embedding Model"
              >
                {models.map((model) => (
                  <MenuItem key={model.id} value={model.id}>
                    {model.name} ({model.dimensions}d)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <Button variant="outlined" component="label" fullWidth>
                {xmlFile ? xmlFile.name : "Upload XML File"}
                <input
                  type="file"
                  accept=".xml"
                  hidden
                  onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} variant="contained" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Dataset</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete dataset "{selectedDataset?.name}" v{selectedDataset?.version}?
            This will also delete all {selectedDataset?.total_chunks} chunks.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
