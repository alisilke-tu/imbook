import { createTheme } from '@mui/material/styles';

// Custom theme matching the reference landing page design
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0a1929',
      dark: '#050d14',
      light: '#1a2f42',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FFFFFF',
      paper: '#FAFAFA',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#4A4A4A',
    },
    divider: '#E5E5E5',
    grey: {
      400: '#9CA3AF',
      500: '#666666',
      600: '#4A4A4A',
      700: '#374151',
      900: '#1A1A1A',
    },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    h1: {
      fontSize: '3.5rem',
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.025em',
      color: '#1A1A1A',
    },
    h2: {
      fontSize: '2.625rem',
      fontWeight: 700,
      letterSpacing: '-0.5px',
      color: '#000000',
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 600,
      color: '#1A1A1A',
    },
    h4: {
      fontSize: '1rem',
      fontWeight: 600,
      color: '#1A1A1A',
    },
    body1: {
      fontSize: '1.0625rem',
      lineHeight: 1.7,
      color: '#4A4A4A',
    },
    body2: {
      fontSize: '1.125rem',
      lineHeight: 1.6,
      color: '#666666',
    },
    subtitle1: {
      fontSize: '1.5rem',
      lineHeight: 1.4,
      color: '#4A4A4A',
    },
    caption: {
      fontSize: '0.9375rem',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '1px',
      color: '#0a1929',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: "'Inter', sans-serif",
        },
        '@keyframes bounce': {
          '0%, 100%': {
            transform: 'translateY(-25%)',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)',
          },
          '50%': {
            transform: 'translateY(0)',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: '8px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          },
        },
        containedPrimary: {
          backgroundColor: '#0a1929',
          '&:hover': {
            backgroundColor: '#050d14',
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: '#666666',
          textDecoration: 'none',
          transition: 'color 0.2s',
          '&:hover': {
            color: '#0a1929',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#E5E5E5',
            },
            '&:hover fieldset': {
              borderColor: '#E5E5E5',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#0a1929',
              borderWidth: '1px',
            },
          },
        },
      },
    },
  },
});

export default theme;
