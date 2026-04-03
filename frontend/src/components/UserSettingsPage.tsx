import { useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  Container,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { updateProfile } from "firebase/auth";
import { FirebaseContext } from "../lib/firebase";
import getRequestClient from "../lib/getRequestClient";

export default function UserSettingsPage() {
  const { auth } = useContext(FirebaseContext);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [billing, setBilling] = useState<{ total_credits: number; total_usage: number } | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [auth]);

  const fetchSettings = async () => {
    if (!auth?.currentUser) return;

    try {
      setLoading(true);
      setDisplayName(auth.currentUser.displayName || "");
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      const response = await client.settings.Get();
      setApiKeySet(response.gemini_api_key_set);
      
      // Try to fetch billing info
      try {
        const billingResponse = await client.settings.Billing();
        setBilling(billingResponse);
        setBillingError(null);
      } catch (err: any) {
        // Billing might fail if key is not a management key
        if (err.message?.includes("Management API key")) {
          setBillingError("Billing data requires an OpenRouter Management API key");
        } else {
          setBillingError(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDisplayName = async () => {
    if (!auth?.currentUser) {
      setError("Not authenticated");
      return;
    }

    try {
      setSavingDisplayName(true);
      setError(null);
      setSuccess(null);
      await updateProfile(auth.currentUser, {
        displayName: displayName.trim() || null,
      });
      setSuccess("Display name updated successfully");
    } catch (err) {
      console.error("Failed to update display name:", err);
      setError(err instanceof Error ? err.message : "Failed to update display name");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleSave = async () => {
    if (!auth?.currentUser || !apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      await client.settings.Set({ gemini_api_key: apiKey });
      setSuccess("API key saved successfully");
      setApiKey("");
      await fetchSettings();
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ 
        width: "100%",
        bgcolor: "white",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
      }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ 
      width: "100%",
      bgcolor: "white",
      minHeight: "100vh"
    }}>
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 7.5 }, px: { xs: 3, md: 5 } }}>
        <Box sx={{ mb: 5 }}>
          <Typography 
            variant="h2" 
            component="h1" 
            sx={{ 
              fontSize: { xs: "2rem", md: "2.625rem" },
              fontWeight: 700,
              color: "black",
              letterSpacing: "-0.03125rem",
              mb: 1.5
            }}
          >
            Settings
          </Typography>
          <Typography 
            sx={{ 
              fontSize: "1.0625rem",
              color: "#666666",
              lineHeight: 1.6
            }}
          >
            Manage your account settings and API configuration.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box sx={{ mb: 5 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              textTransform: "uppercase",
              letterSpacing: "0.0625rem",
              fontWeight: 500,
              color: "#999999",
              fontSize: "0.75rem",
              mb: 2,
              display: "block"
            }}
          >
            User Information
          </Typography>
          <Box sx={{ 
            bgcolor: "#FAFAFA",
            borderRadius: 2,
            p: 3,
            border: "1px solid #E5E5E5"
          }}>
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: "0.875rem", color: "#999999", mb: 0.5 }}>
                Email
              </Typography>
              <Typography sx={{ fontSize: "1.0625rem", color: "#1A1A1A" }}>
                {auth?.currentUser?.email}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: "0.875rem", color: "#999999", mb: 1 }}>
                Display Name
              </Typography>
              <TextField
                fullWidth
                placeholder="Enter your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                sx={{
                  mb: 2,
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
              <Button
                variant="contained"
                onClick={handleSaveDisplayName}
                disabled={savingDisplayName || displayName === (auth?.currentUser?.displayName || "")}
                sx={{
                  minWidth: "160px",
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
                {savingDisplayName ? <CircularProgress size={20} /> : "Update Display Name"}
              </Button>
            </Box>
          </Box>
        </Box>

        <Box sx={{ mb: 5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Typography 
              variant="caption" 
              sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem"
              }}
            >
              OpenRouter API Key
            </Typography>
            <Chip
              icon={apiKeySet ? <CheckCircleIcon /> : <ErrorOutlineIcon />}
              label={apiKeySet ? "Key Set" : "Not Set"}
              size="small"
              sx={{
                bgcolor: apiKeySet ? "#E8F5E9" : "#FFF3E0",
                color: apiKeySet ? "#2E7D32" : "#E65100",
                fontWeight: 600,
                fontSize: "0.75rem",
                height: "24px",
                "& .MuiChip-icon": {
                  color: apiKeySet ? "#2E7D32" : "#E65100",
                  fontSize: "1rem"
                }
              }}
            />
          </Box>
          <Box sx={{ 
            bgcolor: "#FAFAFA",
            borderRadius: 2,
            p: 3,
            border: "1px solid #E5E5E5"
          }}>
            <Typography sx={{ fontSize: "1.0625rem", color: "#666666", mb: 3, lineHeight: 1.6 }}>
              {apiKeySet
                ? "API key is set. Enter a new key to update it."
                : "No API key set. Please enter your OpenRouter API key."}
            </Typography>
            <TextField
              fullWidth
              type="password"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              sx={{
                mb: 2,
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
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              sx={{
                minWidth: "160px",
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
              {saving ? <CircularProgress size={20} /> : "Save API Key"}
            </Button>
          </Box>
        </Box>

        {apiKeySet && billing && (
          <Box sx={{ mb: 5 }}>
            <Typography 
              variant="caption" 
              sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                mb: 2,
                display: "block"
              }}
            >
              Billing Information
            </Typography>
            <Box sx={{ 
              bgcolor: "#FAFAFA",
              borderRadius: 2,
              p: 3,
              border: "1px solid #E5E5E5"
            }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: "0.875rem", color: "#999999", mb: 0.5 }}>
                  Total Credits
                </Typography>
                <Typography sx={{ fontSize: "1.0625rem", color: "#1A1A1A" }}>
                  ${billing.total_credits.toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: "0.875rem", color: "#999999", mb: 0.5 }}>
                  Total Usage
                </Typography>
                <Typography sx={{ fontSize: "1.0625rem", color: "#1A1A1A" }}>
                  ${billing.total_usage.toFixed(2)}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: "0.875rem", color: "#999999", mb: 0.5 }}>
                  Remaining
                </Typography>
                <Typography sx={{ fontSize: "1.0625rem", color: "primary.main", fontWeight: 600 }}>
                  ${(billing.total_credits - billing.total_usage).toFixed(2)}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        {billingError && (
          <Alert severity="info">
            {billingError}
          </Alert>
        )}
      </Container>
    </Box>
  );
}
