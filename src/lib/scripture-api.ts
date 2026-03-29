export interface ScriptureResult {
  text: string;
  reference: string;
  translation: string;
  error?: boolean;
  errorMessage?: string;
  verses?: { text: string; verse: number }[];
}

export function parseScriptureReference(reference: string): {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
} | null {
  const match = reference.match(/^(\d?\s*[A-Za-z]+)\s+(\d+):(\d+)(?:-(\d+))?$/i);
  if (!match) return null;

  return {
    book: match[1].trim(),
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : undefined,
  };
}

function getScriptureLookupEndpoint(): { url: string; headers: Record<string, string> } | null {
  const workerApiBaseUrl = (import.meta.env.VITE_SCRIPTURE_API_BASE_URL || "").trim();
  if (workerApiBaseUrl) {
    return {
      url: new URL("/api/scripture-lookup", workerApiBaseUrl).toString(),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  if (import.meta.env.PROD) {
    return {
      url: "/api/scripture-lookup",
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return {
    url: `${supabaseUrl}/functions/v1/scripture-lookup`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
  };
}

export async function lookupScripture(
  reference: string,
  translation: string = "KJV"
): Promise<ScriptureResult | null> {
  const requestedTranslation = translation.toUpperCase();

  if (!reference || reference.trim().length < 3) {
    return {
      text: "",
      reference,
      translation: requestedTranslation,
      error: true,
      errorMessage: "Please enter a valid scripture reference (e.g., John 3:16)",
    };
  }

  const endpoint = getScriptureLookupEndpoint();
  if (!endpoint) {
    return {
      text: "",
      reference,
      translation: requestedTranslation,
      error: true,
      errorMessage: "Scripture lookup is not configured for this environment.",
    };
  }

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: endpoint.headers,
      body: JSON.stringify({
        reference,
        translation: requestedTranslation,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        text: "",
        reference,
        translation: requestedTranslation,
        error: true,
        errorMessage: data?.errorMessage || data?.error || "Could not find scripture. Please try again.",
      };
    }

    if (!data) {
      return {
        text: "",
        reference,
        translation: requestedTranslation,
        error: true,
        errorMessage: "Scripture lookup returned an empty response.",
      };
    }

    return {
      text: data.text || "",
      reference: data.reference || reference,
      translation: data.translation || requestedTranslation,
      verses: data.verses,
      error: data.error,
      errorMessage: data.errorMessage,
    };
  } catch {
    return {
      text: "",
      reference,
      translation: requestedTranslation,
      error: true,
      errorMessage: "Network error. Please try again.",
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
