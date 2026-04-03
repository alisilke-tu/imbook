import { Handle, Position } from '@xyflow/react';
import { Box, Typography } from '@mui/material';

export default function EndNode() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} />

      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid',
          borderColor: '#f44336',
          bgcolor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: '#f44336',
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
        End
      </Typography>
    </Box>
  );
}
