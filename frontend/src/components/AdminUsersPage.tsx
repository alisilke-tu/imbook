import { useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { Delete as DeleteIcon, VpnKey as VpnKeyIcon } from "@mui/icons-material";
import { FirebaseContext } from "../lib/firebase";
import getRequestClient from "../lib/getRequestClient";

interface User {
  firebase_uid: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  last_login: string | null;
  created_at: string;
}

export default function AdminUsersPage() {
  const { auth } = useContext(FirebaseContext);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create user dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset password confirmation dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [auth]);

  const fetchUsers = async () => {
    if (!auth?.currentUser) return;

    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      const response = await client.auth.ListUsers();
      setUsers(response.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!auth?.currentUser) return;
    if (!newUserEmail || !newUserPassword) {
      setError("Email and password are required");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      await client.auth.CreateUser({
        email: newUserEmail,
        password: newUserPassword,
        display_name: newUserDisplayName,
        is_admin: newUserIsAdmin,
      });
      setSuccess("User created successfully");
      setCreateDialogOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserDisplayName("");
      setNewUserIsAdmin(false);
      await fetchUsers();
    } catch (err) {
      console.error("Failed to create user:", err);
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!auth?.currentUser || !userToDelete) return;

    try {
      setDeleting(true);
      setError(null);
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      await client.auth.DeleteUser(userToDelete.firebase_uid);
      setSuccess(`User ${userToDelete.email} deleted successfully`);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      await fetchUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!auth?.currentUser || !userToReset) return;

    try {
      setResetting(true);
      setError(null);
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      const response = await client.auth.ResetPassword(userToReset.firebase_uid);
      setSuccess(response.message);
      setResetDialogOpen(false);
      setUserToReset(null);
    } catch (err) {
      console.error("Failed to reset password:", err);
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 5 }}>
        <Box>
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              fontSize: { xs: "1.5rem", md: "2rem" },
              fontWeight: 700,
              color: "black",
              letterSpacing: "-0.03125rem",
              mb: 1.5
            }}
          >
            User Management
          </Typography>
          <Typography 
            sx={{ 
              fontSize: "1.0625rem",
              color: "#666666",
              lineHeight: 1.6
            }}
          >
            Create and manage user accounts.
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          onClick={() => setCreateDialogOpen(true)}
          sx={{
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
          Create User
        </Button>
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

      <TableContainer 
        component={Paper} 
        elevation={0}
        sx={{ 
          border: "1px solid #E5E5E5",
          borderRadius: 2,
          overflow: "hidden"
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "#FAFAFA" }}>
              <TableCell sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                py: 2
              }}>Email</TableCell>
              <TableCell sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                py: 2
              }}>Display Name</TableCell>
              <TableCell sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                py: 2
              }}>Role</TableCell>
              <TableCell sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                py: 2
              }}>Last Login</TableCell>
              <TableCell sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                py: 2
              }}>Created At</TableCell>
              <TableCell align="right" sx={{ 
                textTransform: "uppercase",
                letterSpacing: "0.0625rem",
                fontWeight: 500,
                color: "#999999",
                fontSize: "0.75rem",
                py: 2
              }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.firebase_uid} sx={{ 
                "&:hover": { bgcolor: "#FAFAFA" },
                "&:last-child td": { borderBottom: 0 }
              }}>
                <TableCell sx={{ fontSize: "0.9375rem", color: "#1A1A1A", py: 2.5 }}>
                  {user.email}
                </TableCell>
                <TableCell sx={{ fontSize: "0.9375rem", color: "#1A1A1A", py: 2.5 }}>
                  {user.display_name || "-"}
                </TableCell>
                <TableCell sx={{ py: 2.5 }}>
                  <Chip
                    label={user.is_admin ? "Admin" : "User"}
                    size="small"
                    sx={{
                      bgcolor: user.is_admin ? "primary.main" : "#F5F5F5",
                      color: user.is_admin ? "white" : "#666666",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      height: "24px"
                    }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: "0.9375rem", color: "#666666", py: 2.5 }}>
                  {formatDate(user.last_login)}
                </TableCell>
                <TableCell sx={{ fontSize: "0.9375rem", color: "#666666", py: 2.5 }}>
                  {formatDate(user.created_at)}
                </TableCell>
                <TableCell align="right" sx={{ py: 2.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setUserToReset(user);
                      setResetDialogOpen(true);
                    }}
                    title="Send password reset email"
                    sx={{ 
                      color: "#666666",
                      "&:hover": { bgcolor: "#F5F5F5" }
                    }}
                  >
                    <VpnKeyIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setUserToDelete(user);
                      setDeleteDialogOpen(true);
                    }}
                    title="Delete user"
                    sx={{ 
                      color: "error.main",
                      "&:hover": { bgcolor: "error.lighter" }
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: "#999999" }}>
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onClose={() => !creating && setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Email"
            type="email"
            fullWidth
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Display Name (optional)"
            type="text"
            fullWidth
            value={newUserDisplayName}
            onChange={(e) => setNewUserDisplayName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={newUserIsAdmin}
                onChange={(e) => setNewUserIsAdmin(e.target.checked)}
              />
            }
            label="Admin user"
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setCreateDialogOpen(false)} 
            disabled={creating}
            sx={{
              minHeight: "44px",
              color: "#666666",
              "&:hover": {
                bgcolor: "#F5F5F5"
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateUser} 
            disabled={creating}
            sx={{
              minHeight: "44px",
              color: "#666666",
              "&:hover": {
                bgcolor: "#F5F5F5"
              }
            }}
          >
            {creating ? <CircularProgress size={20} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete user <strong>{userToDelete?.email}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeleteDialogOpen(false)} 
            disabled={deleting}
            sx={{
              minHeight: "44px",
              color: "#666666",
              "&:hover": {
                bgcolor: "#F5F5F5"
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteUser} 
            disabled={deleting}
            sx={{
              minHeight: "44px",
              color: "#666666",
              "&:hover": {
                bgcolor: "#F5F5F5"
              }
            }}
          >
            {deleting ? <CircularProgress size={20} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => !resetting && setResetDialogOpen(false)}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Send a password reset email to <strong>{userToReset?.email}</strong>?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setResetDialogOpen(false)} 
            disabled={resetting}
            sx={{
              minHeight: "44px",
              color: "#666666",
              "&:hover": {
                bgcolor: "#F5F5F5"
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleResetPassword} 
            disabled={resetting}
            sx={{
              minHeight: "44px",
              color: "#666666",
              "&:hover": {
                bgcolor: "#F5F5F5"
              }
            }}
          >
            {resetting ? <CircularProgress size={20} /> : "Send Reset Email"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
