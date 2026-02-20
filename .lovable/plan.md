

# Fix Outline Parser: Clean Slide Content

## Problem

The current parser has three issues:
1. **Extra slides**: Content between the title and the first "Slide" marker gets treated as a separate slide section, creating unwanted slides.
2. **Notes included**: Lines starting with "Note:" or "Notes:" are not filtered out, so they appear in slide content.
3. **Duplicated content**: When a scripture reference is found, the entire section text (including notes and unrelated lines) is stored as the scripture `text`, causing bloated/duplicated content on slides.

## Solution

Rewrite the `parseContent` function in `src/lib/outline-parser.ts` with these changes:

### 1. Discard pre-slide content
Only start collecting sections after the first "Slide" marker is encountered. Any text between the title and the first slide marker is ignored.

### 2. Filter out notes
Strip lines that start with "Note:" or "Notes:" (case-insensitive) from each slide section before building the point.

### 3. Clean scripture text
Instead of dumping the entire section text into the scripture `text` field, use only the non-note, non-empty content lines as the slide's text content.

---

## Technical Details

### File Modified
- `src/lib/outline-parser.ts`

### Changes to `parseContent` function

**Slide collection** -- ignore lines before the first slide marker:
```
let foundFirstSlide = false;
for (const line of remainingLines) {
  if (isSlideMarker(stripped)) {
    foundFirstSlide = true;
    // push previous section, start new
  } else if (foundFirstSlide) {
    currentSection.push(line);
  }
  // else: discard pre-slide content
}
```

**Note filtering** -- remove note lines from each section:
```
const isNoteLine = (line) =>
  /^\s*notes?\s*:/i.test(line.replace(/<[^>]*>/g, ""));

const filteredLines = section.filter(l => {
  const plain = l.replace(/<[^>]*>/g, "").trim();
  return plain && !isNoteLine(l);
});
```

**Scripture text cleanup** -- use filtered content only:
```
const contentText = filteredLines
  .map(l => l.replace(/<[^>]*>/g, "").trim())
  .join(" ");

scriptures = refs.map(ref => ({
  reference: ref,
  text: contentText,
}));
```

**Point title** -- use the first filtered non-empty line (with HTML stripped) as the point title instead of the raw first line.
