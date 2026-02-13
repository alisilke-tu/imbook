import React, { useContext, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Alert,
  Paper,
  Typography,
  Link,
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
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Paper elevation={3} sx={{ p: 4, maxWidth: 500, width: "100%" }}>
        <Box component="form" sx={{ display: "flex", flexDirection: "column" }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Sign Up
          </Typography>

          {notice && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {notice}
            </Alert>
          )}

          <TextField
            id="signupEmail"
            type="email"
            label="Enter an email address"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            margin="normal"
            required
          />

          <TextField
            id="signupPassword"
            type="password"
            label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
            required
          />

          <TextField
            id="confirmPassword"
            type="password"
            label="Confirm Password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            margin="normal"
            required
          />

          <Button
            type="submit"
            variant="contained"
            onClick={(e) => signupWithUsernameAndPassword(e)}
            sx={{ mt: 2, mb: 2 }}
          >
            Signup
          </Button>

          <Typography variant="body2" align="center">
            <Link component={RouterLink} to="/login">
              Already have an account?
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default Signup;
