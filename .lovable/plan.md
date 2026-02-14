

# Add .docx and .pdf File Upload Support to Manuscript Generator

## Overview

Currently the Manuscript Generator only accepts `.txt` files. This update will add support for `.docx` (Microsoft Word) and `.pdf` files by using browser-compatible parsing libraries.

## Approach

### New Dependencies

- **mammoth** -- Extracts raw text from `.docx` files in the browser. Lightweight, no server needed.
- **pdfjs-dist** -- Mozilla's PDF.js library for extracting text from PDF files in the browser. No server needed.

### Changes

**File: `src/pages/ManuscriptGenerator.tsx`**

1. Update the file input `accept` attribute from `.txt` to `.txt,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document`
2. Update the upload area label to say ".txt, .docx, or .pdf" instead of just ".txt"
3. Update the description text ("Paste your sermon text or upload a file")
4. Rewrite `handleFileChange` to detect file type by extension and route to the appropriate parser:
   - `.txt` -- read as text (existing behavior)
   - `.docx` -- use `mammoth.extractRawText()` to pull plain text
   - `.pdf` -- use `pdfjs-dist` to iterate pages, extract text content, and join into a single string
5. Add a loading state while `.docx` and `.pdf` files are being parsed (these are async operations)
6. Strip the correct extension from filename when auto-filling the title

### How Each Parser Works

- **DOCX**: `mammoth.extractRawText({ arrayBuffer })` returns `{ value: string }` containing all document text with paragraph breaks preserved
- **PDF**: Load the PDF with `pdfjsLib.getDocument()`, loop through each page, call `page.getTextContent()`, and concatenate all text items with spacing and newlines between pages

## What Does NOT Change

- `src/lib/manuscript-parser.ts` -- untouched (it receives plain text regardless of source format)
- `src/lib/study-guides.ts` -- untouched
- All other pages and components -- untouched
- The generate, save, copy, and download flows -- untouched

