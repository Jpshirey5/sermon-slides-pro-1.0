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

  // Helper: detect note lines
  const isNoteLine = (line: string): boolean =>
    /^\s*notes?\s*:/i.test(line.replace(/<[^>]*>/g, ""));

  // Convert sections to points
  const points = sections.map((section, idx) => {
    // Filter out empty lines and note lines
    const filteredLines = section.filter((l) => {
      const plain = l.replace(/<[^>]*>/g, "").trim();
      return plain && !isNoteLine(l);
    });

    if (filteredLines.length === 0) return null;

    const contentText = filteredLines
      .map((l) => l.replace(/<[^>]*>/g, "").trim())
      .join(" ");

    const scriptureRefs = findScriptureReferences(contentText);
    const pointTitle = filteredLines[0]?.replace(/<[^>]*>/g, "").trim() || `Slide ${idx + 1}`;

    const scriptures = scriptureRefs.map((ref) => ({
      reference: ref,
      text: contentText,
    }));

    return {
      id: String(Date.now() + idx),
      title: pointTitle,
      scriptures: scriptures.length > 0 ? scriptures : ([] as { reference: string; text?: string }[]),
    };
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

// Extract text from PDF using pdfjs-dist
async function extractPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    lines.push(pageText);
  }

  return lines.join("\n");
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
