import { Handle, Position } from '@xyflow/react';
import { Box, Typography, Select, MenuItem, TextField } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

type ConditionNodeProps = {
  data: {
    label?: string;
    conditionType?: string;
    conditionValue?: string;
    onConditionTypeChange?: (value: string) => void;
    onConditionValueChange?: (value: string) => void;
  };
};

export default function ConditionNode({ data }: ConditionNodeProps) {
  return (
    <Box sx={{ 
      padding: 2, 
      border: '2px solid #ff9800',
      borderRadius: 2,
      background: 'white',
      minWidth: 220,
      boxShadow: 2
    }}>
      <Handle type="target" position={Position.Top} />
      
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AccountTreeIcon sx={{ color: '#ff9800' }} />
        <Typography variant="subtitle2" fontWeight="bold">
          Condition
        </Typography>
      </Box>
      
      <Select
        value={data.conditionType || 'contains'}
        onChange={(e) => data.onConditionTypeChange?.(e.target.value)}
        fullWidth
        size="small"
        sx={{ mt: 1 }}
      >
        <MenuItem value="contains">Contains Text</MenuItem>
        <MenuItem value="length_gt">Length Greater Than</MenuItem>
        <MenuItem value="length_lt">Length Less Than</MenuItem>
      </Select>
      
      <TextField
        value={data.conditionValue || ''}
        onChange={(e) => data.onConditionValueChange?.(e.target.value)}
        placeholder={
          data.conditionType === 'contains' ? 'Enter keyword' : 'Enter number'
        }
        fullWidth
        size="small"
        sx={{ mt: 1 }}
      />
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption" sx={{ color: '#4caf50' }}>✓ Yes</Typography>
        <Typography variant="caption" sx={{ color: '#f44336' }}>✗ No</Typography>
      </Box>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="true" 
        style={{ left: '30%', background: '#4caf50' }} 
      />
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="false" 
        style={{ left: '70%', background: '#f44336' }} 
      />
    </Box>
  );
}
