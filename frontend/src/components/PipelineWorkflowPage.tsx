import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useContext } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";
import PipelineFlowEditor from "./PipelineFlowEditor.tsx";
import { Node, Edge } from '@xyflow/react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type PipelineDetail = {
  pipeline: {
    id: string;
    name: string;
    description: string;
  };
  nodes: Array<{
    id: string;
    node_type: string;
    agent_config_id?: string;
    position_x: number;
    position_y: number;
    config?: any;
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    condition_type?: string;
    condition_value?: string;
    label?: string;
  }>;
};

async function fetchAgentConfig(token: string, configId: string) {
  const res = await fetch(`${API_URL}/pipelines/configs/${configId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export default function PipelineWorkflowPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { auth } = useContext(FirebaseContext);
  const [loading, setLoading] = useState(true);
  const [pipelineData, setPipelineData] = useState<PipelineDetail | null>(null);

  const pipelineId = searchParams.get("id");
  const isNew = searchParams.get("new") === "true";

  useEffect(() => {
    const fetchPipeline = async () => {
      if (isNew) {
        const startId = crypto.randomUUID();
        const endId = crypto.randomUUID();
        const defaultNodes: Node[] = [
          {
            id: startId,
            type: 'start',
            position: { x: 250, y: 50 },
            data: { label: 'Start' },
          },
          {
            id: endId,
            type: 'end',
            position: { x: 250, y: 400 },
            data: { label: 'End' },
          },
        ];
        setPipelineData({
          pipeline: { id: '', name: '', description: '' },
          nodes: defaultNodes.map(n => ({
            id: n.id,
            node_type: n.type!,
            position_x: n.position.x,
            position_y: n.position.y,
          })),
          edges: [],
        });
        setLoading(false);
        return;
      }

      if (!pipelineId) {
        navigate("/admin/pipelines?tab=1");
        return;
      }

      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/pipelines/workflows/${pipelineId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data: PipelineDetail = await res.json();
          const enrichedNodes = await Promise.all(
            data.nodes.map(async (node) => {
              if (node.node_type !== 'agent' || !node.agent_config_id) {
                return node;
              }
              const cfg = await fetchAgentConfig(token, node.agent_config_id);
              if (!cfg) {
                return node;
              }
              return { ...node, config: cfg };
            })
          );
          setPipelineData({ ...data, nodes: enrichedNodes });
        } else {
          navigate("/admin/pipelines?tab=1");
        }
      } catch (err) {
        navigate("/admin/pipelines?tab=1");
      } finally {
        setLoading(false);
      }
    };

    if (auth?.currentUser) {
      fetchPipeline();
    }
  }, [pipelineId, isNew, auth?.currentUser, navigate]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!pipelineData) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Typography>Pipeline not found</Typography>
      </Box>
    );
  }

  const initialNodes: Node[] = pipelineData.nodes.map((node) => {
    const agentLabel =
      node.node_type === 'agent'
        ? (node.config?.name || 'Agent')
        : undefined;

    return {
      id: node.id,
      type: node.node_type,
      position: { x: node.position_x, y: node.position_y },
      data: {
        label: agentLabel ?? (node.node_type === 'start' ? 'Start' : node.node_type === 'end' ? 'End' : node.node_type),
        agentId: node.agent_config_id,
        config: node.config,
        conditionType: node.config?.conditionType,
        conditionValue: node.config?.conditionValue,
      },
    };
  });

  const initialEdges: Edge[] = pipelineData.edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    label: edge.label,
    sourceHandle: edge.condition_type ? (edge.label === 'Yes' ? 'true' : 'false') : undefined,
  }));

  return (
    <PipelineFlowEditor
      pipelineId={pipelineId || undefined}
      initialName={pipelineData.pipeline.name}
      initialDescription={pipelineData.pipeline.description}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
    />
  );
}
