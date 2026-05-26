import { useState, useEffect, useContext } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type AgentConfig = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number;
  available_tools: string[];
  is_enabled: boolean;
  is_default: boolean;
  version: number;
  created_at: string;
};

type Pipeline = {
  id: string;
  name: string;
  description: string;
  created_by: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ConfigSummary = {
  id: string;
  name: string;
};

type DatasetSummary = {
  id: string;
  status: string;
};

export default function AdminPipelinesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { auth } = useContext(FirebaseContext);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(parseInt(searchParams.get('tab') || '0'));

  const fetchConfigs = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/pipelines/configs?include_disabled=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      } else {
        setError("Failed to fetch configurations");
      }
    } catch (err) {
      setError("Failed to fetch configurations");
    } finally {
      setLoading(false);
    }
  };

  const fetchPipelines = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/pipelines/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPipelines(data.pipelines || []);
      } else {
        setError("Failed to fetch pipelines");
      }
    } catch (err) {
      setError("Failed to fetch pipelines");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth?.currentUser) {
      if (tabValue === 0) {
        fetchConfigs();
      } else {
        fetchPipelines();
      }
    }
  }, [auth?.currentUser, tabValue]);

  const handleTabChange = (_: any, newValue: number) => {
    setTabValue(newValue);
    setSearchParams({ tab: newValue.toString() });
    setLoading(true);
  };

  const handleToggle = async (id: string, currentState: boolean) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const config = configs.find((c) => c.id === id);
      if (!config) return;

      await fetch(`${API_URL}/pipelines/configs/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          system_prompt: config.system_prompt,
          model: config.model,
          max_tokens: config.max_tokens,
          temperature: config.temperature,
          available_tools: config.available_tools,
          is_enabled: !currentState,
        }),
      });

      fetchConfigs();
    } catch (err) {
      setError("Failed to toggle configuration");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this configuration?")) return;

    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      await fetch(`${API_URL}/pipelines/configs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      fetchConfigs();
    } catch (err) {
      setError("Failed to delete configuration");
    }
  };

  const handleEdit = (config: AgentConfig) => {
    navigate(`/admin/pipelines/configurator?id=${config.id}`);
  };

  const handleCreate = () => {
    navigate("/admin/pipelines/configurator?new=true");
  };

  const handleSeed = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      setError(null);

      const settingsRes = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!settingsRes.ok) {
        throw new Error("failed to load settings");
      }
      const settingsData = await settingsRes.json();

      let datasetId = settingsData.default_dataset_id || "";
      if (!datasetId) {
        const datasetsRes = await fetch(`${API_URL}/content/datasets?status=ready`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!datasetsRes.ok) {
          throw new Error("failed to load ready datasets");
        }
        const datasetsData = await datasetsRes.json();
        const datasets = (datasetsData.datasets || []) as DatasetSummary[];
        if (datasets.length === 0) {
          throw new Error("No ready dataset found. Finish embedding one in the Content admin first.");
        }
        datasetId = datasets[0].id;
      }

      const configsRes = await fetch(`${API_URL}/pipelines/configs?include_disabled=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!configsRes.ok) {
        throw new Error("failed to load existing agent configs");
      }
      const configsData = await configsRes.json();
      const existingConfigs = new Map<string, string>();
      for (const cfg of (configsData.configs || []) as ConfigSummary[]) {
        existingConfigs.set(cfg.name, cfg.id);
      }

      const ensureConfig = async (payload: Record<string, unknown>) => {
        const existingId = existingConfigs.get(String(payload.name));
        if (existingId) return existingId;

        const res = await fetch(`${API_URL}/pipelines/configs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { message?: string })?.message ?? `Failed to create agent config ${String(payload.name)}`);
        }
        const createdId = (data as { id?: string })?.id;
        if (!createdId) {
          throw new Error(`Config ${String(payload.name)} was created but no id was returned`);
        }
        existingConfigs.set(String(payload.name), createdId);
        return createdId;
      };

      const strictConfigId = await ensureConfig({
        name: "Strict Book Answerer",
        description: "Answers only from book evidence with no outside knowledge",
        system_prompt: `You answer only from the book content retrieved by search_chunks.

Rules:
- Always search the book first
- Use only statements that are directly supported by retrieved passages
- If nothing relevant is found, say clearly that the book does not provide a reliable answer
- Do not add outside knowledge or speculation
- Mention book evidence briefly and stay concise`,
        model: "google/gemini-2.0-flash-001",
        max_tokens: 3000,
        temperature: 0.1,
        tool_configs: [{ name: "search_chunks", dataset_id: datasetId }],
        is_default: false,
      });

      const researchConfigId = await ensureConfig({
        name: "Book Evidence Researcher",
        description: "Extracts evidence from the book for a later synthesis step",
        system_prompt: `You are the research step in a two-agent workflow.

Task:
- Search the book thoroughly for evidence relevant to the question
- Return short bullet points with the most relevant passages and concepts
- If you cannot find a meaningful match, output exactly: NO_EVIDENCE
- Do not give a polished final answer
- Do not use general knowledge as a substitute for evidence`,
        model: "google/gemini-2.0-flash-001",
        max_tokens: 3000,
        temperature: 0.2,
        tool_configs: [{ name: "search_chunks", dataset_id: datasetId }],
        is_default: false,
      });

      const synthConfigId = await ensureConfig({
        name: "General Knowledge Synthesizer",
        description: "Final synthesis step that can fall back to domain knowledge",
        system_prompt: `You are the final synthesis step in a two-agent workflow.

You receive the original question plus the previous agent's evidence.

Rules:
- If the previous agent found book evidence, answer primarily from that evidence
- If the previous agent says NO_EVIDENCE or the evidence is clearly insufficient, fall back to general knowledge in the same domain
- Clearly mark when you are using general knowledge fallback
- Keep the answer grounded in the topic of the book
- Be explicit about whether the answer is book-based or fallback-based`,
        model: "google/gemini-2.0-flash-001",
        max_tokens: 3500,
        temperature: 0.5,
        tool_configs: [],
        is_default: false,
      });

      const pipelinesRes = await fetch(`${API_URL}/pipelines/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pipelinesRes.ok) {
        throw new Error("failed to load existing workflows");
      }
      const pipelinesData = await pipelinesRes.json();
      const existingPipelines = new Set<string>((pipelinesData.pipelines || []).map((p: Pipeline) => p.name));

      const createWorkflow = async (payload: Record<string, unknown>) => {
        if (existingPipelines.has(String(payload.name))) {
          return;
        }
        const res = await fetch(`${API_URL}/pipelines/workflows`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { message?: string })?.message ?? `Failed to create workflow ${String(payload.name)}`);
        }
        existingPipelines.add(String(payload.name));
      };

      const strictStartId = crypto.randomUUID();
      const strictAgentId = crypto.randomUUID();
      const strictEndId = crypto.randomUUID();
      await createWorkflow({
        name: "Strict Book Workflow",
        description: "Single-agent workflow that answers only from book evidence",
        nodes: [
          { id: strictStartId, node_type: "start", agent_config_id: null, position_x: 250, position_y: 50, config: null },
          { id: strictAgentId, node_type: "agent", agent_config_id: strictConfigId, position_x: 250, position_y: 200, config: null },
          { id: strictEndId, node_type: "end", agent_config_id: null, position_x: 250, position_y: 350, config: null },
        ],
        edges: [
          { id: crypto.randomUUID(), source_node_id: strictStartId, target_node_id: strictAgentId, condition_type: null, condition_value: null, label: null },
          { id: crypto.randomUUID(), source_node_id: strictAgentId, target_node_id: strictEndId, condition_type: null, condition_value: null, label: null },
        ],
      });

      const researchStartId = crypto.randomUUID();
      const researchAgentId = crypto.randomUUID();
      const synthAgentId = crypto.randomUUID();
      const researchEndId = crypto.randomUUID();
      await createWorkflow({
        name: "Book-First Fallback Workflow",
        description: "Two-agent workflow that researches the book first and then falls back to general knowledge when needed",
        nodes: [
          { id: researchStartId, node_type: "start", agent_config_id: null, position_x: 250, position_y: 50, config: null },
          { id: researchAgentId, node_type: "agent", agent_config_id: researchConfigId, position_x: 250, position_y: 200, config: null },
          { id: synthAgentId, node_type: "agent", agent_config_id: synthConfigId, position_x: 250, position_y: 350, config: null },
          { id: researchEndId, node_type: "end", agent_config_id: null, position_x: 250, position_y: 500, config: null },
        ],
        edges: [
          { id: crypto.randomUUID(), source_node_id: researchStartId, target_node_id: researchAgentId, condition_type: null, condition_value: null, label: null },
          { id: crypto.randomUUID(), source_node_id: researchAgentId, target_node_id: synthAgentId, condition_type: null, condition_value: null, label: null },
          { id: crypto.randomUUID(), source_node_id: synthAgentId, target_node_id: researchEndId, condition_type: null, condition_value: null, label: null },
        ],
      });

      fetchConfigs();
      fetchPipelines();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed configurations and workflows");
    }
  };

  const handleDeletePipeline = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;

    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      await fetch(`${API_URL}/pipelines/workflows/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      fetchPipelines();
    } catch (err) {
      setError("Failed to delete workflow");
    }
  };

  const handleEditPipeline = (pipeline: Pipeline) => {
    navigate(`/admin/pipelines/workflow?id=${pipeline.id}`);
  };

  const handleCreateWorkflow = () => {
    navigate("/admin/pipelines/workflow?new=true");
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              fontSize: { xs: "1.5rem", md: "2rem" },
              fontWeight: 700,
              color: "black",
              letterSpacing: "-0.03125rem",
              mb: 1.5
            }}
          >
            {tabValue === 0 ? 'Agent Configurations' : 'Workflows'}
          </Typography>
          <Typography 
            sx={{ 
              fontSize: "1.0625rem",
              color: "#666666",
              lineHeight: 1.6
            }}
          >
            {tabValue === 0 
              ? 'Configure AI agents with custom instructions, models, and tools. Users can select these agents when chatting.'
              : 'Create multi-agent workflows with conditional routing and sequential execution.'
            }
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Button 
            variant="outlined" 
            onClick={handleSeed}
            sx={{
              minHeight: "44px",
              borderRadius: 2,
              fontSize: "0.9375rem",
              fontWeight: 600,
              textTransform: "none",
              borderColor: "#E5E5E5",
              color: "#666666",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: "transparent"
              }
            }}
          >
            Seed Default Configs & Workflows
          </Button>
          <Button 
            variant="contained" 
            startIcon={tabValue === 0 ? <AddIcon /> : <AccountTreeIcon />}
            onClick={tabValue === 0 ? handleCreate : handleCreateWorkflow}
            sx={{
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
            {tabValue === 0 ? 'Create New Agent' : 'Create Workflow'}
          </Button>
        </Box>
      </Box>

      {/* Main Tabs */}
      <Tabs 
        value={tabValue} 
        onChange={handleTabChange}
        sx={{ 
          mb: 3,
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Tab label="Agents" />
        <Tab label="Workflows" />
      </Tabs>

      {/* Agents Tab */}
      {tabValue === 0 && (
        <>
          {configs.length === 0 ? (
            <Box sx={{ 
              bgcolor: "#FAFAFA",
              borderRadius: 2,
              p: 4,
              border: "1px solid #E5E5E5",
              textAlign: "center"
            }}>
              <Typography sx={{ fontSize: "0.9375rem", color: "#999999" }}>
                No agents configured yet. Create your first agent to get started.
              </Typography>
            </Box>
          ) : (
        <Box sx={{ 
          border: "1px solid #E5E5E5",
          borderRadius: 2,
          overflow: "hidden"
        }}>
          <List disablePadding>
            {configs.map((config, index) => (
              <ListItem
                key={config.id}
                sx={{
                  py: 3,
                  px: 3,
                  borderBottom: index < configs.length - 1 ? "1px solid #E5E5E5" : "none",
                  "&:hover": { bgcolor: "#FAFAFA" }
                }}
                secondaryAction={
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                    <Tabs
                      value={config.is_enabled ? 0 : 1}
                      onChange={() => handleToggle(config.id, config.is_enabled)}
                      sx={{
                        minHeight: "36px",
                        "& .MuiTabs-indicator": {
                          display: "none"
                        }
                      }}
                    >
                      <Tab 
                        label="Active" 
                        sx={{
                          minHeight: "36px",
                          minWidth: "80px",
                          px: 2,
                          py: 0.75,
                          fontSize: "0.875rem",
                          fontWeight: 500,
                          textTransform: "none",
                          borderRadius: 1.5,
                          bgcolor: "transparent",
                          color: config.is_enabled ? "#1A1A1A" : "#999999",
                          "&:hover": {
                            bgcolor: "#F5F5F5"
                          }
                        }}
                      />
                      <Tab 
                        label="Inactive" 
                        sx={{
                          minHeight: "36px",
                          minWidth: "80px",
                          px: 2,
                          py: 0.75,
                          fontSize: "0.875rem",
                          fontWeight: 500,
                          textTransform: "none",
                          borderRadius: 1.5,
                          bgcolor: "transparent",
                          color: !config.is_enabled ? "#1A1A1A" : "#999999",
                          "&:hover": {
                            bgcolor: "#F5F5F5"
                          }
                        }}
                      />
                    </Tabs>
                    <IconButton 
                      onClick={() => handleEdit(config)}
                      sx={{ 
                        color: "#999999",
                        "&:hover": { 
                          bgcolor: "#F5F5F5",
                          color: "#666666"
                        }
                      }}
                    >
                      <EditOutlinedIcon sx={{ fontSize: "1.25rem" }} />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDelete(config.id)}
                      sx={{ 
                        color: "#999999",
                        "&:hover": { 
                          bgcolor: "#F5F5F5",
                          color: "#666666"
                        }
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: "1.25rem" }} />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
                      <Typography 
                        sx={{ 
                          fontSize: "1.0625rem",
                          fontWeight: 500,
                          color: config.is_enabled ? "#1A1A1A" : "#999999"
                        }}
                      >
                        {config.name}
                      </Typography>
                      {config.is_default && (
                        <Chip 
                          label="Default" 
                          size="small"
                          sx={{
                            bgcolor: "primary.main",
                            color: "white",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            height: "24px"
                          }}
                        />
                      )}
                      <Chip 
                        label={config.is_enabled ? "Enabled" : "Disabled"} 
                        size="small"
                        sx={{
                          bgcolor: config.is_enabled ? "#F5F5F5" : "transparent",
                          color: config.is_enabled ? "success.main" : "#999999",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          height: "24px",
                          border: config.is_enabled ? "none" : "1px solid #E5E5E5"
                        }}
                      />
                      <Chip 
                        label={`v${config.version}`} 
                        size="small"
                        sx={{
                          bgcolor: "transparent",
                          color: "#666666",
                          fontSize: "0.75rem",
                          height: "24px",
                          border: "1px solid #E5E5E5"
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontSize: "0.9375rem",
                          color: "#666666",
                          opacity: config.is_enabled ? 1 : 0.6,
                          mb: 1.5
                        }}
                      >
                        {config.description}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Chip 
                          label={config.model.split('/').pop()} 
                          size="small"
                          sx={{
                            bgcolor: "#F5F5F5",
                            color: "primary.main",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            height: "24px"
                          }}
                        />
                        <Chip 
                          label={`Temp: ${config.temperature}`} 
                          size="small"
                          sx={{
                            bgcolor: "#F5F5F5",
                            color: "#666666",
                            fontSize: "0.75rem",
                            height: "24px"
                          }}
                        />
                        <Chip 
                          label={`${config.max_tokens} tokens`} 
                          size="small"
                          sx={{
                            bgcolor: "#F5F5F5",
                            color: "#666666",
                            fontSize: "0.75rem",
                            height: "24px"
                          }}
                        />
                        {config.available_tools?.map((tool: string) => (
                          <Chip 
                            key={tool}
                            label={tool} 
                            size="small"
                            sx={{
                              bgcolor: "#E8F5E9",
                              color: "#2E7D32",
                              fontSize: "0.75rem",
                              height: "24px"
                            }}
                          />
                        ))}
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
          )}
        </>
      )}

      {/* Workflows Tab */}
      {tabValue === 1 && (
        <>
          {pipelines.length === 0 ? (
            <Box sx={{ 
              bgcolor: "#FAFAFA",
              borderRadius: 2,
              p: 4,
              border: "1px solid #E5E5E5",
              textAlign: "center"
            }}>
              <Typography sx={{ fontSize: "0.9375rem", color: "#999999" }}>
                No workflows created yet. Create your first workflow to chain agents together.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ 
              border: "1px solid #E5E5E5",
              borderRadius: 2,
              overflow: "hidden"
            }}>
              <List disablePadding>
                {pipelines.map((pipeline, index) => (
                  <ListItem
                    key={pipeline.id}
                    sx={{
                      py: 3,
                      px: 3,
                      borderBottom: index < pipelines.length - 1 ? "1px solid #E5E5E5" : "none",
                      "&:hover": { bgcolor: "#FAFAFA" }
                    }}
                    secondaryAction={
                      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                        <IconButton 
                          onClick={() => handleEditPipeline(pipeline)}
                          sx={{ 
                            color: "#999999",
                            "&:hover": { 
                              bgcolor: "#F5F5F5",
                              color: "#666666"
                            }
                          }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: "1.25rem" }} />
                        </IconButton>
                        <IconButton 
                          onClick={() => handleDeletePipeline(pipeline.id)}
                          sx={{ 
                            color: "#999999",
                            "&:hover": { 
                              bgcolor: "#F5F5F5",
                              color: "#666666"
                            }
                          }}
                        >
                          <DeleteIcon sx={{ fontSize: "1.25rem" }} />
                        </IconButton>
                      </Box>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
                          <Typography 
                            sx={{ 
                              fontSize: "1.0625rem",
                              fontWeight: 500,
                              color: pipeline.is_enabled ? "#1A1A1A" : "#999999"
                            }}
                          >
                            {pipeline.name}
                          </Typography>
                          <Chip 
                            label={pipeline.is_enabled ? "Enabled" : "Disabled"} 
                            size="small"
                            sx={{
                              bgcolor: pipeline.is_enabled ? "#F5F5F5" : "transparent",
                              color: pipeline.is_enabled ? "success.main" : "#999999",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              height: "24px",
                              border: pipeline.is_enabled ? "none" : "1px solid #E5E5E5"
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Typography 
                          variant="body2"
                          sx={{ 
                            fontSize: "0.9375rem",
                            color: "#666666",
                            opacity: pipeline.is_enabled ? 1 : 0.6
                          }}
                        >
                          {pipeline.description || "No description"}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
