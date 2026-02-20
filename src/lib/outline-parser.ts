import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import { savePresentation, type SermonPresentation } from "./presentations";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Bible book names for scripture detection
const BIBLE_BOOKS = [
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
  "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra",
  "Nehemiah","Esther","Job","Psalms?","Proverbs","Ecclesiastes","Song of Solomon",
  "Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah",
  "Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians",
  "2 Corinthians","Galatians","Ephesians","Philippians","Colossians",
  "1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon",
  "Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"
];

const booksPattern = BIBLE_BOOKS.join("|");
const SCRIPTURE_REGEX = new RegExp(
  `((?:${booksPattern})\\s+\\d+(?::\\d+(?:\\s*-\\s*\\d+)?)?)`,
  "gi"
);

// Detect if a line is a "Slide" marker
function isSlideMarker(line: string): boolean {
  const stripped = line.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  return /^slide(?:\s+\d+)?$/i.test(stripped);
}

// Extract title from lines
function extractTitle(lines: string[]): { title: string; remainingLines: string[] } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for "Title:" prefix
    const titleMatch = line.match(/^title\s*:\s*(.+)/i);
    if (titleMatch) {
      return { title: titleMatch[1].trim(), remainingLines: lines.slice(i + 1) };
    }

    // If this line is a slide marker, no explicit title — use empty
    if (isSlideMarker(line)) {
      return { title: "", remainingLines: lines.slice(i) };
    }

    // Use first non-empty line as title
    return { title: line, remainingLines: lines.slice(i + 1) };
  }
  return { title: "Untitled", remainingLines: [] };
}

// Detect scripture references in text
function findScriptureReferences(text: string): string[] {
  const matches = text.match(SCRIPTURE_REGEX);
  return matches ? [...new Set(matches)] : [];
}

