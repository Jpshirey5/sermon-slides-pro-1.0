// Manuscript parsing and content generation utilities
// Uses structured text splitting for now — ready to be replaced with AI later

import type { WeekContent, SessionContent } from './study-guides';

/** Split text into roughly equal paragraph-based chunks */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/** Distribute paragraphs evenly across N buckets */
function distributeContent(paragraphs: string[], count: number): string[][] {
  const buckets: string[][] = Array.from({ length: count }, () => []);
  paragraphs.forEach((p, i) => {
    buckets[i % count].push(p);
  });
  return buckets;
}

/** Extract potential scripture references from text */
function extractScriptureRefs(text: string): string[] {
  const pattern = /(?:\d\s)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+\d{1,3}:\d{1,3}(?:-\d{1,3})?/g;
  const matches = text.match(pattern);
  return matches ? [...new Set(matches)] : [];
}

/** Generate a title from a chunk of text */
function generateTitle(text: string, index: number, prefix: string): string {
  // Take the first sentence or first 60 chars
  const firstSentence = text.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length > 5 && firstSentence.length < 80) {
    return firstSentence;
  }
  return `${prefix} ${index + 1}`;
}

/** Generate discussion questions from content */
function generateQuestions(text: string): string[] {
  const questions: string[] = [];
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);

  if (sentences.length > 0) {
    questions.push(`What is the main theme of this section, and how does it apply to your life?`);
  }
  if (sentences.length > 2) {
    questions.push(`How can you put these teachings into practice this week?`);
  }
  questions.push(`What stood out to you most, and why?`);

  return questions;
}

/** Generate teaching outline from content */
function generateOutline(text: string): string[] {
  const sentences = text
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 120);
  return sentences.slice(0, 5);
}

/** Generate key takeaways from content */
function generateTakeaways(text: string): string[] {
  const sentences = text
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 100);
  return sentences.slice(0, 3).map(s => s + '.');
}

// ── Public API ──────────────────────────────────────────────

export function generateStudyGuideContent(
  text: string,
  title: string,
  weeks: number
): WeekContent[] {
  const paragraphs = splitIntoParagraphs(text);
  if (paragraphs.length === 0) {
    // If no real paragraph breaks, split by sentences
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    const chunkSize = Math.max(1, Math.ceil(sentences.length / weeks));
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += chunkSize) {
      chunks.push(sentences.slice(i, i + chunkSize).join(' '));
    }
    return chunks.slice(0, weeks).map((chunk, i) => ({
      week: i + 1,
      title: generateTitle(chunk, i, 'Week'),
      keyPoints: generateOutline(chunk).slice(0, 3),
      discussionQuestions: generateQuestions(chunk),
      scriptureReferences: extractScriptureRefs(chunk),
      rawContent: chunk,
    }));
  }

  const distributed = distributeContent(paragraphs, weeks);
  return distributed.map((chunks, i) => {
    const combined = chunks.join('\n\n');
    return {
      week: i + 1,
      title: generateTitle(combined, i, 'Week'),
      keyPoints: generateOutline(combined).slice(0, 3),
      discussionQuestions: generateQuestions(combined),
      scriptureReferences: extractScriptureRefs(combined),
      rawContent: combined,
    };
  });
}

export function generateConferenceContent(
  text: string,
  title: string,
  sessionCount: number,
  duration: number
): SessionContent[] {
  const paragraphs = splitIntoParagraphs(text);
  const source = paragraphs.length > 0
    ? paragraphs
    : text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

  const distributed = distributeContent(source, sessionCount);
  const typeLabels: Array<SessionContent['typeLabel']> = [
    'Main Session',
    'Breakout Session',
    'Workshop',
  ];

  return distributed.map((chunks, i) => {
    const combined = chunks.join('\n\n');
    return {
      session: i + 1,
      title: generateTitle(combined, i, 'Session'),
      typeLabel: typeLabels[i % typeLabels.length],
      teachingOutline: generateOutline(combined),
      keyTakeaways: generateTakeaways(combined),
      discussionPrompts: generateQuestions(combined),
      scriptureReferences: extractScriptureRefs(combined),
      facilitatorNotes: `Duration: ${duration} minutes. Cover the key points, then open the floor for discussion. Leave 10-15 minutes for Q&A.`,
      rawContent: combined,
    };
  });
}
