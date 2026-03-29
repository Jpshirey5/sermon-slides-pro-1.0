type Verse = {
  text: string;
  verse: number;
};

type ScriptureResponse = {
  text: string;
  reference: string;
  translation: string;
  error?: boolean;
  errorMessage?: string;
  verses?: Verse[];
};

type BibleConfig = {
  apiBibleBaseUrl?: string;
  translationBibleIds?: Record<string, string>;
};

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  BIBLE_CONFIG: KVNamespace;
  BIBLE_API_KEY?: string;
  ESV_API_KEY?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const bookMappings: Record<string, string> = {
  "genesis": "GEN", "gen": "GEN",
  "exodus": "EXO", "exo": "EXO", "ex": "EXO",
  "leviticus": "LEV", "lev": "LEV",
  "numbers": "NUM", "num": "NUM",
  "deuteronomy": "DEU", "deu": "DEU", "deut": "DEU",
  "joshua": "JOS", "jos": "JOS", "josh": "JOS",
  "judges": "JDG", "jdg": "JDG", "judg": "JDG",
  "ruth": "RUT", "rut": "RUT",
  "1 samuel": "1SA", "1samuel": "1SA", "1sam": "1SA", "1 sam": "1SA",
  "2 samuel": "2SA", "2samuel": "2SA", "2sam": "2SA", "2 sam": "2SA",
  "1 kings": "1KI", "1kings": "1KI", "1ki": "1KI", "1 ki": "1KI",
  "2 kings": "2KI", "2kings": "2KI", "2ki": "2KI", "2 ki": "2KI",
  "1 chronicles": "1CH", "1chronicles": "1CH", "1chr": "1CH", "1 chr": "1CH",
  "2 chronicles": "2CH", "2chronicles": "2CH", "2chr": "2CH", "2 chr": "2CH",
  "ezra": "EZR", "ezr": "EZR",
  "nehemiah": "NEH", "neh": "NEH",
  "esther": "EST", "est": "EST",
  "job": "JOB",
  "psalms": "PSA", "psalm": "PSA", "psa": "PSA", "ps": "PSA",
  "proverbs": "PRO", "prov": "PRO", "pro": "PRO",
  "ecclesiastes": "ECC", "ecc": "ECC", "eccl": "ECC",
  "song of solomon": "SNG", "song": "SNG", "sos": "SNG", "sng": "SNG",
  "isaiah": "ISA", "isa": "ISA",
  "jeremiah": "JER", "jer": "JER",
  "lamentations": "LAM", "lam": "LAM",
  "ezekiel": "EZK", "ezk": "EZK", "eze": "EZK",
  "daniel": "DAN", "dan": "DAN",
  "hosea": "HOS", "hos": "HOS",
  "joel": "JOL", "jol": "JOL",
  "amos": "AMO", "amo": "AMO",
  "obadiah": "OBA", "oba": "OBA", "obad": "OBA",
  "jonah": "JON", "jon": "JON",
  "micah": "MIC", "mic": "MIC",
  "nahum": "NAM", "nam": "NAM", "nah": "NAM",
  "habakkuk": "HAB", "hab": "HAB",
  "zephaniah": "ZEP", "zep": "ZEP", "zeph": "ZEP",
  "haggai": "HAG", "hag": "HAG",
  "zechariah": "ZEC", "zec": "ZEC", "zech": "ZEC",
  "malachi": "MAL", "mal": "MAL",
  "matthew": "MAT", "mat": "MAT", "matt": "MAT",
  "mark": "MRK", "mrk": "MRK",
  "luke": "LUK", "luk": "LUK",
  "john": "JHN", "jhn": "JHN", "joh": "JHN",
  "acts": "ACT", "act": "ACT",
  "romans": "ROM", "rom": "ROM",
  "1 corinthians": "1CO", "1corinthians": "1CO", "1cor": "1CO", "1 cor": "1CO",
  "2 corinthians": "2CO", "2corinthians": "2CO", "2cor": "2CO", "2 cor": "2CO",
  "galatians": "GAL", "gal": "GAL",
  "ephesians": "EPH", "eph": "EPH",
  "philippians": "PHP", "php": "PHP", "phil": "PHP",
  "colossians": "COL", "col": "COL",
  "1 thessalonians": "1TH", "1thessalonians": "1TH", "1thess": "1TH", "1 thess": "1TH",
  "2 thessalonians": "2TH", "2thessalonians": "2TH", "2thess": "2TH", "2 thess": "2TH",
  "1 timothy": "1TI", "1timothy": "1TI", "1tim": "1TI", "1 tim": "1TI",
  "2 timothy": "2TI", "2timothy": "2TI", "2tim": "2TI", "2 tim": "2TI",
  "titus": "TIT", "tit": "TIT",
  "philemon": "PHM", "phm": "PHM", "phlm": "PHM",
  "hebrews": "HEB", "heb": "HEB",
  "james": "JAS", "jas": "JAS",
  "1 peter": "1PE", "1peter": "1PE", "1pet": "1PE", "1 pet": "1PE",
  "2 peter": "2PE", "2peter": "2PE", "2pet": "2PE", "2 pet": "2PE",
  "1 john": "1JN", "1john": "1JN", "1jn": "1JN",
  "2 john": "2JN", "2john": "2JN", "2jn": "2JN",
  "3 john": "3JN", "3john": "3JN", "3jn": "3JN",
  "jude": "JUD", "jud": "JUD",
  "revelation": "REV", "rev": "REV", "revelations": "REV",
};

