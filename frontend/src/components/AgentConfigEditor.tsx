import { useState, useContext } from "react";
import {
  Box,
  Button,
  TextField,
  Paper,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Divider,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";
import ToolSelector from "./ToolSelector.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const AVAILABLE_MODELS = [
  { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { value: "google/gemini-2.0-pro", label: "Gemini 2.0 Pro" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
];

const EXAMPLE_PROMPTS = {
  default: `You are a helpful assistant with access to a knowledge base. When users ask questions, use the search_chunks tool to find relevant information from the book. Provide clear, accurate answers based on the retrieved content.

Guidelines:
- Always search the knowledge base before answering questions about the book
- Cite specific passages when relevant
- If information isn't in the knowledge base, say so clearly
- Be concise but thorough in your responses`,
  
  researcher: `You are a precise researcher focused on accuracy and factual information. Always search the knowledge base before answering. Cite specific passages and be factual.

Guidelines:
- Prioritize accuracy over creativity
- Always cite sources from the knowledge base
- Use exact quotes when possible
- Avoid speculation or inference beyond the source material`,
  
  teacher: `You are a creative teacher who explains concepts clearly and engagingly. Use the knowledge base to find information, then explain it in an easy-to-understand way with examples and analogies.

Guidelines:
- Search the knowledge base for accurate information first
- Explain concepts using analogies and examples
- Break down complex ideas into simpler parts
- Connect ideas to real-world applications when possible`,
};

type AgentConfigEditorProps = {
  config: any;
  onSave: () => void;
  onCancel: () => void;
};

type ToolConfig = {
  name: string;
  dataset_id: string;
  params?: Record<string, string>;
};

export default function AgentConfigEditor({ config, onSave, onCancel }: AgentConfigEditorProps) {
  const { auth } = useContext(FirebaseContext);
  const [name, setName] = useState(config?.name || "");
  const [description, setDescription] = useState(config?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(config?.system_prompt || EXAMPLE_PROMPTS.default);
  const [model, setModel] = useState(config?.model || "google/gemini-2.0-flash-001");
  const [maxTokens, setMaxTokens] = useState(config?.max_tokens || 4000);
  const [temperature, setTemperature] = useState(config?.temperature || 0.7);
  const [availableTools, setAvailableTools] = useState<string[]>(config?.available_tools || []);
  const [toolConfigs, setToolConfigs] = useState<ToolConfig[]>(config?.tool_configs || []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadExamplePrompt = (type: keyof typeof EXAMPLE_PROMPTS) => {
    setSystemPrompt(EXAMPLE_PROMPTS[type]);
  };

  const handleSave = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    if (!name.trim()) {
      setError("Agent name is required");
      return;
    }

    if (!systemPrompt.trim()) {
      setError("System prompt is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name,
        description,
        system_prompt: systemPrompt,
        model,
        max_tokens: maxTokens,
        temperature,
        available_tools: availableTools, // Keep for backward compatibility
        tool_configs: toolConfigs, // NEW - rich tool configuration
        is_enabled: config?.is_enabled ?? true,
      };

      const url = config?.id
        ? `${API_URL}/pipelines/configs/${config.id}`
        : `${API_URL}/pipelines/configs`;

      const method = config?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSave();
      } else {
        const data = await res.json().catch(() => ({}));
        const errorMsg = (data as { message?: string })?.message || "Failed to save agent configuration";
        setError(errorMsg);
        console.error("Save agent error:", data);
      }
    } catch (err) {
      setError("Failed to save agent configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 3 }}>
      <Paper sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
          {config?.id ? "Edit Agent Configuration" : "Create New Agent"}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Basic Info */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Basic Information
            </Typography>
            <TextField
              label="Agent Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              sx={{ mb: 2 }}
              placeholder="e.g., Research Assistant"
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="Brief description of what this agent does"
            />
          </Box>

          <Divider />

          {/* System Prompt */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6">System Instructions</Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" onClick={() => loadExamplePrompt("default")}>
                  Default
                </Button>
                <Button size="small" onClick={() => loadExamplePrompt("researcher")}>
                  Researcher
                </Button>
                <Button size="small" onClick={() => loadExamplePrompt("teacher")}>
                  Teacher
                </Button>
              </Box>
            </Box>
            <TextField
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              fullWidth
              multiline
              rows={12}
              required
              placeholder="Define how the agent should behave, what guidelines to follow, and how to use tools..."
              sx={{
                "& .MuiInputBase-root": {
                  fontFamily: "monospace",
                  fontSize: "0.9rem",
                },
              }}
            />
          </Box>

          <Divider />

          {/* Model Settings */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Model Settings
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Model</InputLabel>
                <Select value={model} onChange={(e) => setModel(e.target.value)} label="Model">
                  {AVAILABLE_MODELS.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Max Tokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4000)}
                sx={{ width: 200 }}
                inputProps={{ min: 100, max: 100000, step: 100 }}
              />
            </Box>

            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Temperature: {temperature.toFixed(2)}
              </Typography>
              <Slider
                value={temperature}
                onChange={(_, value) => setTemperature(value as number)}
                min={0}
                max={2}
                step={0.1}
                marks={[
                  { value: 0, label: "Precise (0.0)" },
                  { value: 0.7, label: "Balanced (0.7)" },
                  { value: 1.5, label: "Creative (1.5)" },
                ]}
                valueLabelDisplay="auto"
              />
              <Typography variant="caption" color="text.secondary">
                Lower values make the agent more focused and deterministic. Higher values make it more
                creative and varied.
              </Typography>
            </Box>
          </Box>

          <Divider />

          {/* Tools */}
          <Box>
            <ToolSelector 
              selectedTools={availableTools} 
              toolConfigs={toolConfigs}
              onChange={(tools, configs) => {
                setAvailableTools(tools);
                setToolConfigs(configs);
              }} 
            />
          </Box>

          <Divider />

          {/* Actions */}
          <Box sx={{ display: "flex", justifyContent: "space-between", pt: 2 }}>
            <Button onClick={onCancel} size="large">
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={saving} size="large">
              {saving ? "Saving..." : config?.id ? "Update Agent" : "Create Agent"}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
