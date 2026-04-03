import { useEffect, useState } from "react";
import { Box, Paper, Typography } from "@mui/material";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs";
import { ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export type ChapterRow = {
  id: string;
  chapter_number: string;
  title: string;
  sort_order: number;
};

export type ContentBlockRow = {
  id: string;
  chapter_id: string;
  block_type: string;
  page_number: number;
  sort_order: number;
};

export type ParagraphRow = {
  id: string;
  content_block_id: string;
  content: string;
};

export type ReferenceRow = {
  id: string;
  origin_block_id: string;
  target_type: string;
  target_chapter_id: string | null;
  target_block_id: string | null;
};

export type ContentListResponse = {
  chapters: ChapterRow[] | null;
  content_blocks: ContentBlockRow[] | null;
  paragraphs: ParagraphRow[] | null;
  references: ReferenceRow[] | null;
};

export function getReferenceGraph(data: ContentListResponse | null): {
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
  rawEdges: { source: string; target: string }[],
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
  const nodes: FlowNode[] = (laid.children ?? []).map((child: ElkNode) => {
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
  rawEdges: { source: string; target: string }[],
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

type ReferenceGraphViewProps = {
  contentList: ContentListResponse | null;
  /** Paper section title */
  title?: string;
  /** Min height of the flow canvas */
  height?: number;
};

export default function ReferenceGraphView({
  contentList,
  title = "Reference graph",
  height = 450,
}: ReferenceGraphViewProps) {
  const [refGraphNodes, setRefGraphNodes] = useState<FlowNode[] | null>(null);
  const [refGraphEdges, setRefGraphEdges] = useState<FlowEdge[] | null>(null);
  const [refGraphLayouting, setRefGraphLayouting] = useState(false);

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

  if (!contentList || (contentList.chapters?.length ?? 0) === 0 || !refGraphNodes || !refGraphEdges) {
    return null;
  }

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Chapters and references: edge from chapter A to chapter B means A links to B.
        {refGraphLayouting && " (layouting…)"}
      </Typography>
      <Box sx={{ height, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
        <ReactFlow nodes={refGraphNodes} edges={refGraphEdges} fitView fitViewOptions={{ padding: 0.2 }} />
      </Box>
    </Paper>
  );
}