const fallbackScriptures: Record<string, Record<string, string>> = {
  "JHN.3.16": {
    "KJV": "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    "WEB": "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.",
    "default": "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
  },
  "JHN.3.16-17": {
    "KJV": "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.",
    "default": "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life. For God did not send his Son into the world to condemn the world, but to save the world through him.",
  },
  "ROM.8.28": {
    "KJV": "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.",
    "default": "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.",
  },
  "PHP.4.13": {
    "KJV": "I can do all things through Christ which strengtheneth me.",
    "default": "I can do all things through Christ who strengthens me.",
  },
};

function jsonResponse(body: ScriptureResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function parseScriptureReference(reference: string): {
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

function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/¶/g, "");
}

function getBookCode(book: string): string | null {
  return bookMappings[book.toLowerCase().trim()] || null;
}

function getFallbackVerse(
  bookCode: string,
  chapter: number,
  verseStart: number,
  verseEnd: number | undefined,
  translation: string
): string | null {
  const key = verseEnd ? `${bookCode}.${chapter}.${verseStart}-${verseEnd}` : `${bookCode}.${chapter}.${verseStart}`;
  const verses = fallbackScriptures[key];
  if (!verses) return null;
  return verses[translation] || verses.WEB || verses.default || null;
}

async function loadBibleConfig(env: Env): Promise<BibleConfig> {
  const config = await env.BIBLE_CONFIG.get("bible-config", { type: "json" });
  if (!config || typeof config !== "object") {
    return {};
  }

  return config as BibleConfig;
}

function getTranslationBibleId(translation: string, config: BibleConfig): string | undefined {
  const builtIn: Record<string, string | undefined> = {
    KJV: "de4e12af7f28f599-02",
    ASV: "06125adad2d5898a-01",
    WEB: "9879dbb7cfe39e4d-04",
    BBE: "65eec8e0b60e656b-01",
    DARBY: "478f6a31d80ce67f-01",
    YLT: "f72b840c855f362c-04",
  };

  return builtIn[translation] || config.translationBibleIds?.[translation];
}

function extractVerses(text: string): Verse[] {
  const verses: Verse[] = [];
  const versePattern = /\[(\d+)\]\s*/g;
  const parts = text.split(versePattern);

  for (let i = 1; i < parts.length; i += 2) {
    const verseNum = parseInt(parts[i], 10);
    const verseText = (parts[i + 1] || "").trim();
    if (verseText) {
      verses.push({ text: verseText, verse: verseNum });
    }
  }

  return verses;
}

