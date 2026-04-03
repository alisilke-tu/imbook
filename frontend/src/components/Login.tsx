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
        bgcolor: "background.paper",
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
        <Stack spacing={3}>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontSize: "2rem",
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

          <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <Typography
                component="label"
                htmlFor="loginEmail"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "text.secondary",
                  mb: 1,
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
                  "& .MuiInputBase-root": {
                    height: "56px",
                  },
                }}
              />
            </Box>

            <Box>
              <Typography
                component="label"
                htmlFor="loginPassword"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "text.secondary",
                  mb: 1,
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
                  "& .MuiInputBase-root": {
                    height: "56px",
                  },
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
                minHeight: "56px",
                fontSize: "1.0625rem",
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
