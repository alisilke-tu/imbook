import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useContext } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { FirebaseContext } from "../lib/firebase.tsx";
import AgentConfigEditor from "./AgentConfigEditor.tsx";

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

export default function PipelineConfiguratorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { auth } = useContext(FirebaseContext);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const configId = searchParams.get("id");
  const isNew = searchParams.get("new") === "true";

  useEffect(() => {
    const fetchConfig = async () => {
      if (isNew) {
        setConfig({
          name: "",
          description: "",
          system_prompt: "",
          model: "google/gemini-2.0-flash-001",
          max_tokens: 4000,
          temperature: 0.7,
          available_tools: ["search_chunks"],
        } as any);
        setLoading(false);
        return;
      }

      if (!configId) {
        navigate("/admin/pipelines");
        return;
      }

      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/pipelines/configs/${configId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        } else {
          navigate("/admin/pipelines");
        }
      } catch (err) {
        navigate("/admin/pipelines");
      } finally {
        setLoading(false);
      }
    };

    if (auth?.currentUser) {
      fetchConfig();
    }
  }, [configId, isNew, auth?.currentUser, navigate]);

  const handleSave = () => {
    navigate("/admin/pipelines");
  };

  const handleCancel = () => {
    navigate("/admin/pipelines");
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      height: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      bgcolor: "background.default",
      zIndex: 1300
    }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: "1px solid #E5E5E5",
          bgcolor: "background.paper"
        }}
      >
        <IconButton onClick={handleCancel} sx={{ color: "#666666" }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {isNew ? "Create Agent" : "Edit Agent"}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <AgentConfigEditor config={config} onSave={handleSave} onCancel={handleCancel} />
      </Box>
    </Box>
  );
}
