import { Box, Typography } from "@mui/material";
import AdminDatasetsPage from "./AdminDatasetsPage.tsx";

export default function AdminETLPipelinePage() {
  return (
    <Box>
      <Typography
        variant="h4"
        component="h1"
        sx={{ fontSize: "2rem", fontWeight: 700, mb: 4 }}
      >
        Embedding datasets
      </Typography>
      <AdminDatasetsPage />
    </Box>
  );
}
