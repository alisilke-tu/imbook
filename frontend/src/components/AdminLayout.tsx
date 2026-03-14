import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { Box, Container, Tab, Tabs, Typography } from "@mui/material";

export default function AdminLayout() {
  const location = useLocation();
  const path = location.pathname;
  const value = path.includes("/settings") ? 2 : path.includes("/etl-pipeline") ? 1 : 0;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Admin
      </Typography>
      <Tabs value={value} sx={{ mb: 3 }}>
        <Tab label="Submissions" component={RouterLink} to="/admin-dashboard/submissions" />
        <Tab label="ETL-Pipeline Seeding IM Buch" component={RouterLink} to="/admin-dashboard/etl-pipeline" />
        <Tab label="Settings" component={RouterLink} to="/admin-dashboard/settings" />
      </Tabs>
      <Box>
        <Outlet />
      </Box>
    </Container>
  );
}
