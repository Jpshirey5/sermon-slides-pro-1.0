
# Reorganize Sermon Details and Add Verse Breakdown with Verse-by-Verse Slide Generation

## Overview

Three changes: (1) remove the Sermon Date field, (2) move Bible Translation up to where the date was, (3) add a "Verse Breakdown" radio group in the old Bible Translation spot, and (4) when "Verse by Verse" is selected, split multi-verse passages into individual slides in the editor.

## UI Changes on Create Page

The Sermon Details card will look like this:

```text
+-----------------------------------------------+
| Sermon Details                                 |
|                                                |
| [Sermon Title input]  [Bible Translation v]   |
|                                                |
| Verse Breakdown                                |
| (o) Verse by Verse    ( ) Full Verses          |
+-----------------------------------------------+
```

- **Sermon Date** is removed entirely
- **Bible Translation** moves into the right column of the grid (where date was)
- **Verse Breakdown** section appears below with two radio buttons side by side

## Slide Generation Logic

When "Verse by Verse" is selected and a passage spans multiple verses (e.g., "John 3:16-18"):
- The scripture API already returns the full combined text
- The app will split the text into individual verses and create one slide per verse
- Each slide will show the verse text and its specific reference (e.g., "John 3:16", "John 3:17", "John 3:18")

When "Full Verses" is selected (current behavior):
- All verses remain combined on a single slide as they do now

## Technical Details

### File: `src/pages/CreateSermon.tsx`
1. Remove `date` state variable and its input field
2. Move the Bible Translation `Select` into the grid's second column
3. Add new state: `const [verseBreakdown, setVerseBreakdown] = useState("verse-by-verse")`
4. Import `RadioGroup` and `RadioGroupItem` from `@/components/ui/radio-group`
5. Add Verse Breakdown section with two radio options below the grid
6. Include `verseBreakdown` in the saved presentation data
7. Use today's date as default when saving (since date input is removed)

### File: `src/lib/presentations.ts`
- Add `verseBreakdown?: string` to the `data` interface so the setting persists

### File: `src/pages/SlideEditor.tsx`
- Update `generateSlidesFromData()` function (lines 80-150):
  - When `presentation.data?.verseBreakdown === "verse-by-verse"` and a scripture has a verse range (detected via the reference containing a dash like "3:16-18"):
    - Split the scripture text into individual verses by detecting verse boundaries (sentence endings, numbered verse markers)
    - Create separate slide entries for each verse with individual references
  - When `"full-verses"` (or unset for backwards compatibility): keep current single-slide behavior

### File: `src/lib/scripture-api.ts`
- Add a new exported helper function `splitVerseText(text, reference)` that:
  - Takes the combined verse text and the parsed reference
  - Returns an array of `{ text: string, reference: string }` objects, one per verse
  - Uses sentence/period boundaries and verse number patterns to split
  - Falls back to keeping it as one block if splitting is unreliable
