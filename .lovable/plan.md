

# Fix Outline Parser: Block-Based Content Processing

## Problem Summary

Three issues causing bad output:

1. **Notes leak through**: Only the line starting with "Note:" is filtered. Continuation lines on subsequent lines still appear as slide content.
2. **Duplicate scripture slides**: Every section creates a point-title slide AND a scripture slide, so scripture content appears twice.
3. **Line-by-line processing**: The parser treats each line independently instead of understanding multi-line blocks (a verse that wraps across lines, a note that continues below).

## Solution

Rewrite the section-to-point conversion in `parseContent` to use block-based processing instead of line-by-line filtering.

### File Modified
- `src/lib/outline-parser.ts` -- `parseContent` function (section-to-points mapping)

### Changes

**1. Block-based note filtering**

Instead of checking each line individually, once a "Note:" line is found, discard it AND all remaining lines in that section (notes always trail the main content within a section):

```
// Current (broken): filters individual lines
section.filter(l => !isNoteLine(l))

// Fixed: truncate section at first note line
const noteIndex = section.findIndex(l => isNoteLine(l));
const contentLines = noteIndex >= 0
  ? section.slice(0, noteIndex)
  : section;
```

**2. Smart point creation -- no duplicate slides**

The SlideEditor creates a point-title slide when `point.title` is truthy (line 115), then creates scripture slides from `point.scriptures` (line 131). For scripture-only sections, this means duplicate slides.

Fix: When a section contains only scripture content (no separate heading/sermon point text), set `point.title = ""` so only the scripture slide is generated. When a section is a heading/sermon point with no scripture, set `point.title` to the text with empty scriptures array.

Logic:
- Join all non-empty, non-note lines into one content block
- Detect scripture references in the block
- If the entire block is a scripture quote + reference: create point with `title = ""` and `scriptures = [{ reference, text: quoteText }]`
- If no scripture found: create point with `title = contentText` and empty scriptures
- If mixed (heading + scripture): create point with `title = headingPart` and `scriptures = [{ reference, text }]`

**3. Scripture text extraction**

Instead of using the entire section text as `scripture.text`, extract just the quoted verse text. Look for text between quotation marks as the verse content, and use the scripture reference detected by regex as the reference:

```
// Extract quoted text: "Not many of you should..." -> verse text
const quoteMatch = contentText.match(/"([^"]+)"/);
const verseText = quoteMatch ? quoteMatch[1] : contentText;
```

### Expected Output for Sample PDF

Using "The Power of Words pt. 2B MEDIA.pdf":

| Slide | Type | Content |
|-------|------|---------|
| 1 | Title | "The Power of Words pt. 2" |
| 2 | Scripture | Reference: James 3:1-13 |
| 3 | Scripture | "Not many of you should become teachers..." -- James 3:1 ESV |
| 4 | Scripture | "For we all stumble in many ways..." -- James 3:2a ESV |
| 5 | Point | "Five Metaphors" |
| 6 | Point | "#1 Bit" |
| 7 | Scripture | "...able also to bridle his whole body..." -- James 3:2b-3 ESV |
| ... | ... | ... |

Notes like "Just display the reference for now..." and "Please use the passage as listed below..." are completely excluded.

No duplicate slides -- each section produces exactly ONE slide (either a point OR a scripture, not both).

