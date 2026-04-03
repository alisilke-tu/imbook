import { Handle, Position } from '@xyflow/react';
import { Box, Typography, Chip, Stack, Divider } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';

type AgentConfigShape = {
  name?: string;
  description?: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  available_tools?: string[];
};

type AgentNodeProps = {
  data: {
    label: string;
    agentId?: string;
    config?: AgentConfigShape;
  };
};

function formatModel(model?: string) {
  if (!model) return '—';
  const parts = model.split('/');
  return parts.length > 1 ? parts.slice(-2).join('/') : model;
}

export default function AgentNode({ data }: AgentNodeProps) {
  const cfg = data.config;
  const title = cfg?.name || data.label || 'Agent';
  const desc = cfg?.description?.trim();
  const tools = cfg?.available_tools?.filter(Boolean) ?? [];

  return (
    <Box
      sx={{
        padding: 1.5,
        border: '2px solid #2196f3',
        borderRadius: 2,
        background: 'white',
        minWidth: 220,
        maxWidth: 280,
        boxShadow: 2,
      }}
    >
      <Handle type="target" position={Position.Top} />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
        <SmartToyIcon sx={{ color: '#2196f3', fontSize: 20, mt: 0.15 }} />
        <Typography variant="subtitle2" fontWeight="bold" sx={{ lineHeight: 1.3 }}>
          {title}
        </Typography>
      </Box>

      {desc ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.35,
            mb: 1,
          }}
        >
          {desc}
        </Typography>
      ) : null}

      <Divider sx={{ my: 0.75 }} />

      <Stack spacing={0.5}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
          <Chip label={formatModel(cfg?.model)} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 22 }} />
          {cfg?.temperature !== undefined && cfg?.temperature !== null && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              temp {cfg.temperature}
            </Typography>
          )}
          {cfg?.max_tokens !== undefined && cfg?.max_tokens !== null && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              max {cfg.max_tokens} tok
            </Typography>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          {tools.length === 0
            ? 'No tools'
            : tools.length <= 4
              ? `Tools: ${tools.join(', ')}`
              : `Tools: ${tools.slice(0, 3).join(', ')} +${tools.length - 3} more`}
        </Typography>
      </Stack>

      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
