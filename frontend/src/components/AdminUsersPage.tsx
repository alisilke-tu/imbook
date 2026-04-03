import { useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
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
      <Container maxWidth="xl" sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" component="h1">
          User Management
        </Typography>
        <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Display Name</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Last Login</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.firebase_uid}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.display_name || "-"}</TableCell>
                <TableCell>
                  <Chip
                    label={user.is_admin ? "Admin" : "User"}
                    color={user.is_admin ? "primary" : "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell>{formatDate(user.last_login)}</TableCell>
                <TableCell>{formatDate(user.created_at)}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setUserToReset(user);
                      setResetDialogOpen(true);
                    }}
                    title="Send password reset email"
                  >
                    <VpnKeyIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      setUserToDelete(user);
                      setDeleteDialogOpen(true);
                    }}
                    title="Delete user"
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">
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
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreateUser} variant="contained" disabled={creating}>
            {creating ? <CircularProgress size={24} /> : "Create"}
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
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDeleteUser} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={24} /> : "Delete"}
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
          <Button onClick={() => setResetDialogOpen(false)} disabled={resetting}>
            Cancel
          </Button>
          <Button onClick={handleResetPassword} variant="contained" disabled={resetting}>
            {resetting ? <CircularProgress size={24} /> : "Send Reset Email"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
