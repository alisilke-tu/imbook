import { createTheme } from '@mui/material/styles';

// Custom theme matching the original design
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#111111', // Black
      contrastText: '#FFFFFF', // White
    },
    background: {
      default: '#FFFFFF', // White
      paper: '#FFFFFF',
    },
    text: {
      primary: '#111111', // Black
      secondary: 'rgba(17, 17, 17, 0.6)',
    },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    h1: {
      fontSize: '3rem',
      fontWeight: 300,
    },
    h2: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 500,
    },
    h5: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css?family=Inter');
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // Disable uppercase transformation
        },
      },
    },
  },
});

export default theme;
