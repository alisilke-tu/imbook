package db

import (
	"encoding/xml"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// TextItem is a single text element with all attributes and the page it belongs to.
// Content is plain text with <i>, <b>, <a> stripped; IsItalic/IsBold/Href hold extracted info.
// HrefType is set for internal links: "chapter" (text before link ends with "Kap."/"Abschn.") or "other" (ignored for now).
type TextItem struct {
	Page     int
	Top      int
	Left     int
	Width    int
	Height   int
	Font     int
	Content  string
	IsItalic bool
	IsBold   bool
	Href     string
	HrefType string
}

// ChapterDraft is a debug-friendly chapter record you can later map to your DB tables.
// Content already contains the concatenated text for this chapter scope.
type ChapterDraft struct {
	Key           string
	ChapterNumber string
	Title         string
	Level         string
	ParentKey     string
	SortOrder     int
	StartPage     int
	EndPage       int
	Content       string
}

// ReferenceDraft stores internal chapter-link references (HrefType "other" is ignored).
type ReferenceDraft struct {
	FromChapterKey string
	TargetLookup   string
	TargetKey      string
	RawHref        string
}

// ChapterParseResult is the debug output with chapters and extracted internal references.
type ChapterParseResult struct {
	Chapters   []ChapterDraft
	References []ReferenceDraft
}

type pdf2xml struct {
	XMLName xml.Name `xml:"pdf2xml"`
	Pages   []page   `xml:"page"`
}

type page struct {
	Number int       `xml:"number,attr"`
	Texts  []textElem `xml:"text"`
}

type textElem struct {
	Top     int    `xml:"top,attr"`
	Left    int    `xml:"left,attr"`
	Width   int    `xml:"width,attr"`
	Height  int    `xml:"height,attr"`
	Font    int    `xml:"font,attr"`
	Content string `xml:",innerxml"`
}

// ParseXML reads an XML file at path and returns a flat list of text elements,
// each with all attributes and the page number.
func ParseXML(path string) ([]TextItem, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read xml: %w", err)
	}
	return ParseXMLBytes(data)
}

// ParseXMLBytes parses XML from in-memory data and returns a flat list of text elements
// (same as ParseXML but without reading from disk). Used for API uploads.
func ParseXMLBytes(data []byte) ([]TextItem, error) {
	var doc pdf2xml
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse xml: %w", err)
	}
	var list []TextItem
	var prevPlain string
	for _, p := range doc.Pages {
		for _, t := range p.Texts {
			plain, isItalic, isBold, href := processContent(t.Content)
			hrefType := classifyHrefType(t.Content, href, prevPlain)
			list = append(list, TextItem{
				Page:     p.Number,
				Top:      t.Top,
				Left:     t.Left,
				Width:    t.Width,
				Height:   t.Height,
				Font:     t.Font,
				Content:  plain,
				IsItalic: isItalic,
				IsBold:   isBold,
				Href:     href,
				HrefType: hrefType,
			})
			prevPlain = plain
		}
	}
	// Filter out heading row (Top == 56) — it's repeated on every page and unnecessary noise.
	filtered := list[:0]
	for _, it := range list {
		if it.Top != 56 {
			filtered = append(filtered, it)
		}
	}
	return filtered, nil
}

var chapterNumberRe = regexp.MustCompile(`^\s*(\d+(?:\.\d+)*)\s*(.*)$`)

// BuildChapterDrafts groups parsed elements from a file into heading/subheading/subsubheading chapters.
//
// Heading detection: height + IsBold. Height mapping:
// - 50 => heading, 16 => subheading, 15 => subsubheading
func BuildChapterDrafts(path string) (*ChapterParseResult, error) {
	items, err := ParseXML(path)
	if err != nil {
		return nil, err
	}
	return BuildChapterDraftsFromItems(items)
}

