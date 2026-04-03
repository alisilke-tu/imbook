import React, { useContext, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Alert,
  Typography,
  Stack,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";

const Login = () => {
  const { auth } = useContext(FirebaseContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");

  const loginWithUsernameAndPassword = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    try {
      await signInWithEmailAndPassword(auth!, email, password);
      navigate("/");
    } catch {
      setNotice("You entered a wrong username or password.");
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "calc(100vh - 72px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "white",
        py: 8,
      }}
    >
      <Box
        sx={{
          maxWidth: 480,
          width: "100%",
          px: 3,
        }}
      >
        <Stack spacing={4}>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontSize: { xs: "2rem", md: "2.625rem" },
              fontWeight: 700,
              color: "black",
              letterSpacing: "-0.03125rem",
              textAlign: "center",
            }}
          >
            Login
          </Typography>

          {notice && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {notice}
            </Alert>
          )}

          <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box>
              <Typography
                component="label"
                htmlFor="loginEmail"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.0625rem",
                  fontWeight: 500,
                  color: "#999999",
                  fontSize: "0.75rem",
                  mb: 1.5,
                  display: "block",
                }}
              >
                Email address
              </Typography>
              <TextField
                type="email"
                id="loginEmail"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "white",
                    border: "1px solid #E5E5E5",
                    borderRadius: 2,
                    minHeight: "56px",
                    fontSize: "1.0625rem",
                    px: 2.5,
                    "& fieldset": {
                      border: "none"
                    },
                    "&:hover": {
                      borderColor: "primary.main"
                    },
                    "&.Mui-focused": {
                      borderColor: "primary.main"
                    }
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: "#999999",
                    opacity: 1
                  }
                }}
              />
            </Box>

            <Box>
              <Typography
                component="label"
                htmlFor="loginPassword"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.0625rem",
                  fontWeight: 500,
                  color: "#999999",
                  fontSize: "0.75rem",
                  mb: 1.5,
                  display: "block",
                }}
              >
                Password
              </Typography>
              <TextField
                type="password"
                id="loginPassword"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "white",
                    border: "1px solid #E5E5E5",
                    borderRadius: 2,
                    minHeight: "56px",
                    fontSize: "1.0625rem",
                    px: 2.5,
                    "& fieldset": {
                      border: "none"
                    },
                    "&:hover": {
                      borderColor: "primary.main"
                    },
                    "&.Mui-focused": {
                      borderColor: "primary.main"
                    }
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: "#999999",
                    opacity: 1
                  }
                }}
              />
            </Box>

            <Button
              type="submit"
              variant="contained"
              color="primary"
              onClick={loginWithUsernameAndPassword}
              sx={{
                mt: 2,
                minHeight: "44px",
                borderRadius: 2,
                fontSize: "0.9375rem",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "none",
                "&:hover": {
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)"
                }
              }}
            >
              Login
            </Button>

          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

export default Login;
