import React, { useContext, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Alert,
  Typography,
  Link,
  Stack,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";

const Signup = () => {
  const { auth } = useContext(FirebaseContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");

  const signupWithUsernameAndPassword = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    if (password === confirmPassword) {
      try {
        await createUserWithEmailAndPassword(auth!, email, password);
        navigate("/");
      } catch {
        setNotice("Sorry, something went wrong. Please try again.");
      }
    } else {
      setNotice("Passwords don't match. Please try again.");
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
            Sign Up
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
                htmlFor="signupEmail"
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
                id="signupEmail"
                type="email"
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
                htmlFor="signupPassword"
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
                id="signupPassword"
                type="password"
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

            <Box>
              <Typography
                component="label"
                htmlFor="confirmPassword"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "text.secondary",
                  mb: 1,
                  display: "block",
                }}
              >
                Confirm Password
              </Typography>
              <TextField
                id="confirmPassword"
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              onClick={(e) => signupWithUsernameAndPassword(e)}
              sx={{
                mt: 2,
                minHeight: "56px",
                fontSize: "1.0625rem",
              }}
            >
              Sign Up
            </Button>

            <Typography
              variant="body2"
              align="center"
              sx={{
                mt: 2,
                color: "text.secondary",
              }}
            >
              Already have an account?{" "}
              <Link component={RouterLink} to="/login">
                Login
              </Link>
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

export default Signup;
