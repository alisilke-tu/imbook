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
        navigate("/chat");
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
            Sign Up
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
                htmlFor="signupEmail"
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
                id="signupEmail"
                type="email"
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
                htmlFor="signupPassword"
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
                id="signupPassword"
                type="password"
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

            <Box>
              <Typography
                component="label"
                htmlFor="confirmPassword"
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
              onClick={(e) => signupWithUsernameAndPassword(e)}
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
              Sign Up
            </Button>

            <Typography
              variant="body2"
              align="center"
              sx={{
                mt: 2,
                fontSize: "0.9375rem",
                color: "#666666",
              }}
            >
              Already have an account?{" "}
              <Link 
                component={RouterLink} 
                to="/login"
                sx={{
                  color: "primary.main",
                  textDecoration: "none",
                  fontWeight: 500,
                  "&:hover": {
                    textDecoration: "underline"
                  }
                }}
              >
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
