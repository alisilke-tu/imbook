import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import AdminContentPage from "./AdminContentPage.tsx";
import AdminChunkingPage from "./AdminChunkingPage.tsx";
import AdminDatasetsPage from "./AdminDatasetsPage.tsx";

type TabId = "chapters" | "chunking" | "datasets";

export default function AdminETLPipelinePage() {
  const [tab, setTab] = useState<TabId>("datasets");

  return (
    <Box>
      <Box sx={{ mb: 5 }}>
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
          ETL Pipeline
        </Typography>
        <Typography 
          sx={{ 
            fontSize: "1.0625rem",
            color: "#666666",
            lineHeight: 1.6
          }}
        >
          Manage content extraction, chunking, and embedding processes.
        </Typography>
      </Box>

      <Box sx={{ 
        borderBottom: "1px solid #E5E5E5",
        mb: 4
      }}>
        <Tabs 
          value={tab} 
          onChange={(_, v: TabId) => setTab(v)}
          sx={{
            "& .MuiTab-root": {
              textTransform: "none",
              fontSize: "0.9375rem",
              fontWeight: 500,
              color: "#666666",
              minHeight: "48px",
              px: 3,
              "&.Mui-selected": {
                color: "primary.main",
                fontWeight: 600
              }
            },
            "& .MuiTabs-indicator": {
              height: "2px"
            }
          }}
        >
          <Tab label="Datasets" value="datasets" />
          <Tab label="Chapters & reference graph" value="chapters" />
          <Tab label="Chunking & embedding (legacy)" value="chunking" />
        </Tabs>
      </Box>

      <Box>
        {tab === "datasets" && <AdminDatasetsPage />}
        {tab === "chapters" && <AdminContentPage />}
        {tab === "chunking" && <AdminChunkingPage />}
      </Box>
    </Box>
  );
}
