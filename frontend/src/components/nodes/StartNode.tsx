import { Handle, Position } from '@xyflow/react';
import { Box, Typography } from '@mui/material';

export default function StartNode() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid',
          borderColor: '#4caf50',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: '#4caf50',
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          mt: 0.35,
          fontSize: '0.65rem',
          fontWeight: 600,
          color: 'text.secondary',
          letterSpacing: 0.02,
        }}
      >
        Start
      </Typography>

      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