async function handleScriptureLookup(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json() as {
      reference?: string;
      translation?: string;
    };
    const { reference, translation = "KJV" } = body;
    const requestedTranslation = String(translation).toUpperCase();

    if (!reference || String(reference).trim().length < 3) {
      return jsonResponse({
        text: "",
        reference: String(reference || ""),
        translation: requestedTranslation,
        error: true,
        errorMessage: "Please enter a valid scripture reference (e.g., John 3:16)",
      }, 400);
    }

    const parsed = parseScriptureReference(String(reference));
    if (!parsed) {
      return jsonResponse({
        text: "",
        reference: String(reference),
        translation: requestedTranslation,
        error: true,
        errorMessage: `Invalid format: "${reference}". Use format like "John 3:16" or "Genesis 1:1-5"`,
      }, 400);
    }

    const bookCode = getBookCode(parsed.book);
    if (!bookCode) {
      return jsonResponse({
        text: "",
        reference: String(reference),
        translation: requestedTranslation,
        error: true,
        errorMessage: `Unknown book: "${parsed.book}". Please check the spelling.`,
      }, 400);
    }

    const formattedRef = parsed.verseEnd
      ? `${parsed.book} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`
      : `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;

    if (requestedTranslation === "ESV" && env.ESV_API_KEY) {
      try {
        const params = new URLSearchParams({
          q: formattedRef,
          "include-passage-references": "false",
          "include-verse-numbers": "true",
          "include-footnotes": "false",
          "include-headings": "false",
          "include-short-copyright": "false",
          "indent-paragraphs": "0",
          "indent-poetry": "false",
          "indent-declares": "0",
          "indent-psalm-doxology": "0",
        });

        const response = await fetch(`https://api.esv.org/v3/passage/text/?${params.toString()}`, {
          headers: {
            Authorization: `Token ${env.ESV_API_KEY}`,
          },
        });

        if (response.ok) {
          const data = await response.json<{
            passages?: string[];
            canonical?: string;
          }>();
          const text = (data.passages || []).join("\n\n").trim();

          return jsonResponse({
            text: text.replace(/\[(\d+)\]\s*/g, "").replace(/\s+/g, " ").trim(),
            verses: extractVerses(text),
            reference: data.canonical || formattedRef,
            translation: requestedTranslation,
          });
        }

        console.error("worker_scripture_lookup_esv_failed", {
          status: response.status,
          reference: formattedRef,
        });
      } catch (error) {
        console.error("worker_scripture_lookup_esv_exception", {
          reference: formattedRef,
          error: String(error),
        });
      }
    }

    const config = await loadBibleConfig(env);
    const bibleId = getTranslationBibleId(requestedTranslation, config);
    const bibleApiBaseUrl = config.apiBibleBaseUrl || "https://rest.api.bible/v1";

    if (env.BIBLE_API_KEY && bibleId) {
      const passageId = parsed.verseEnd
        ? `${bookCode}.${parsed.chapter}.${parsed.verseStart}-${bookCode}.${parsed.chapter}.${parsed.verseEnd}`
        : `${bookCode}.${parsed.chapter}.${parsed.verseStart}`;

      try {
        const response = await fetch(
          `${bibleApiBaseUrl}/bibles/${bibleId}/passages/${passageId}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true`,
          {
            headers: {
              Accept: "application/json",
              "api-key": env.BIBLE_API_KEY,
            },
          }
        );

        if (response.ok) {
          const data = await response.json<{
            data?: {
              content?: string;
              reference?: string;
            };
          }>();
          const passageText = cleanText(data.data?.content || "");
          if (passageText) {
            const verses = extractVerses(data.data?.content || "");
            return jsonResponse({
              text: passageText,
              reference: data.data?.reference || formattedRef,
              translation: requestedTranslation,
              verses: verses.length > 0 ? verses : undefined,
            });
          }
        } else {
          console.error("worker_scripture_lookup_api_bible_failed", {
            status: response.status,
            reference: formattedRef,
          });
        }
      } catch (error) {
        console.error("worker_scripture_lookup_api_bible_exception", {
          reference: formattedRef,
          error: String(error),
        });
      }
    }

    try {
      if (requestedTranslation !== "KJV" && requestedTranslation !== "WEB") {
        throw new Error("Skip KJV-only fallback for requested translation");
      }

      const response = await fetch(`https://bible-api.com/${encodeURIComponent(String(reference))}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json<{
          text?: string;
          reference?: string;
          verses?: Array<{ text: string; verse: number }>;
        }>();
        if (data.text) {
          const verses = data.verses?.map((verse) => ({
            text: cleanText(verse.text),
            verse: verse.verse,
          }));
          return jsonResponse({
            text: cleanText(data.text),
            reference: data.reference || formattedRef,
            translation: requestedTranslation,
            verses,
          });
        }
      }
    } catch (error) {
      console.error("worker_scripture_lookup_bible_api_fallback_exception", {
        reference: formattedRef,
        translation: requestedTranslation,
        error: String(error),
      });
    }

    try {
      if (requestedTranslation !== "KJV" && requestedTranslation !== "WEB") {
        throw new Error("Skip KJV fallback for requested translation");
      }

      const verseQuery = parsed.verseEnd ? `${parsed.verseStart}-${parsed.verseEnd}` : `${parsed.verseStart}`;
      const response = await fetch(`https://bolls.life/get-text/KJV/${bookCode}/${parsed.chapter}/${verseQuery}/`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json<Array<{ text: string; verse?: number }>>();
        if (Array.isArray(data) && data.length > 0) {
          const verses = data.map((verse, index) => ({
            text: cleanText(verse.text),
            verse: verse.verse ?? (parsed.verseStart + index),
          }));
          return jsonResponse({
            text: verses.map((verse) => verse.text).join(" "),
            reference: formattedRef,
            translation: requestedTranslation,
            verses,
          });
        }
      }
    } catch (error) {
      console.error("worker_scripture_lookup_bolls_fallback_exception", {
        reference: formattedRef,
        translation: requestedTranslation,
        error: String(error),
      });
    }

    const fallback = getFallbackVerse(
      bookCode,
      parsed.chapter,
      parsed.verseStart,
      parsed.verseEnd,
      requestedTranslation
    );

    if (fallback) {
      return jsonResponse({
        text: fallback,
        reference: formattedRef,
        translation: requestedTranslation,
      });
    }

    return jsonResponse({
      text: "",
      reference: formattedRef,
      translation: requestedTranslation,
      error: true,
      errorMessage: `Could not find "${reference}". The verse may not exist or there may be a network issue. Please check the chapter and verse numbers.`,
    }, 404);
  } catch (error) {
    console.error("worker_scripture_lookup_exception", { error: String(error) });
    return new Response(JSON.stringify({ error: "Unexpected server error." }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/scripture-lookup") {
      return handleScriptureLookup(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
