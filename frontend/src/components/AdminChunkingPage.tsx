import { useContext, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Paper,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemText,
  Link,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase.tsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

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

type ContentListResponse = {
  chapters: ChapterRow[] | null;
  content_blocks: ContentBlockRow[] | null;
  paragraphs: ParagraphRow[] | null;
  references: unknown[] | null;
};

type ChunkInfo = {
  index: number;
  text: string;
  embedded?: boolean;
};

type EmbeddedChunkRow = {
  id: string;
  paragraph_id: string;
  chunk_index: number;
  content: string;
};

type ListChunksResponse = {
  chunks: EmbeddedChunkRow[];
};

function fixedSizeChunks(text: string, size: number): string[] {
  if (size <= 0) return text ? [text] : [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [""];
}

// Rough token estimate: ~4 chars per token for English
const CHARS_PER_TOKEN = 4;
// OpenRouter text-embedding-3-small: $0.02 per 1M input tokens
const COST_PER_MILLION_TOKENS = 0.02;

function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function estimateCost(tokens: number): number {
  return (tokens / 1_000_000) * COST_PER_MILLION_TOKENS;
}

export default function AdminChunkingPage() {
  const { auth } = useContext(FirebaseContext);
  const [contentList, setContentList] = useState<ContentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [chunkSize, setChunkSize] = useState(500);
  const [chunksByParagraphId, setChunksByParagraphId] = useState<Record<string, ChunkInfo[]>>({});
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const [embeddingQueue, setEmbeddingQueue] = useState<string[]>([]);
  const [selectedChunks, setSelectedChunks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [embeddedChunks, setEmbeddedChunks] = useState<EmbeddedChunkRow[]>([]);

  const chunkKey = (paragraphId: string, chunkIndex: number) => `${paragraphId}-${chunkIndex}`;
  const isSelected = (paragraphId: string, chunkIndex: number) => selectedChunks.has(chunkKey(paragraphId, chunkIndex));
  const toggleSelected = (paragraphId: string, chunkIndex: number, embedded: boolean) => {
    if (embedded) return;
    const key = chunkKey(paragraphId, chunkIndex);
    setSelectedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectAllUnembedded = () => {
    const keys = new Set<string>();
    Object.entries(chunksByParagraphId).forEach(([paraId, chunks]) => {
      chunks.forEach((c) => {
        if (!c.embedded) keys.add(chunkKey(paraId, c.index));
      });
    });
    setSelectedChunks(keys);
  };
  const clearSelection = () => setSelectedChunks(new Set());

  const isEmbedding = !!embeddingId || embeddingQueue.length > 0;

  const fetchEmbeddedChunks = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/content/chunks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: ListChunksResponse = await res.json();
      setEmbeddedChunks(data.chunks ?? []);
    }
  };

  useEffect(() => {
    const fetchContent = async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/content`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: ContentListResponse = await res.json();
          setContentList(data);
        }
      } finally {
        setLoading(false);
      }
    };
    if (auth?.currentUser) {
      fetchContent();
      fetchEmbeddedChunks();
    }
  }, [auth?.currentUser]);

  const applyChunking = () => {
    if (!contentList?.paragraphs?.length || !contentList?.content_blocks?.length) return;
    const next: Record<string, ChunkInfo[]> = {};
    for (const p of contentList.paragraphs) {
      const chunks = fixedSizeChunks(p.content, chunkSize).map((text, index) => ({
        index,
        text,
      }));
      next[p.id] = chunks;
    }
    setChunksByParagraphId(next);
    setApiError(null);
  };

  const markEmbedded = (paragraphId: string, chunkIndex: number) => {
    setChunksByParagraphId((prev) => {
      const list = prev[paragraphId] ?? [];
      const updated = list.map((c) =>
        c.index === chunkIndex ? { ...c, embedded: true } : c
      );
      return { ...prev, [paragraphId]: updated };
    });
    setSelectedChunks((prev) => {
      const next = new Set(prev);
      next.delete(chunkKey(paragraphId, chunkIndex));
      return next;
    });
    fetchEmbeddedChunks();
  };

  const handleEmbed = async (paragraphId: string, chunkIndex: number, content: string) => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    setEmbeddingId(`${paragraphId}-${chunkIndex}`);
    setApiError(null);
    try {
      const res = await fetch(`${API_URL}/content/embed-chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paragraph_id: paragraphId,
          chunk_index: chunkIndex,
          content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        markEmbedded(paragraphId, chunkIndex);
      } else {
        const msg = (data as { message?: string })?.message ?? "Embed failed";
        setApiError(msg);
        if (msg.includes("OpenRouter API key")) {
          setError("Set your OpenRouter API key in the Settings tab.");
        }
      }
    } catch {
      setApiError("Request failed");
    } finally {
      setEmbeddingId(null);
    }
  };

  const handleEmbedSelected = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const toEmbed: { paragraphId: string; chunkIndex: number; content: string }[] = [];
    Object.entries(chunksByParagraphId).forEach(([paraId, chunks]) => {
      chunks.forEach((c) => {
        if (!c.embedded && selectedChunks.has(chunkKey(paraId, c.index))) {
          toEmbed.push({ paragraphId: paraId, chunkIndex: c.index, content: c.text });
        }
      });
    });
    if (toEmbed.length === 0) return;
    setEmbeddingQueue(toEmbed.map(({ paragraphId, chunkIndex }) => chunkKey(paragraphId, chunkIndex)));
    setApiError(null);
    for (let i = 0; i < toEmbed.length; i++) {
      const { paragraphId, chunkIndex, content } = toEmbed[i];
      setEmbeddingId(chunkKey(paragraphId, chunkIndex));
      try {
        const res = await fetch(`${API_URL}/content/embed-chunk`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            paragraph_id: paragraphId,
            chunk_index: chunkIndex,
            content,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          markEmbedded(paragraphId, chunkIndex);
        } else {
          const msg = (data as { message?: string })?.message ?? "Embed failed";
          setApiError(msg);
          if (msg.includes("OpenRouter API key")) setError("Set your OpenRouter API key in the Settings tab.");
        }
      } catch {
        setApiError("Request failed");
      } finally {
        setEmbeddingQueue((q) => q.slice(1));
        setEmbeddingId(null);
      }
    }
  };

  const blocksByChapterId = (contentList?.content_blocks ?? []).reduce(
    (acc, b) => {
      if (!acc[b.chapter_id]) acc[b.chapter_id] = [];
      acc[b.chapter_id].push(b);
      return acc;
    },
    {} as Record<string, ContentBlockRow[]>
  );
  const paragraphByBlockId = (contentList?.paragraphs ?? []).reduce(
    (acc, p) => {
      acc[p.content_block_id] = p;
      return acc;
    },
    {} as Record<string, ParagraphRow>
  );

  const chapters = (contentList?.chapters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <Typography variant="body1" color="text.secondary">
        Loading content…
      </Typography>
    );
  }

  if (!contentList?.chapters?.length) {
    return (
      <Typography variant="body1" color="text.secondary">
        No content yet. Import XML in the Chapters & reference graph tab first.
      </Typography>
    );
  }

  return (
    <>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Chunk chapter content with a fixed character size, then embed each chunk via OpenRouter.
      </Typography>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}{" "}
          <Link component={RouterLink} to="/admin-dashboard/settings">
            Open Settings
          </Link>
        </Alert>
      )}
      {apiError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setApiError(null)}>
          {apiError}
        </Alert>
      )}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Chunking method: Fixed size (characters)
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <TextField
            type="number"
            label="Chunk size (chars)"
            value={chunkSize}
            onChange={(e) => setChunkSize(Math.max(1, parseInt(e.target.value, 10) || 500))}
            inputProps={{ min: 1 }}
            size="small"
            sx={{ width: 160 }}
          />
          <Button variant="contained" onClick={applyChunking}>
            Apply
          </Button>
        </Box>
        {(() => {
          const allChunks = Object.entries(chunksByParagraphId).flatMap(([, chunks]) => chunks);
          const unembeddedChunks = allChunks.filter((c) => !c.embedded);
          const totalChars = allChunks.reduce((sum, c) => sum + c.text.length, 0);
          const selectedUnembeddedChars = Object.entries(chunksByParagraphId).reduce(
            (sum, [paraId, chunks]) =>
              sum +
              chunks.filter((c) => !c.embedded && selectedChunks.has(chunkKey(paraId, c.index))).reduce((s, c) => s + c.text.length, 0),
            0
          );
          const totalTokens = estimateTokens(totalChars);
          const selectedTokens = estimateTokens(selectedUnembeddedChars);
          if (allChunks.length === 0) return null;
          return (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Embedding cost estimate</strong> (OpenRouter text-embedding-3-small, ~$0.02/1M tokens)
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                All chunks: ~{totalTokens.toLocaleString()} tokens → ~${estimateCost(totalTokens).toFixed(4)}
              </Typography>
              {selectedChunks.size > 0 && (
                <Typography variant="body2">
                  Selected ({selectedChunks.size}): ~{selectedTokens.toLocaleString()} tokens → ~${estimateCost(selectedTokens).toFixed(4)}
                </Typography>
              )}
            </Box>
          );
        })()}
      </Paper>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, mb: 2 }}>
          <Typography variant="h6">
            Embedded chunks ({embeddedChunks.length})
          </Typography>
          <Button size="small" variant="outlined" onClick={selectAllUnembedded} disabled={isEmbedding}>
            Select all unembedded
          </Button>
          <Button size="small" variant="outlined" onClick={clearSelection} disabled={isEmbedding}>
            Clear selection
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleEmbedSelected}
            disabled={isEmbedding || selectedChunks.size === 0}
          >
            {isEmbedding ? `Embedding… (${embeddingQueue.length} left)` : `Embed selected (${selectedChunks.size})`}
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          All chunks that have been embedded and stored for search. Use checkboxes to select chunks, then &quot;Embed selected&quot;.
        </Typography>
        {embeddedChunks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No embedded chunks yet. Apply chunking above and click Embed on each chunk.
          </Typography>
        ) : (
          <List dense sx={{ maxHeight: 320, overflow: "auto" }}>
            {embeddedChunks.map((c) => (
              <ListItem key={c.id} alignItems="flex-start" divider>
                <ListItemText
                  primary={`Paragraph ${c.paragraph_id.slice(0, 8)}… · Chunk ${c.chunk_index}`}
                  secondary={c.content.slice(0, 200) + (c.content.length > 200 ? "…" : "")}
                  primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                  secondaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {chapters.map((chapter) => {
        const blocks = blocksByChapterId[chapter.id] ?? [];
        const paragraphs = blocks
          .map((b) => paragraphByBlockId[b.id])
          .filter(Boolean) as ParagraphRow[];
        return (
          <Paper key={chapter.id} elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              {chapter.chapter_number} {chapter.title}
            </Typography>
            {paragraphs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No paragraph for this chapter.
              </Typography>
            ) : (
              paragraphs.map((para) => {
                const chunks = chunksByParagraphId[para.id] ?? [];
                return (
                  <Box key={para.id} sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Paragraph ({para.content.length} chars) → {chunks.length} chunk(s)
                    </Typography>
                    {chunks.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Click Apply above to chunk this paragraph.
                      </Typography>
                    ) : (
                      <List dense disablePadding>
                        {chunks.map((chunk) => (
                          <ListItem
                            key={chunk.index}
                            sx={{ alignItems: "flex-start", flexWrap: "wrap" }}
                            secondaryAction={
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={isEmbedding || chunk.embedded}
                                onClick={() => handleEmbed(para.id, chunk.index, chunk.text)}
                              >
                                {embeddingId === chunkKey(para.id, chunk.index) ? "Embedding…" : chunk.embedded ? "Embedded" : "Embed"}
                              </Button>
                            }
                          >
                            <Checkbox
                              edge="start"
                              checked={chunk.embedded || isSelected(para.id, chunk.index)}
                              disabled={chunk.embedded}
                              onChange={() => toggleSelected(para.id, chunk.index, !!chunk.embedded)}
                              onClick={(e) => e.stopPropagation()}
                              sx={{ mt: 0.25, mr: 1 }}
                            />
                            <ListItemText
                              primary={`Chunk ${chunk.index + 1} (${chunk.text.length} chars)`}
                              secondary={chunk.text.slice(0, 80) + (chunk.text.length > 80 ? "…" : "")}
                              primaryTypographyProps={{ variant: "body2" }}
                              secondaryTypographyProps={{ variant: "body2", color: "text.secondary" }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                );
              })
            )}
          </Paper>
        );
      })}
    </>
  );
}
