import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { Box, Container, Link } from "@mui/material";

export default function AdminLayout() {
  const location = useLocation();
  const path = location.pathname;

  const sections = [
    {
      label: "Datasets",
      path: "/admin/datasets",
      isActive: (p: string) => p.startsWith("/admin/datasets"),
    },
    { label: "Pipelines", path: "/admin/pipelines", isActive: (p: string) => p.startsWith("/admin/pipelines") },
    { label: "Chats", path: "/admin/chats", isActive: (p: string) => p.startsWith("/admin/chats") },
    { label: "Users", path: "/admin/users", isActive: (p: string) => p.startsWith("/admin/users") },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", gap: 4 }}>
        <Box
          sx={{
            width: 150,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {sections.map((section) => {
            const isActive = section.isActive(path);
            return (
              <Link
                key={section.path}
                component={RouterLink}
                to={section.path}
                underline="none"
                sx={{
                  fontSize: "0.9375rem",
                  fontWeight: 400,
                  color: isActive ? "primary.main" : "text.primary",
                  textDecoration: isActive ? "underline" : "none",
                  "&:hover": {
                    color: "primary.main",
                  },
                }}
              >
                {section.label}
              </Link>
            );
          })}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </Box>
      </Box>
    </Container>
  );
}
