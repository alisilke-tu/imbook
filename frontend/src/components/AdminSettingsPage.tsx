import { useContext, useEffect, useState } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type SettingsGetResponse = {
  gemini_api_key_set: boolean;
};

type BillingResponse = {
  total_credits: number;
  total_usage: number;
};

export default function AdminSettingsPage() {
  const { auth } = useContext(FirebaseContext);
  const [geminiKeySet, setGeminiKeySet] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const fetchBilling = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    setBillingLoading(true);
    setBillingError(null);
    setBilling(null);
    try {
      const res = await fetch(`${API_URL}/settings/billing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBilling(data as BillingResponse);
      } else {
        const msg = (data as { message?: string })?.message ?? (res.status === 403 ? "Management API key required for billing." : "Failed to load billing.");
        setBillingError(msg);
      }
    } catch {
      setBillingError("Failed to load billing.");
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: SettingsGetResponse = await res.json();
          setGeminiKeySet(data.gemini_api_key_set ?? false);
          if (data.gemini_api_key_set) fetchBilling();
        }
      } finally {
        setLoading(false);
      }
    };
    if (auth?.currentUser) fetchSettings();
  }, [auth?.currentUser]);

  const handleSave = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gemini_api_key: geminiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ type: "success", text: "API key saved." });
        setGeminiKeySet(geminiKey.length > 0);
        if (geminiKey.trim()) fetchBilling();
      } else {
        setMessage({ type: "error", text: (data as { message?: string })?.message || "Failed to save." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Typography variant="body1" color="text.secondary">
        Loading…
      </Typography>
    );
  }

  return (
    <>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Store your OpenRouter API key (used for chat and chunk embeddings). It is stored per user and never shown again.
      </Typography>
      <Alert
        severity={geminiKeySet ? "success" : "warning"}
        icon={geminiKeySet ? <CheckCircleIcon /> : <WarningAmberIcon />}
        sx={{ mb: 3, alignItems: "center" }}
      >
        {geminiKeySet ? "API Key added. You're all set up." : "No API key set. Add your OpenRouter API key below to use chat and embeddings."}
      </Alert>
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      <Paper elevation={2} sx={{ p: 3, maxWidth: 560 }}>
        <Typography variant="subtitle1" gutterBottom>
          OpenRouter API key
        </Typography>
        <TextField
          fullWidth
          type="password"
          placeholder={geminiKeySet ? "••••••••" : "Enter your OpenRouter API key"}
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          margin="normal"
          autoComplete="off"
        />
        <Button variant="contained" onClick={handleSave} disabled={saving || !geminiKey.trim()} sx={{ mt: 2 }}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </Paper>

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>
        Billing
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        OpenRouter usage and credits (requires a Management API key).
      </Typography>
      <Paper elevation={2} sx={{ p: 3, maxWidth: 560 }}>
        {!geminiKeySet ? (
          <Typography variant="body2" color="text.secondary">
            Set your OpenRouter API key above to load billing. Use a Management API key to see credits and usage.
          </Typography>
        ) : billingLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        ) : billingError ? (
          <Box>
            <Alert severity="info" sx={{ alignItems: "center" }}>
              {billingError}
            </Alert>
            <Button size="small" onClick={fetchBilling} sx={{ mt: 1 }}>
              Retry
            </Button>
          </Box>
        ) : billing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="body2">
              <strong>Total credits:</strong> ${billing.total_credits.toFixed(4)}
            </Typography>
            <Typography variant="body2">
              <strong>Total usage:</strong> ${billing.total_usage.toFixed(4)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Remaining: ${(billing.total_credits - billing.total_usage).toFixed(4)}
            </Typography>
            <Button size="small" startIcon={<AccountBalanceWalletIcon />} onClick={fetchBilling} sx={{ alignSelf: "flex-start", mt: 1 }}>
              Refresh
            </Button>
          </Box>
        ) : null}
      </Paper>
    </>
  );
}
