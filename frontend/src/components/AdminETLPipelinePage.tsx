import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import AdminContentPage from "./AdminContentPage.tsx";
import AdminChunkingPage from "./AdminChunkingPage.tsx";
import AdminChatPage from "./AdminChatPage.tsx";

type TabId = "chapters" | "chunking" | "chat";

export default function AdminETLPipelinePage() {
  const [tab, setTab] = useState<TabId>("chapters");

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 2 }}>
        ETL-Pipeline Seeding IM Buch
      </Typography>
      <Tabs value={tab} onChange={(_, v: TabId) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Chapters & reference graph" value="chapters" />
        <Tab label="Chunking & embedding" value="chunking" />
        <Tab label="Chat" value="chat" />
      </Tabs>
      <Box>
        {tab === "chapters" && <AdminContentPage />}
        {tab === "chunking" && <AdminChunkingPage />}
        {tab === "chat" && <AdminChatPage />}
      </Box>
    </Box>
  );
}
