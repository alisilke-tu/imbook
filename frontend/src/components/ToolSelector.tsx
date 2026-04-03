import { useState, useEffect, useContext } from "react";
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type Tool = {
  name: string;
  description: string;
  category: string;
};

type ToolConfig = {
  name: string;
  dataset_id: string;
  params?: Record<string, string>;
};

type Dataset = {
  id: string;
  name: string;
  version: number;
  status: string;
};

type ToolSelectorProps = {
  selectedTools?: string[]; // DEPRECATED - for backward compatibility
  toolConfigs?: ToolConfig[]; // NEW - rich tool configuration
  onChange: (tools: string[], toolConfigs: ToolConfig[]) => void;
};

export default function ToolSelector({ selectedTools = [], toolConfigs = [], onChange }: ToolSelectorProps) {
  const { auth } = useContext(FirebaseContext);
  const [tools, setTools] = useState<Tool[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Internal state: use toolConfigs if available, otherwise migrate from selectedTools
  const [internalConfigs, setInternalConfigs] = useState<ToolConfig[]>(toolConfigs);

  useEffect(() => {
    // Migrate from legacy selectedTools to toolConfigs
    if (toolConfigs.length === 0 && selectedTools.length > 0) {
      const migrated = selectedTools.map(name => ({ name, dataset_id: "" }));
      setInternalConfigs(migrated);
    } else {
      setInternalConfigs(toolConfigs);
    }
  }, [selectedTools, toolConfigs]);

  useEffect(() => {
    const fetchData = async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;

      try {
        // Fetch tools
        const toolsRes = await fetch(`${API_URL}/pipelines/tools`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (toolsRes.ok) {
          const data = await toolsRes.json();
          setTools(data.tools || []);
        }

        // Fetch datasets (only ready ones)
        const datasetsRes = await fetch(`${API_URL}/content/datasets?status=ready`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (datasetsRes.ok) {
          const data = await datasetsRes.json();
          setDatasets(data.datasets || []);
        }
      } catch (err) {
        setError("Failed to fetch tools and datasets");
      } finally {
        setLoading(false);
      }
    };

    if (auth?.currentUser) {
      fetchData();
    }
  }, [auth?.currentUser]);

  const handleToggle = (toolName: string) => {
    const isSelected = internalConfigs.some(tc => tc.name === toolName);
    let newConfigs: ToolConfig[];
    
    if (isSelected) {
      newConfigs = internalConfigs.filter(tc => tc.name !== toolName);
    } else {
      newConfigs = [...internalConfigs, { name: toolName, dataset_id: "" }];
    }
    
    setInternalConfigs(newConfigs);
    // Also provide legacy selectedTools array for backward compatibility
    onChange(newConfigs.map(tc => tc.name), newConfigs);
  };

  const handleDatasetChange = (toolName: string, datasetId: string) => {
    const newConfigs = internalConfigs.map(tc =>
      tc.name === toolName ? { ...tc, dataset_id: datasetId } : tc
    );
    setInternalConfigs(newConfigs);
    onChange(newConfigs.map(tc => tc.name), newConfigs);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "knowledge":
        return "#4CAF50";
      case "utility":
        return "#2196F3";
      case "external":
        return "#FF9800";
      default:
        return "#9E9E9E";
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
        Available Tools
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select which tools this agent can use. Tools allow the agent to access external
        functionality like searching the knowledge base.
      </Typography>

      <FormGroup>
        {tools.map((tool) => {
          const isSelected = internalConfigs.some(tc => tc.name === tool.name);
          const toolConfig = internalConfigs.find(tc => tc.name === tool.name);
          const needsDataset = tool.category === "knowledge";

          return (
            <Paper
              key={tool.name}
              sx={{
                p: 2,
                mb: 1.5,
                border: isSelected ? "2px solid #1976d2" : "1px solid #e0e0e0",
                bgcolor: isSelected ? "rgba(25, 118, 210, 0.04)" : "transparent",
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleToggle(tool.name)}
                  />
                }
                label={
                  <Box sx={{ width: "100%" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {tool.name}
                      </Typography>
                      <Chip
                        label={tool.category}
                        size="small"
                        sx={{
                          bgcolor: getCategoryColor(tool.category),
                          color: "white",
                          fontSize: "0.7rem",
                          height: 20,
                        }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {tool.description}
                    </Typography>
                    
                    {isSelected && needsDataset && (
                      <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                        <InputLabel>Dataset (Required)</InputLabel>
                        <Select
                          value={toolConfig?.dataset_id || ""}
                          onChange={(e) => handleDatasetChange(tool.name, e.target.value)}
                          label="Dataset (Required)"
                          required
                        >
                          {datasets.length === 0 ? (
                            <MenuItem value="" disabled>
                              No ready datasets available
                            </MenuItem>
                          ) : (
                            datasets.map((dataset) => (
                              <MenuItem key={dataset.id} value={dataset.id}>
                                {dataset.name} v{dataset.version}
                              </MenuItem>
                            ))
                          )}
                        </Select>
                        {(!toolConfig?.dataset_id || toolConfig.dataset_id === "") && (
                          <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                            Please select a dataset for this tool to work
                          </Typography>
                        )}
                      </FormControl>
                    )}
                  </Box>
                }
                sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
              />
            </Paper>
          );
        })}
      </FormGroup>

      {internalConfigs.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No tools selected. The agent will only be able to respond based on its training data.
        </Alert>
      )}
      
      {internalConfigs.some(tc => tc.name === "search_chunks" && !tc.dataset_id) && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Knowledge retrieval tools require a dataset to be selected.
        </Alert>
      )}
    </Box>
  );
}