// Parse raw text/HTML content into slides
function parseContent(content: string): { title: string; points: SermonPresentation["data"]["points"] } {
  // Normalize line breaks
  const rawLines = content.split(/\n/);
  const { title, remainingLines } = extractTitle(rawLines);

  // Split into slide sections — ignore everything before the first slide marker
  const sections: string[][] = [];
  let currentSection: string[] = [];
  let foundFirstSlide = false;

  for (const line of remainingLines) {
    const stripped = line.replace(/<[^>]*>/g, "").trim();
    if (isSlideMarker(stripped)) {
      foundFirstSlide = true;
      if (currentSection.length > 0) {
        sections.push(currentSection);
      }
      currentSection = [];
    } else if (foundFirstSlide) {
      currentSection.push(line);
    }
    // else: discard pre-slide content
  }
  if (currentSection.length > 0) {
    sections.push(currentSection);
  }

  // Fallback: if no slide markers were found, split on blank-line groups
  if (sections.length === 0 && remainingLines.length > 0) {
    let block: string[] = [];
    for (const line of remainingLines) {
      const plain = line.replace(/<[^>]*>/g, "").trim();
      if (!plain) {
        if (block.length > 0) {
          sections.push(block);
          block = [];
        }
      } else {
        block.push(line);
      }
    }
    if (block.length > 0) {
      sections.push(block);
    }
  }

  // Helper: detect note lines
  const isNoteLine = (line: string): boolean =>
    /^\s*notes?\s*:/i.test(line.replace(/<[^>]*>/g, ""));

  // Helper: strip HTML tags
  const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

  // Convert sections to points using block-based processing
  const points = sections.map((section, idx) => {
    // 1. Block-based note filtering: truncate at first note line
    const noteIndex = section.findIndex((l) => isNoteLine(l));
    const contentLines = (noteIndex >= 0 ? section.slice(0, noteIndex) : section)
      .filter((l) => stripHtml(l) !== "");

    if (contentLines.length === 0) return null;

    const contentText = contentLines.map((l) => stripHtml(l)).join(" ");
    const scriptureRefs = findScriptureReferences(contentText);

    // 2. Classify the section: scripture-only, point-only, or mixed
    if (scriptureRefs.length > 0) {
      // Extract quoted verse text if present
      const quoteMatch = contentText.match(/[\u201C""]([^"\u201D\u201C]+)[\u201D""]/);
      const verseText = quoteMatch ? quoteMatch[1] : contentText;

      // Check if the entire block is scripture content (no separate heading)
      // A section is "scripture-only" if removing the reference and quotes leaves little/no text
      const withoutRefs = scriptureRefs.reduce((t, ref) => t.replace(ref, ""), contentText);
      const withoutQuotes = withoutRefs.replace(/[\u201C""][^"\u201D\u201C]*[\u201D""]/g, "").trim();
      const remainingWords = withoutQuotes.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);

      if (remainingWords.length <= 3) {
        // Scripture-only section: set title to "" so SlideEditor only creates scripture slide
        return {
          id: String(Date.now() + idx),
          title: "",
          scriptures: scriptureRefs.map((ref) => ({
            reference: ref,
            text: verseText,
          })),
        };
      } else {
        // Mixed: first line is the heading, scripture is separate
        const headingLine = stripHtml(contentLines[0]);
        // Check if the heading itself IS the scripture ref
        const headingIsRef = scriptureRefs.some((ref) =>
          headingLine.replace(/[^a-zA-Z0-9\s:]/g, "").trim().toLowerCase() ===
          ref.replace(/[^a-zA-Z0-9\s:]/g, "").trim().toLowerCase()
        );

        if (headingIsRef) {
          // The heading is just a scripture reference — treat as scripture-only
          return {
            id: String(Date.now() + idx),
            title: "",
            scriptures: scriptureRefs.map((ref) => ({
              reference: ref,
              text: verseText,
            })),
          };
        }

        return {
          id: String(Date.now() + idx),
          title: headingLine,
          scriptures: scriptureRefs.map((ref) => ({
            reference: ref,
            text: verseText,
          })),
        };
      }
    } else {
      // No scripture — point-only slide
      const pointTitle = stripHtml(contentLines[0]) || `Slide ${idx + 1}`;
      return {
        id: String(Date.now() + idx),
        title: pointTitle,
        scriptures: [] as { reference: string; text?: string }[],
      };
    }
  }).filter(Boolean) as SermonPresentation["data"]["points"];

  return { title, points };
}

// Extract text from DOCX using mammoth (returns HTML to preserve formatting)
async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  // Convert HTML paragraphs to lines, preserving inline formatting
  return result.value
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n");
}

// Extract text from PDF using pdfjs-dist — detect line breaks and slide boundaries via y-coordinates
async function extractPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Filter to items with actual text
    const items = (textContent.items as any[])
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        str: item.str.trim(),
        y: Math.round(item.transform[5]), // y-coordinate (PDF: bottom-up)
        height: item.height || item.transform[3] || 12,
      }));

    if (items.length === 0) continue;

    // Sort by y descending (top of page first)
    items.sort((a, b) => b.y - a.y);

    // Group into lines by similar y-coordinate
    const lines: { y: number; height: number; text: string }[] = [];
    let cur = { y: items[0].y, height: items[0].height, parts: [items[0].str] };

    for (let j = 1; j < items.length; j++) {
      const item = items[j];
      if (Math.abs(cur.y - item.y) < cur.height * 0.6) {
        // Same line
        cur.parts.push(item.str);
      } else {
        lines.push({ y: cur.y, height: cur.height, text: cur.parts.join(" ") });
        cur = { y: item.y, height: item.height, parts: [item.str] };
      }
    }
    lines.push({ y: cur.y, height: cur.height, text: cur.parts.join(" ") });

    // Detect large y-gaps between lines as slide boundaries
    for (let j = 0; j < lines.length; j++) {
      if (j > 0) {
        const gap = lines[j - 1].y - lines[j].y;
        const avgHeight = (lines[j - 1].height + lines[j].height) / 2;
        if (gap > avgHeight * 2.5) {
          // Large gap → slide boundary
          allLines.push("#### SLIDE ####");
        }
      }
      allLines.push(lines[j].text);
    }

    // Page break → slide boundary
    if (i < pdf.numPages) {
      allLines.push("#### SLIDE ####");
    }
  }

  return allLines.join("\n");
}

// Extract text from TXT
async function extractTxt(file: File): Promise<string> {
  return file.text();
}

// Main entry point
export async function parseOutlineFile(file: File): Promise<SermonPresentation> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  let content: string;
  switch (ext) {
    case "docx":
    case "doc":
      content = await extractDocx(file);
      break;
    case "pdf":
      content = await extractPdf(file);
      break;
    case "txt":
      content = await extractTxt(file);
      break;
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }

  const { title, points } = parseContent(content);

  const now = new Date();
  const id = `outline-${Date.now()}`;

  const presentation: SermonPresentation = {
    id,
    title: title || "Untitled Sermon",
    date: now.toISOString().split("T")[0],
    slides: points.length + 1, // +1 for title slide
    lastModified: now.toLocaleString(),
    data: {
      title: title || "Untitled Sermon",
      date: now.toISOString().split("T")[0],
      translation: "KJV",
      verseBreakdown: "full-passage",
      points,
    },
  };

  savePresentation(presentation);
  return presentation;
}