// BuildChapterDraftsFromBytes parses XML from in-memory data and returns chapter drafts and references (for API uploads).
func BuildChapterDraftsFromBytes(data []byte) (*ChapterParseResult, error) {
	items, err := ParseXMLBytes(data)
	if err != nil {
		return nil, err
	}
	return BuildChapterDraftsFromItems(items)
}

// BuildChapterDraftsFromItems groups items into chapters and extracts references.
func BuildChapterDraftsFromItems(items []TextItem) (*ChapterParseResult, error) {
	chapters := make([]ChapterDraft, 0, 64)
	references := make([]ReferenceDraft, 0, 64)
	chapterKeyToIdx := map[string]int{}
	chapterNumberToKey := map[string]string{}

	currentHeadingKey := ""
	currentSubheadingKey := ""
	currentSubsubheadingKey := ""
	sortOrder := 0

	appendContent := func(chapterKey, text string, page int) {
		text = strings.TrimSpace(text)
		if chapterKey == "" || text == "" {
			return
		}
		idx, ok := chapterKeyToIdx[chapterKey]
		if !ok {
			return
		}
		ch := &chapters[idx]
		if ch.Content == "" {
			ch.Content = text
		} else {
			ch.Content += " " + text
		}
		if page < ch.StartPage {
			ch.StartPage = page
		}
		if page > ch.EndPage {
			ch.EndPage = page
		}
	}

	currentDeepestKey := func() string {
		if currentSubsubheadingKey != "" {
			return currentSubsubheadingKey
		}
		if currentSubheadingKey != "" {
			return currentSubheadingKey
		}
		return currentHeadingKey
	}

	for i := 0; i < len(items); {
		item := items[i]
		if isHeadingElement(item) {
			runText, next := collectConnectedHeadingRun(items, i)
			chapterNumber, title := splitChapterNumberAndTitle(runText)
			level := levelForHeight(item.Height)
			parentKey := ""
			switch level {
			case "heading":
				parentKey = ""
			case "subheading":
				parentKey = currentHeadingKey
			case "subsubheading":
				if currentSubheadingKey != "" {
					parentKey = currentSubheadingKey
				} else {
					parentKey = currentHeadingKey
				}
			}

			chapterKey := makeChapterKey(level, chapterNumber, runText, item.Page)
			if _, exists := chapterKeyToIdx[chapterKey]; !exists {
				chapters = append(chapters, ChapterDraft{
					Key:           chapterKey,
					ChapterNumber: chapterNumber,
					Title:         title,
					Level:         level,
					ParentKey:     parentKey,
					SortOrder:     sortOrder,
					StartPage:     item.Page,
					EndPage:       item.Page,
				})
				chapterKeyToIdx[chapterKey] = len(chapters) - 1
				sortOrder++
				if chapterNumber != "" {
					if _, exists := chapterNumberToKey[chapterNumber]; !exists {
						chapterNumberToKey[chapterNumber] = chapterKey
					}
				}
			}

			switch level {
			case "heading":
				currentHeadingKey = chapterKey
				currentSubheadingKey = ""
				currentSubsubheadingKey = ""
			case "subheading":
				currentSubheadingKey = chapterKey
				currentSubsubheadingKey = ""
			case "subsubheading":
				currentSubsubheadingKey = chapterKey
			}
			i = next
			continue
		}

		deepest := currentDeepestKey()
		appendContent(deepest, item.Content, item.Page)

		// Keep only chapter references; ignore HrefType "other" for now.
		if item.HrefType == "chapter" && strings.HasPrefix(item.Href, internalLinkPrefix) {
			targetLookup := strings.TrimSpace(item.Content)
			targetKey := chapterNumberToKey[targetLookup]
			references = append(references, ReferenceDraft{
				FromChapterKey: deepest,
				TargetLookup:   targetLookup,
				TargetKey:      targetKey,
				RawHref:        item.Href,
			})
		}
		i++
	}

	// Normalize spacing in final concatenated chapter content.
	for idx := range chapters {
		chapters[idx].Content = normalizeSpaces(chapters[idx].Content)
	}

	return &ChapterParseResult{
		Chapters:   chapters,
		References: references,
	}, nil
}

