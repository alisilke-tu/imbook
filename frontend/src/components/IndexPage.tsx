import { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Divider,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import getRequestClient from "../lib/getRequestClient";
import { FirebaseContext } from "../lib/firebase";

function IndexPage() {
  const navigate = useNavigate();
  const { auth, isLoading: authLoading } = useContext(FirebaseContext);
  const [question, setQuestion] = useState("");
  const [background, setBackground] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  // Redirect logged-in users to admin dashboard
  useEffect(() => {
    if (!authLoading && auth?.currentUser?.uid) {
      navigate("/admin-dashboard");
    }
  }, [authLoading, auth?.currentUser?.uid, navigate]);

  const handleSubmit = async () => {
    // Validate form
    if (!question.trim()) {
      setSnackbar({
        open: true,
        message: "Please enter a question",
        severity: "error",
      });
      return;
    }

    if (!background) {
      setSnackbar({
        open: true,
        message: "Please select your professional background",
        severity: "error",
      });
      return;
    }

    if (!consent) {
      setSnackbar({
        open: true,
        message: "Please consent to the data privacy policy",
        severity: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const client = getRequestClient(undefined);
      await client.submissions.Submit({
        question: question,
        role: background,
        email: email,
      });

      setSnackbar({
        open: true,
        message: "Thank you! Your response has been submitted successfully.",
        severity: "success",
      });

      // Reset form
      setQuestion("");
      setBackground("");
      setEmail("");
      setConsent(false);
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error.message || "Failed to submit. Please try again.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Main Content */}
      <Container
        maxWidth={false}
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: { xs: 4, md: 15 },
          py: 10,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={8}
          sx={{
            width: "100%",
            maxWidth: "1200px",
            alignItems: "center",
          }}
        >
          {/* Left Side - Heading and Description */}
          <Stack
            direction="row"
            spacing={2}
            sx={{
              flex: 1,
              maxWidth: "600px",
            }}
          >
            <Divider
              orientation="vertical"
              sx={{
                height: "100px",
                mt: 3,
                borderColor: "#E5E7EB",
                borderRightWidth: 1,
              }}
            />
            <Stack spacing={4}>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: "2.5rem", md: "4rem" },
                  fontWeight: 600,
                  color: "#111827",
                  lineHeight: 1.1,
                  letterSpacing: "-0.025em",
                }}
              >
                Redefining Information Management.
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.25rem",
                  color: "#6B7280",
                  lineHeight: 1.6,
                }}
              >
                We are conducting a study to understand how professionals
                navigate the complexity of modern data. Your questions and
                background will help shape the future of our tools.
              </Typography>
            </Stack>
          </Stack>

          {/* Right Side - Form */}
          <Stack
            spacing={3}
            sx={{
              flex: 1,
              maxWidth: "500px",
              width: "100%",
            }}
          >
            {/* Question Field */}
            <FormControl fullWidth>
              <Typography
                component="label"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#374151",
                  mb: 1,
                }}
              >
                What would you like to know about information management?
              </Typography>
              <TextField
                multiline
                rows={5}
                placeholder="Type your question here..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": {
                      borderColor: "#E5E7EB",
                    },
                    "&:hover fieldset": {
                      borderColor: "#E5E7EB",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "black",
                      borderWidth: 1,
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontSize: "1rem",
                    color: "#111827",
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: "#9CA3AF",
                    opacity: 1,
                  },
                }}
              />
            </FormControl>

            {/* Professional Background Field */}
            <FormControl fullWidth>
              <Typography
                component="label"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#374151",
                  mb: 1,
                }}
              >
                Your professional background
              </Typography>
              <Select
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                displayEmpty
                sx={{
                  height: "56px",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#E5E7EB",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#E5E7EB",
                  },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "black",
                    borderWidth: 1,
                  },
                  "& .MuiSelect-select": {
                    fontSize: "1rem",
                    color: background ? "#111827" : "#9CA3AF",
                  },
                }}
              >
                <MenuItem value="" disabled>
                  Select your role
                </MenuItem>
                <MenuItem value="cio">CIO (Chief Information Officer)</MenuItem>
                <MenuItem value="cto">CTO (Chief Technology Officer)</MenuItem>
                <MenuItem value="ceo">CEO (Chief Executive Officer)</MenuItem>
                <MenuItem value="cfo">CFO (Chief Financial Officer)</MenuItem>
                <MenuItem value="coo">COO (Chief Operating Officer)</MenuItem>
                <MenuItem value="other-c-level">Other C-Level Executive</MenuItem>
                <MenuItem value="director">Director</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="analyst">Analyst</MenuItem>
                <MenuItem value="consultant">Consultant</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            {/* Email Field */}
            <FormControl fullWidth>
              <Typography
                component="label"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#374151",
                  mb: 1,
                }}
              >
                Email address (Optional)
              </Typography>
              <TextField
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: "56px",
                    "& fieldset": {
                      borderColor: "#E5E7EB",
                    },
                    "&:hover fieldset": {
                      borderColor: "#E5E7EB",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "black",
                      borderWidth: 1,
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontSize: "1rem",
                    color: "#111827",
                  },
                }}
              />
            </FormControl>

            {/* Consent Checkbox */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  sx={{
                    color: "black",
                    "&.Mui-checked": {
                      color: "black",
                    },
                    "& .MuiSvgIcon-root": {
                      fontSize: 20,
                    },
                  }}
                />
              }
              label={
                <Typography
                  sx={{
                    fontSize: "0.875rem",
                    color: "#6B7280",
                    lineHeight: 1.5,
                  }}
                >
                  I consent to the data privacy policy and agree to share my
                  response for research purposes.
                </Typography>
              }
              sx={{
                alignItems: "flex-start",
                mt: 1,
              }}
            />

            {/* Submit Button */}
            <Button
              variant="contained"
              fullWidth
              onClick={handleSubmit}
              disabled={loading}
              sx={{
                height: "56px",
                backgroundColor: "black",
                color: "white",
                fontSize: "1rem",
                fontWeight: 600,
                textTransform: "none",
                mt: 2,
                "&:hover": {
                  backgroundColor: "#111827",
                },
                "&:active": {
                  backgroundColor: "#374151",
                },
                "&.Mui-disabled": {
                  backgroundColor: "#9CA3AF",
                  color: "white",
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} sx={{ color: "white" }} />
              ) : (
                "Send Response"
              )}
            </Button>
          </Stack>
        </Stack>
      </Container>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default IndexPage;
