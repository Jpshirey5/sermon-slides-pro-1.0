

# "Create through Sermon Outline" Feature

## Overview

Add a new button to the Sermon Slide Creator card on the Dashboard that lets users upload a document (DOCX, TXT, or PDF) containing a sermon outline. The app parses the document to detect titles, slides, sermon points, scripture references, and text formatting (bold, underline, italic), then generates a full presentation in the slide editor.

---

## 1. Dashboard Button

Add a "Create through Sermon Outline" button below the existing "Create New Presentation" button in the Sermon Slide Creator card on the Dashboard page.

- File: `src/pages/Dashboard.tsx`
- Clicking it navigates to `/dashboard/outline-upload`

---

## 2. New Page: Outline Upload (`src/pages/OutlineUpload.tsx`)

A new protected page with:

- Header matching existing pages (back to dashboard, logo)
- A drag-and-drop upload zone accepting `.docx`, `.txt`, and `.pdf` files
- File type validation (reject unsupported formats)
- Loading spinner while parsing
- After parsing, automatically generates slides and navigates to the slide editor

---

## 3. Document Parsing Logic (`src/lib/outline-parser.ts`)

A new utility module that takes raw document content and extracts structured slide data.

### Parsing Rules

**Title Detection:**
- Look for a line starting with or containing "Title:" -- use the text after it
- If no explicit "Title:" label, use the first non-empty line at the top of the document

**Slide Detection:**
- Scan for the word "Slide" (case-insensitive) as a delimiter
- Formats include: `Slide`, `SLIDE`, `#### SLIDE ####`, `Slide 1`, etc.
- Everything between one "Slide" marker and the next becomes one slide's content

**Content Type Detection (per slide):**
- Scripture: detected by Bible reference patterns (e.g., "John 3:16", "1 Corinthians 13:4-7", "Genesis 1:1")
- Sermon Point: if no scripture pattern is found, treat as a sermon point
- Both: if a slide contains both a scripture reference and non-reference text, it becomes a point slide with scripture content embedded

**Text Formatting:**
- For DOCX: use mammoth's HTML output to detect `<strong>`, `<em>`, `<u>` tags and preserve them as inline HTML in slide content
- For TXT: no formatting (plain text)
- For PDF: use pdfjs-dist text extraction (formatting limited to what PDF text layers provide)

### Output

Returns a `SermonPresentation` object (matching the existing interface in `src/lib/presentations.ts`) that can be saved and opened in the editor.

---

## 4. SlideData Enhancement

The existing `SlideData.content` fields (`title`, `subtitle`, `scripture`, `reference`) are plain strings. To preserve bold/underline/italic formatting from the uploaded document, slide content will include simple HTML markup (`<b>`, `<i>`, `<u>`) within those strings.

The slide editor already renders content via contentEditable divs which natively support HTML, so bold/underline/italic will render correctly without changes to the editor.

---

## 5. Route Addition

- File: `src/App.tsx`
- Add route: `/dashboard/outline-upload` pointing to `OutlineUpload` wrapped in `ProtectedRoute`

---

## Technical Details

### Files Created
- `src/pages/OutlineUpload.tsx` -- upload page with drag-and-drop UI
- `src/lib/outline-parser.ts` -- document parsing and slide generation logic

### Files Modified
- `src/pages/Dashboard.tsx` -- add "Create through Sermon Outline" button to the Sermon Slide Creator card
- `src/App.tsx` -- add new route

### Dependencies Used (already installed)
- `mammoth` -- DOCX to HTML conversion (already in project)
- `pdfjs-dist` -- PDF text extraction (already in project)

### Parsing Flow

```text
Upload File
    |
    v
Detect file type (.docx / .txt / .pdf)
    |
    v
Extract text content (mammoth for DOCX, pdfjs for PDF, FileReader for TXT)
    |
    v
Parse outline:
  1. Find title (look for "Title:" or first line)
  2. Split by "Slide" markers
  3. For each slide section:
     a. Detect scripture references (regex)
     b. Classify as point, scripture, or both
     c. Preserve bold/underline/italic markup (DOCX only)
    |
    v
Build SermonPresentation object
    |
    v
Save to localStorage via savePresentation()
    |
    v
Navigate to /editor/{id}
```