// processContent extracts is_italic, is_bold, href from raw XML and returns plain text.
func processContent(raw string) (plain string, isItalic, isBold bool, href string) {
	isItalic = strings.Contains(raw, "<i>")
	isBold = strings.Contains(raw, "<b>")
	if i := strings.Index(raw, `href="`); i >= 0 {
		start := i + len(`href="`)
		if end := strings.Index(raw[start:], `"`); end >= 0 {
			href = raw[start : start+end]
		}
	}
	plain = stripTags(raw)
	return plain, isItalic, isBold, href
}

const internalLinkPrefix = "Krcmar2015_Informationsmanagement_Content.html"

// classifyHrefType returns "chapter" if the link is internal and the text before the <a> (in same element or previous element) ends with "Kap." or "Abschn.";
// "other" for other internal links (ignored for now); empty string for non-internal or no link.
// prevContent is the plain content of the previous element in document order (use "" for first element).
func classifyHrefType(raw, href, prevContent string) string {
	if href == "" || !strings.HasPrefix(href, internalLinkPrefix) {
		return ""
	}
	// Same element: text before the first <a> tag
	idx := strings.Index(raw, "<a ")
	if idx > 0 {
		textBefore := strings.TrimSpace(stripTags(raw[:idx]))
		if strings.HasSuffix(textBefore, "Kap.") || strings.HasSuffix(textBefore, "Abschn.") {
			return "chapter"
		}
	}
	// Cross-element: link in its own element (e.g. "…in Kap.</text><text><a href=…>7</a>") — use previous element.
	prevContent = strings.TrimSpace(prevContent)
	if strings.HasSuffix(prevContent, "Kap.") || strings.HasSuffix(prevContent, "Abschn.") {
		return "chapter"
	}
	return "other"
}

func isHeadingHeight(h int) bool {
	return h == 50 || h == 16 || h == 15
}

// isHeadingElement is true when both height and IsBold match a heading level.
func isHeadingElement(it TextItem) bool {
	return it.IsBold && isHeadingHeight(it.Height)
}

func levelForHeight(h int) string {
	switch h {
	case 50:
		return "heading"
	case 16:
		return "subheading"
	case 15:
		return "subsubheading"
	default:
		return ""
	}
}

// collectConnectedHeadingRun collects all connected heading elements (same height, page, top, and all IsBold).
func collectConnectedHeadingRun(items []TextItem, start int) (text string, next int) {
	base := items[start]
	parts := make([]string, 0, 4)
	i := start
	for i < len(items) {
		it := items[i]
		if it.Height != base.Height || it.Page != base.Page || it.Top != base.Top || !it.IsBold {
			break
		}
		part := strings.TrimSpace(it.Content)
		if part != "" {
			parts = append(parts, part)
		}
		i++
	}
	return normalizeSpaces(strings.Join(parts, " ")), i
}

func splitChapterNumberAndTitle(raw string) (chapterNumber, title string) {
	raw = normalizeSpaces(raw)
	m := chapterNumberRe.FindStringSubmatch(raw)
	if len(m) != 3 {
		return "", raw
	}
	chapterNumber = strings.TrimSpace(m[1])
	title = strings.TrimSpace(m[2])
	return chapterNumber, title
}

func makeChapterKey(level, chapterNumber, runText string, page int) string {
	if chapterNumber != "" {
		return fmt.Sprintf("%s:%s:%s", level, chapterNumber, normalizeSpaces(runText))
	}
	return fmt.Sprintf("%s:p%d:%s", level, page, normalizeSpaces(runText))
}

func normalizeSpaces(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func stripTags(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

// ReadAndPrintXML reads an XML file at path and prints its contents.
func ReadAndPrintXML(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read xml: %w", err)
	}
	fmt.Println(string(data))
	return nil
}
