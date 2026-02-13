import { useContext, useEffect, useState } from "react";
import {
  Container,
  Paper,
  Typography,
  CircularProgress,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
} from "@mui/material";
import getRequestClient from "../lib/getRequestClient.ts";
import { submissions } from "../lib/client.ts";
import { FirebaseContext } from "../lib/firebase.tsx";

function AdminDashboard() {
  const { auth } = useContext(FirebaseContext);
  const [submissionsData, setSubmissionsData] = useState<submissions.Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch submissions if user is authenticated
  useEffect(() => {
    const getSubmissions = async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const client = getRequestClient(token ?? undefined);
        const response = await client.submissions.List();
        setSubmissionsData(response.submissions || []);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Failed to load submissions");
      } finally {
        setLoading(false);
      }
    };
    if (auth?.currentUser?.uid) getSubmissions();
  }, [auth?.currentUser?.uid]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRole = (role: string) => {
    const roleMap: { [key: string]: string } = {
      cio: "CIO",
      cto: "CTO",
      ceo: "CEO",
      cfo: "CFO",
      coo: "COO",
      "other-c-level": "Other C-Level",
      director: "Director",
      manager: "Manager",
      analyst: "Analyst",
      consultant: "Consultant",
      other: "Other",
    };
    return roleMap[role] || role;
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Admin Dashboard
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        View all form submissions from users
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ mt: 3 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : submissionsData.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body1" color="text.secondary">
              No submissions yet
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Question</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Submitted At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {submissionsData.map((submission) => (
                  <TableRow
                    key={submission.id}
                    sx={{ "&:hover": { backgroundColor: "#f9fafb" } }}
                  >
                    <TableCell sx={{ maxWidth: 400 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {submission.question}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatRole(submission.role)}</TableCell>
                    <TableCell>{submission.email}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(submission.submitted_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
}

export default AdminDashboard;
