import { supabase } from "@/integrations/supabase/client";

export interface ScriptureResult {
  text: string;
  reference: string;
  translation: string;
  error?: boolean;
  errorMessage?: string;
  verses?: { text: string; verse: number }[];
}

export function normalizeScriptureReference(reference: string): string {
  return reference.trim().replace(/\s+/g, " ");
}

export function getFriendlyScriptureError(message?: string): string {
  const normalizedMessage = (message || "").toLowerCase();

  if (!normalizedMessage) {
    return "We couldn't find that passage. Check the reference and try again.";
  }

  if (
    normalizedMessage.includes("enter a valid scripture reference") ||
    normalizedMessage.includes("too short")
  ) {
    return "Enter a scripture reference like John 3:16.";
  }

  if (
    normalizedMessage.includes("invalid format") ||
    normalizedMessage.includes("format like") ||
    normalizedMessage.includes("empty response")
  ) {
    return "We couldn't read that reference. Try something like John 3:16 or Genesis 1:1-5.";
  }

  if (normalizedMessage.includes("unknown book")) {
    return "We couldn't recognize that Bible book. Check the spelling and try again.";
  }

  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("failed to send") ||
    normalizedMessage.includes("unexpected server error") ||
    normalizedMessage.includes("functionsfetcherror")
  ) {
    return "We couldn't look that passage up right now. Please try again in a moment.";
  }

  if (
    normalizedMessage.includes("could not find") ||
    normalizedMessage.includes("verse may not exist") ||
    normalizedMessage.includes("chapter and verse")
  ) {
    return "We couldn't find that passage. Check the chapter and verse numbers.";
  }

  return "We couldn't find that passage. Check the reference and try again.";
}

async function getScriptureFunctionErrorMessage(error: unknown): Promise<string | undefined> {
  const maybeError = error as { context?: unknown; message?: string };
  const context = maybeError.context;

  if (typeof Response !== "undefined" && context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.errorMessage === "string") return payload.errorMessage;
      if (typeof payload?.error === "string") return payload.error;
    } catch {
      // Fall back to the Supabase error message below.
    }
  }

  return maybeError.message;
}

export function parseScriptureReference(reference: string): {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
} | null {
  const normalizedReference = normalizeScriptureReference(reference);
  const match = normalizedReference.match(/^(\d?\s*[A-Za-z]+)\s+(\d+):(\d+)(?:-(\d+))?$/i);
  if (!match) return null;

  return {
    book: match[1].trim(),
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : undefined,
  };
}

export async function lookupScripture(
  reference: string,
  translation: string = "KJV"
): Promise<ScriptureResult | null> {
  const requestedTranslation = translation.toUpperCase();
  const normalizedReference = normalizeScriptureReference(reference);

  if (!normalizedReference || normalizedReference.length < 3) {
    return {
      text: "",
      reference,
      translation: requestedTranslation,
      error: true,
      errorMessage: getFriendlyScriptureError("enter a valid scripture reference"),
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("scripture-lookup", {
      body: {
        reference: normalizedReference,
        translation: requestedTranslation,
      },
    });

    if (error) {
      const errorMessage = await getScriptureFunctionErrorMessage(error);
      return {
        text: "",
        reference,
        translation: requestedTranslation,
        error: true,
        errorMessage: getFriendlyScriptureError(errorMessage),
      };
    }

    if (!data) {
      return {
        text: "",
        reference,
        translation: requestedTranslation,
        error: true,
        errorMessage: getFriendlyScriptureError("empty response"),
      };
    }

    return {
      text: data.text || "",
      reference: data.reference || normalizedReference,
      translation: data.translation || requestedTranslation,
      verses: data.verses,
      error: data.error,
      errorMessage: data.error ? getFriendlyScriptureError(data.errorMessage) : undefined,
    };
  } catch {
    return {
      text: "",
      reference,
      translation: requestedTranslation,
      error: true,
      errorMessage: getFriendlyScriptureError("network error"),
    };
  }
}

export function splitVerseText(
  text: string,
  reference: string
): { text: string; reference: string }[] {
  const parsed = parseScriptureReference(reference);
  if (!parsed || !parsed.verseEnd) {
    return [{ text, reference }];
  }

  const { book, chapter, verseStart, verseEnd } = parsed;
  const totalVerses = verseEnd - verseStart + 1;

  const numberPattern = new RegExp(
    `(?:^|\\s)(${Array.from({ length: totalVerses }, (_, i) => verseStart + i).join("|")})\\s`,
    "g"
  );
  const markers: { verse: number; pos: number }[] = [];
  let match: RegExpExecArray | null;
  const searchText = ` ${text}`;

  while ((match = numberPattern.exec(searchText)) !== null) {
    const verseNum = parseInt(match[1], 10);
    if (verseNum >= verseStart && verseNum <= verseEnd) {
      markers.push({ verse: verseNum, pos: match.index + match[0].indexOf(match[1]) - 1 });
    }
  }

  if (markers.length >= totalVerses * 0.6) {
    const uniqueMarkers = markers
      .filter((marker, index, array) => index === 0 || marker.verse !== array[index - 1].verse)
      .sort((a, b) => a.pos - b.pos);

    const results: { text: string; reference: string }[] = [];
    for (let i = 0; i < uniqueMarkers.length; i++) {
      const start = uniqueMarkers[i].pos;
      const end = i + 1 < uniqueMarkers.length ? uniqueMarkers[i + 1].pos : text.length;
      const verseText = text.slice(start, end).replace(/^\d+\s*/, "").trim();
      if (verseText) {
        results.push({
          text: verseText,
          reference: `${book} ${chapter}:${uniqueMarkers[i].verse}`,
        });
      }
    }
    if (results.length > 0) return results;
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim());
  if (sentences.length >= totalVerses) {
    const results: { text: string; reference: string }[] = [];
    const perVerse = Math.ceil(sentences.length / totalVerses);
    for (let i = 0; i < totalVerses; i++) {
      const chunk = sentences.slice(i * perVerse, (i + 1) * perVerse).join(" ").trim();
      if (chunk) {
        results.push({
          text: chunk,
          reference: `${book} ${chapter}:${verseStart + i}`,
        });
      }
    }
    if (results.length > 0) return results;
  }

  return [{ text, reference }];
}

export function searchScripture(query: string): string[] {
  const suggestions = [
    "John 3:16",
    "Romans 8:28",
    "Philippians 4:13",
    "Jeremiah 29:11",
    "Proverbs 3:5-6",
    "Isaiah 40:31",
    "Psalm 23:1-6",
    "Matthew 17:20",
    "1 John 4:18",
    "Galatians 5:22-23",
    "Hebrews 11:1",
    "James 1:2-4",
    "2 Timothy 1:7",
    "Joshua 1:9",
    "Ephesians 2:8-9",
    "Romans 12:2",
    "Matthew 28:19-20",
    "John 14:6",
    "Romans 10:9",
  ];

  const lowerQuery = query.toLowerCase();
  return suggestions.filter((suggestion) => suggestion.toLowerCase().includes(lowerQuery));
}
