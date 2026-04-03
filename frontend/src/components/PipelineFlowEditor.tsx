import { useCallback, useState, useContext, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Button,
  Paper,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Alert,
  Tooltip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { FirebaseContext } from '../lib/firebase.tsx';

import AgentNode from './nodes/AgentNode.tsx';
import ConditionNode from './nodes/ConditionNode.tsx';
import StartNode from './nodes/StartNode.tsx';
import EndNode from './nodes/EndNode.tsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** DB expects UUID primary keys for nodes and edges. */
const newId = () => crypto.randomUUID();

const nodeTypes = {
  start: StartNode,
  agent: AgentNode,
  condition: ConditionNode,
  end: EndNode,
};

type AgentConfig = {
  id: string;
  name: string;
  description: string;
  model: string;
};

type PipelineFlowEditorProps = {
  pipelineId?: string;
  initialName?: string;
  initialDescription?: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
};

export default function PipelineFlowEditor({
  pipelineId,
  initialName = '',
  initialDescription = '',
  initialNodes = [],
  initialEdges = [],
}: PipelineFlowEditorProps) {
  const navigate = useNavigate();
  const { auth } = useContext(FirebaseContext);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, [auth?.currentUser]);

  const fetchAgents = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/pipelines/configs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableAgents(data.configs || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => {
      // For condition nodes, add label based on handle
      const sourceNode = nodes.find((n) => n.id === params.source);
      const label: string | undefined =
        sourceNode?.type === 'condition'
          ? params.sourceHandle === 'true'
            ? 'Yes'
            : 'No'
          : undefined;
      setEdges((eds) =>
        addEdge({ ...params, id: newId(), label }, eds)
      );
    },
    [setEdges, nodes]
  );

  const addStartNode = () => {
    // Check if start node already exists
    if (nodes.some((n) => n.type === 'start')) {
      setError('Start node already exists');
      return;
    }
    const newNode: Node = {
      id: newId(),
      type: 'start',
      position: { x: 250, y: 50 },
      data: { label: 'Start' },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const addEndNode = () => {
    const newNode: Node = {
      id: newId(),
      type: 'end',
      position: { x: 250, y: nodes.length * 150 + 200 },
      data: { label: 'End' },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const addAgentNode = (agent: AgentConfig) => {
    const newNode: Node = {
      id: newId(),
      type: 'agent',
      position: { x: 250, y: nodes.length * 150 + 100 },
      data: {
        label: agent.name,
        agentId: agent.id,
        config: agent,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setAgentDialogOpen(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Pipeline name is required');
      return;
    }

    // Validate pipeline structure
    if (!nodes.some((n) => n.type === 'start')) {
      setError('Pipeline must have a start node');
      return;
    }
    if (!nodes.some((n) => n.type === 'end')) {
      setError('Pipeline must have an end node');
      return;
    }

    setSaving(true);
    setError(null);

    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;

    try {
      // Convert nodes and edges to backend format
      const backendNodes = nodes.map((node) => ({
        id: node.id,
        node_type: node.type,
        agent_config_id: node.data.agentId || null,
        position_x: node.position.x,
        position_y: node.position.y,
        config: node.data,
      }));

      const backendEdges = edges.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const conditionType =
          sourceNode?.type === 'condition'
            ? sourceNode.data.conditionType
            : null;
        const conditionValue =
          sourceNode?.type === 'condition'
            ? sourceNode.data.conditionValue
            : null;

        return {
          id: edge.id,
          source_node_id: edge.source,
          target_node_id: edge.target,
          condition_type: conditionType,
          condition_value: conditionValue,
          label: edge.label || null,
        };
      });

      const payload = {
        name,
        description,
        nodes: backendNodes,
        edges: backendEdges,
      };

      const url = pipelineId
        ? `${API_URL}/pipelines/workflows/${pipelineId}`
        : `${API_URL}/pipelines/workflows`;
      const method = pipelineId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        navigate('/admin/pipelines?tab=1');
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to save pipeline');
      }
    } catch (err) {
      setError('Failed to save pipeline');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          <TextField
            label="Pipeline Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            sx={{ flex: 2 }}
          />
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Pipeline'}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/admin/pipelines?tab=1')}>
            Cancel
          </Button>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </Paper>

      {/* Toolbar */}
      <Paper sx={{ p: 1, borderRadius: 0, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" onClick={addStartNode}>
          + Start Node
        </Button>
        <Button size="small" variant="outlined" onClick={addEndNode}>
          + End Node
        </Button>
        <Button size="small" variant="outlined" onClick={() => setAgentDialogOpen(true)}>
          + Agent Node
        </Button>
        <Tooltip title="Not available in this version — branching conditions may return in a later release.">
          <span>
            <Button size="small" variant="outlined" disabled>
              + Condition Node
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Planned for a future step — collect user feedback between agents.">
          <span>
            <Button size="small" variant="outlined" disabled>
              + User feedback
            </Button>
          </span>
        </Tooltip>
      </Paper>

      {/* Flow Editor */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </Box>

      {/* Agent Selection Dialog */}
      <Dialog open={agentDialogOpen} onClose={() => setAgentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Agent</DialogTitle>
        <DialogContent>
          <List>
            {availableAgents.map((agent) => (
              <ListItem key={agent.id} disablePadding>
                <ListItemButton onClick={() => addAgentNode(agent)}>
                  <ListItemText
                    primary={agent.name}
                    secondary={agent.description || agent.model}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAgentDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
