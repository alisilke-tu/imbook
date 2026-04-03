import { useContext, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Typography,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { FirebaseContext } from "../lib/firebase.tsx";
import ReferenceGraphView, { type ContentListResponse } from "./ReferenceGraphView.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type ImportResponse = {
  chapters: number;
  content_blocks: number;
  paragraphs: number;
  references: number;
};

function getParagraphContentForChapter(
  data: ContentListResponse | null,
  chapterId: string,
): string | null {
  if (!data?.content_blocks?.length || !data?.paragraphs?.length) return null;
  const block = data.content_blocks.find((b) => b.chapter_id === chapterId);
  if (!block) return null;
  const para = data.paragraphs.find((p) => p.content_block_id === block.id);
  return para?.content ?? null;
}

export default function AdminContentPage() {
  const { auth } = useContext(FirebaseContext);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [contentList, setContentList] = useState<ContentListResponse | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  const fetchContent = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data: ContentListResponse = await res.json();
    setContentList(data);
  };

  useEffect(() => {
    if (auth?.currentUser?.uid) {
      fetchContent();
    }
  }, [auth?.currentUser?.uid]);

  const handleUpload = async () => {
    if (!uploadFile || !auth?.currentUser) return;
    setUploading(true);
    setUploadError(null);
    setImportResult(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch(`${API_URL}/content/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.message || `Upload failed (${res.status})`);
        return;
      }
      setImportResult(data as ImportResponse);
      setUploadFile(null);
      await fetchContent();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Import XML content, browse chapters, and view the reference graph.
      </Typography>

      <Alert
        severity="info"
        icon={<InfoOutlinedIcon />}
        sx={{ mb: 3 }}
      >
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          PDF → XML conversion (run locally)
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          To convert the book PDF into the XML that you upload here, run the following command on your machine.
          We use Poppler (pdftohtml); this step is not hosted server-side yet, so it has to be done on the client for now.
        </Typography>
        <Box
          component="code"
          sx={{
            display: "block",
            fontFamily: "monospace",
            fontSize: "0.85rem",
            p: 1.5,
            bgcolor: "action.hover",
            borderRadius: 1,
            overflow: "auto",
          }}
        >
          pdftohtml -xml -f 26 -l 781 Krcmar2015_Informationsmanagement.pdf Krcmar2015_Informationsmanagement_Content
        </Box>
      </Alert>

      {/* Content import */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Import XML content
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a pdf2xml XML file to replace stored chapters, content blocks, and references.
        </Typography>
        {uploadError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError(null)}>
            {uploadError}
          </Alert>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Button variant="outlined" component="label" disabled={uploading}>
            Choose XML file
            <input
              type="file"
              accept=".xml"
              hidden
              onChange={(e) => {
                setUploadFile(e.target.files?.[0] ?? null);
                setUploadError(null);
              }}
            />
          </Button>
          {uploadFile && (
            <Typography variant="body2" color="text.secondary">
              {uploadFile.name}
            </Typography>
          )}
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </Box>
        {importResult && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Imported: {importResult.chapters} chapters, {importResult.content_blocks} content blocks,{" "}
            {importResult.paragraphs} paragraphs, {importResult.references} references.
          </Alert>
        )}
        {contentList && (contentList.chapters?.length ?? 0) > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Current content ({(contentList.chapters?.length ?? 0)} chapters)
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 200, overflow: "auto" }}>
              {(contentList.chapters ?? []).slice(0, 50).map((ch) => (
                <li key={ch.id}>
                  <Typography variant="body2">
                    {ch.chapter_number} {ch.title}
                  </Typography>
                </li>
              ))}
              {(contentList.chapters?.length ?? 0) > 50 && (
                <li>
                  <Typography variant="body2" color="text.secondary">
                    … and {(contentList.chapters?.length ?? 0) - 50} more
                  </Typography>
                </li>
              )}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Chapters: clickable list + detail panel */}
      {contentList && (contentList.chapters?.length ?? 0) > 0 && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Chapters
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Click a chapter to view its content on the right.
          </Typography>
          <Box sx={{ display: "flex", gap: 2, minHeight: 320 }}>
            <Box
              sx={{
                flex: "0 0 280px",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                overflow: "auto",
                maxHeight: 400,
              }}
            >
              {(contentList.chapters ?? []).map((ch) => (
                <Box
                  key={ch.id}
                  onClick={() => setSelectedChapterId(ch.id)}
                  sx={{
                    px: 2,
                    py: 1.5,
                    cursor: "pointer",
                    bgcolor: selectedChapterId === ch.id ? "action.selected" : "transparent",
                    "&:hover": { bgcolor: "action.hover" },
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" fontWeight={selectedChapterId === ch.id ? 600 : 400}>
                    {ch.chapter_number} {ch.title}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box
              sx={{
                flex: 1,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                p: 2,
                overflow: "auto",
                maxHeight: 400,
              }}
            >
              {selectedChapterId ? (
                <Typography variant="body1" component="div" sx={{ whiteSpace: "pre-wrap" }}>
                  {getParagraphContentForChapter(contentList, selectedChapterId) ?? "No content for this chapter."}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Select a chapter to view its text here.
                </Typography>
              )}
            </Box>
          </Box>
        </Paper>
      )}

      <ReferenceGraphView contentList={contentList} />
    </>
  );
}
