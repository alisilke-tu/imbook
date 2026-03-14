import { useContext, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Typography,
} from "@mui/material";
import ELK from "elkjs/lib/elk.bundled.js";
import { ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type ImportResponse = {
  chapters: number;
  content_blocks: number;
  paragraphs: number;
  references: number;
};

type ChapterRow = {
  id: string;
  chapter_number: string;
  title: string;
  sort_order: number;
};

type ContentBlockRow = {
  id: string;
  chapter_id: string;
  block_type: string;
  page_number: number;
  sort_order: number;
};

type ParagraphRow = {
  id: string;
  content_block_id: string;
  content: string;
};

type ReferenceRow = {
  id: string;
  origin_block_id: string;
  target_type: string;
  target_chapter_id: string | null;
  target_block_id: string | null;
};

type ContentListResponse = {
  chapters: ChapterRow[] | null;
  content_blocks: ContentBlockRow[] | null;
  paragraphs: ParagraphRow[] | null;
  references: ReferenceRow[] | null;
};

function getParagraphContentForChapter(
  data: ContentListResponse | null,
  chapterId: string
): string | null {
  if (!data?.content_blocks?.length || !data?.paragraphs?.length) return null;
  const block = data.content_blocks.find((b) => b.chapter_id === chapterId);
  if (!block) return null;
  const para = data.paragraphs.find((p) => p.content_block_id === block.id);
  return para?.content ?? null;
}

function getReferenceGraph(data: ContentListResponse | null): {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string }[];
} {
  const chapters = data?.chapters ?? [];
  const blocks = data?.content_blocks ?? [];
  const refs = data?.references ?? [];
  const blockToChapter = new Map(blocks.map((b) => [b.id, b.chapter_id]));
  const nodes = chapters.map((ch) => ({
    id: ch.id,
    label: [ch.chapter_number, ch.title].filter(Boolean).join(" ") || ch.id,
  }));
  const edges: { source: string; target: string }[] = [];
  for (const r of refs) {
    if (!r.target_chapter_id) continue;
    const originChapterId = blockToChapter.get(r.origin_block_id);
    if (!originChapterId) continue;
    edges.push({ source: originChapterId, target: r.target_chapter_id });
  }
  return { nodes, edges };
}

const ELK_NODE_WIDTH = 180;
const ELK_NODE_HEIGHT = 40;

type FlowNode = { id: string; data: { label: string }; position: { x: number; y: number } };
type FlowEdge = { id: string; source: string; target: string };

async function layoutGraphWithELK(
  rawNodes: { id: string; label: string }[],
  rawEdges: { source: string; target: string }[]
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: rawNodes.map((n) => ({
      id: n.id,
      width: ELK_NODE_WIDTH,
      height: ELK_NODE_HEIGHT,
    })),
    edges: rawEdges.map((e, i) => ({
      id: `e${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  };
  const laid = await elk.layout(graph);
  const nodes: FlowNode[] = (laid.children ?? []).map((child) => {
    const raw = rawNodes.find((n) => n.id === child.id);
    const label = raw?.label ?? child.id;
    return {
      id: child.id,
      data: { label: label.length > 36 ? label.slice(0, 36) + "…" : label },
      position: { x: child.x ?? 0, y: child.y ?? 0 },
    };
  });
  const edges: FlowEdge[] = rawEdges.map((e, i) => ({
    id: `e${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
  }));
  return { nodes, edges };
}

function fallbackGridLayout(
  rawNodes: { id: string; label: string }[],
  rawEdges: { source: string; target: string }[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const COL = 5;
  const DX = 220;
  const DY = 60;
  const nodes: FlowNode[] = rawNodes.map((n, i) => ({
    id: n.id,
    data: { label: n.label.length > 36 ? n.label.slice(0, 36) + "…" : n.label },
    position: { x: (i % COL) * DX, y: Math.floor(i / COL) * DY },
  }));
  const edges: FlowEdge[] = rawEdges.map((e, i) => ({
    id: `e${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
  }));
  return { nodes, edges };
}

export default function AdminContentPage() {
  const { auth } = useContext(FirebaseContext);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [contentList, setContentList] = useState<ContentListResponse | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [refGraphNodes, setRefGraphNodes] = useState<FlowNode[] | null>(null);
  const [refGraphEdges, setRefGraphEdges] = useState<FlowEdge[] | null>(null);
  const [refGraphLayouting, setRefGraphLayouting] = useState(false);

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

  useEffect(() => {
    if (!contentList?.chapters?.length) {
      setRefGraphNodes(null);
      setRefGraphEdges(null);
      return;
    }
    const { nodes: rawNodes, edges: rawEdges } = getReferenceGraph(contentList);
    const fallback = fallbackGridLayout(rawNodes, rawEdges);
    setRefGraphNodes(fallback.nodes);
    setRefGraphEdges(fallback.edges);
    setRefGraphLayouting(true);
    layoutGraphWithELK(rawNodes, rawEdges)
      .then(({ nodes, edges }) => {
        setRefGraphNodes(nodes);
        setRefGraphEdges(edges);
      })
      .catch(() => {})
      .finally(() => setRefGraphLayouting(false));
  }, [contentList]);

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
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Import XML content, browse chapters, and view the reference graph.
      </Typography>

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

      {/* Reference graph (ELK layout) */}
      {contentList && (contentList.chapters?.length ?? 0) > 0 && refGraphNodes && refGraphEdges && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Reference graph
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Chapters and references: edge from chapter A to chapter B means A links to B.
            {refGraphLayouting && " (layouting…)"}
          </Typography>
          <Box sx={{ height: 450, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <ReactFlow
              nodes={refGraphNodes}
              edges={refGraphEdges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
            />
          </Box>
        </Paper>
      )}
    </>
  );
}
