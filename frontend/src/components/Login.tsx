import React, { useContext, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Alert,
  Paper,
  Typography,
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
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Paper elevation={3} sx={{ p: 4, maxWidth: 500, width: "100%" }}>
        <Box component="form" sx={{ display: "flex", flexDirection: "column" }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Login
          </Typography>

          {notice && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {notice}
            </Alert>
          )}

          <TextField
            type="email"
            id="exampleInputEmail1"
            label="Email address"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            margin="normal"
            required
          />

          <TextField
            type="password"
            id="exampleInputPassword1"
            label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
            required
          />

          <Button
            type="submit"
            variant="contained"
            onClick={loginWithUsernameAndPassword}
            sx={{ mt: 2 }}
          >
            Submit
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
