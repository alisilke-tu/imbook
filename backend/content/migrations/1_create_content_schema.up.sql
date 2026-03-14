-- Chapters (hierarchical: parent_chapter_id self-reference).
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_number TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  parent_chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  start_page INT NOT NULL DEFAULT 0,
  end_page INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_chapters_parent ON chapters(parent_chapter_id);
CREATE INDEX idx_chapters_sort ON chapters(sort_order);

-- Content blocks (one per chapter for now; block_type = 'paragraph').
CREATE TABLE content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL DEFAULT 'paragraph' CHECK (block_type IN ('paragraph')),
  page_number INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_content_blocks_chapter ON content_blocks(chapter_id);
CREATE INDEX idx_content_blocks_sort ON content_blocks(chapter_id, sort_order);

-- Paragraphs (1:1 with paragraph-type content block).
CREATE TABLE paragraphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_block_id UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE UNIQUE,
  content TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_paragraphs_block ON paragraphs(content_block_id);

-- References (origin block -> optional target chapter or block). Table name quoted because "references" is a SQL reserved word.
CREATE TABLE "references" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_block_id UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('chapter', 'block')),
  target_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  target_block_id UUID REFERENCES content_blocks(id) ON DELETE SET NULL
);

CREATE INDEX idx_references_origin ON "references"(origin_block_id);
CREATE INDEX idx_references_target_chapter ON "references"(target_chapter_id);
CREATE INDEX idx_references_target_block ON "references"(target_block_id);
