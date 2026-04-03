import { useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase";
import getRequestClient from "../lib/getRequestClient";

export default function UserSettingsPage() {
  const { auth } = useContext(FirebaseContext);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      <Container maxWidth="md" sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>

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

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            User Information
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Email: {auth?.currentUser?.email}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Name: {auth?.currentUser?.displayName || "Not set"}
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            OpenRouter API Key
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {apiKeySet
              ? "API key is set. Enter a new key to update it."
              : "No API key set. Please enter your OpenRouter API key."}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              type="password"
              label="OpenRouter API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? <CircularProgress size={24} /> : "Save API Key"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {apiKeySet && billing && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Billing Information
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Total Credits: ${billing.total_credits.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Usage: ${billing.total_usage.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Remaining: ${(billing.total_credits - billing.total_usage).toFixed(2)}
            </Typography>
          </CardContent>
        </Card>
      )}

      {billingError && (
        <Alert severity="info" sx={{ mt: 3 }}>
          {billingError}
        </Alert>
      )}
    </Container>
  );
}
