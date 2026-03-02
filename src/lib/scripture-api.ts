// Scripture API using AO Lab Free Use Bible API (https://bible.helloao.org)
// No authentication required, no API keys, no rate limits

export interface ScriptureResult {
  text: string;
  reference: string;
  translation: string;
  error?: boolean;
  errorMessage?: string;
  verses?: { text: string; verse: number }[];
}

// Parse scripture reference (e.g., "John 3:16" or "Genesis 1:1-5")
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
    chapter: parseInt(match[2]),
    verseStart: parseInt(match[3]),
    verseEnd: match[4] ? parseInt(match[4]) : undefined,
  };
}

// Bible book name mappings for API compatibility
const bookMappings: Record<string, string> = {
  'genesis': 'GEN', 'gen': 'GEN',
  'exodus': 'EXO', 'exo': 'EXO', 'ex': 'EXO',
  'leviticus': 'LEV', 'lev': 'LEV',
  'numbers': 'NUM', 'num': 'NUM',
  'deuteronomy': 'DEU', 'deu': 'DEU', 'deut': 'DEU',
  'joshua': 'JOS', 'jos': 'JOS', 'josh': 'JOS',
  'judges': 'JDG', 'jdg': 'JDG', 'judg': 'JDG',
  'ruth': 'RUT', 'rut': 'RUT',
  '1 samuel': '1SA', '1samuel': '1SA', '1sam': '1SA', '1 sam': '1SA',
  '2 samuel': '2SA', '2samuel': '2SA', '2sam': '2SA', '2 sam': '2SA',
  '1 kings': '1KI', '1kings': '1KI', '1ki': '1KI', '1 ki': '1KI',
  '2 kings': '2KI', '2kings': '2KI', '2ki': '2KI', '2 ki': '2KI',
  '1 chronicles': '1CH', '1chronicles': '1CH', '1chr': '1CH', '1 chr': '1CH',
  '2 chronicles': '2CH', '2chronicles': '2CH', '2chr': '2CH', '2 chr': '2CH',
  'ezra': 'EZR', 'ezr': 'EZR',
  'nehemiah': 'NEH', 'neh': 'NEH',
  'esther': 'EST', 'est': 'EST',
  'job': 'JOB',
  'psalms': 'PSA', 'psalm': 'PSA', 'psa': 'PSA', 'ps': 'PSA',
  'proverbs': 'PRO', 'prov': 'PRO', 'pro': 'PRO',
  'ecclesiastes': 'ECC', 'ecc': 'ECC', 'eccl': 'ECC',
  'song of solomon': 'SNG', 'song': 'SNG', 'sos': 'SNG', 'sng': 'SNG',
  'isaiah': 'ISA', 'isa': 'ISA',
  'jeremiah': 'JER', 'jer': 'JER',
  'lamentations': 'LAM', 'lam': 'LAM',
  'ezekiel': 'EZK', 'ezk': 'EZK', 'eze': 'EZK',
  'daniel': 'DAN', 'dan': 'DAN',
  'hosea': 'HOS', 'hos': 'HOS',
  'joel': 'JOL', 'jol': 'JOL',
  'amos': 'AMO', 'amo': 'AMO',
  'obadiah': 'OBA', 'oba': 'OBA', 'obad': 'OBA',
  'jonah': 'JON', 'jon': 'JON',
  'micah': 'MIC', 'mic': 'MIC',
  'nahum': 'NAM', 'nam': 'NAM', 'nah': 'NAM',
  'habakkuk': 'HAB', 'hab': 'HAB',
  'zephaniah': 'ZEP', 'zep': 'ZEP', 'zeph': 'ZEP',
  'haggai': 'HAG', 'hag': 'HAG',
  'zechariah': 'ZEC', 'zec': 'ZEC', 'zech': 'ZEC',
  'malachi': 'MAL', 'mal': 'MAL',
  'matthew': 'MAT', 'mat': 'MAT', 'matt': 'MAT',
  'mark': 'MRK', 'mrk': 'MRK',
  'luke': 'LUK', 'luk': 'LUK',
  'john': 'JHN', 'jhn': 'JHN', 'joh': 'JHN',
  'acts': 'ACT', 'act': 'ACT',
  'romans': 'ROM', 'rom': 'ROM',
  '1 corinthians': '1CO', '1corinthians': '1CO', '1cor': '1CO', '1 cor': '1CO',
  '2 corinthians': '2CO', '2corinthians': '2CO', '2cor': '2CO', '2 cor': '2CO',
  'galatians': 'GAL', 'gal': 'GAL',
  'ephesians': 'EPH', 'eph': 'EPH',
  'philippians': 'PHP', 'php': 'PHP', 'phil': 'PHP',
  'colossians': 'COL', 'col': 'COL',
  '1 thessalonians': '1TH', '1thessalonians': '1TH', '1thess': '1TH', '1 thess': '1TH',
  '2 thessalonians': '2TH', '2thessalonians': '2TH', '2thess': '2TH', '2 thess': '2TH',
  '1 timothy': '1TI', '1timothy': '1TI', '1tim': '1TI', '1 tim': '1TI',
  '2 timothy': '2TI', '2timothy': '2TI', '2tim': '2TI', '2 tim': '2TI',
  'titus': 'TIT', 'tit': 'TIT',
  'philemon': 'PHM', 'phm': 'PHM', 'phlm': 'PHM',
  'hebrews': 'HEB', 'heb': 'HEB',
  'james': 'JAS', 'jas': 'JAS',
  '1 peter': '1PE', '1peter': '1PE', '1pet': '1PE', '1 pet': '1PE',
  '2 peter': '2PE', '2peter': '2PE', '2pet': '2PE', '2 pet': '2PE',
  '1 john': '1JN', '1john': '1JN', '1jn': '1JN',
  '2 john': '2JN', '2john': '2JN', '2jn': '2JN',
  '3 john': '3JN', '3john': '3JN', '3jn': '3JN',
  'jude': 'JUD', 'jud': 'JUD',
  'revelation': 'REV', 'rev': 'REV', 'revelations': 'REV',
};

// Map user-facing translation codes to AO Lab API IDs
const translationApiIds: Record<string, string> = {
  'KJV': 'eng_kjv',
  'BSB': 'eng_bsb',
  'WEB': 'eng_web',
  'ASV': 'eng_asv',
};

function getBookCode(book: string): string | null {
  const normalized = book.toLowerCase().trim();
  return bookMappings[normalized] || null;
}

// In-memory chapter cache to avoid redundant fetches
const chapterCache = new Map<string, any>();

// Extract plain text from a verse's content array
// Content items can be plain strings or objects like { text: "...", wordsOfJesus: true }
function extractVerseText(content: any[]): string {
  return content
    .map((item: any) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.text) return item.text;
      return '';
    })
    .join(' ')
    .replace(/¶\s*/g, '') // Remove paragraph markers
    .replace(/\s+/g, ' ')
    .trim();
}

export async function lookupScripture(
  reference: string,
  translation: string = 'KJV'
): Promise<ScriptureResult | null> {
  if (!reference || reference.trim().length < 3) {
    return {
      text: '',
      reference,
      translation,
      error: true,
      errorMessage: 'Please enter a valid scripture reference (e.g., John 3:16)',
    };
  }

  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    return {
      text: '',
      reference,
      translation,
      error: true,
      errorMessage: `Invalid format: "${reference}". Use format like "John 3:16" or "Genesis 1:1-5"`,
    };
  }

  const bookCode = getBookCode(parsed.book);
  if (!bookCode) {
    return {
      text: '',
      reference,
      translation,
      error: true,
      errorMessage: `Unknown book: "${parsed.book}". Please check the spelling.`,
    };
  }

  const formattedRef = parsed.verseEnd
    ? `${parsed.book} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`
    : `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;

  const apiId = translationApiIds[translation] || translationApiIds['KJV'];
  const cacheKey = `${apiId}/${bookCode}/${parsed.chapter}`;

  // Check cache first
  let chapterData = chapterCache.get(cacheKey);

  if (!chapterData) {
    try {
      const url = `https://bible.helloao.org/api/${apiId}/${bookCode}/${parsed.chapter}.json`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            text: '',
            reference: formattedRef,
            translation,
            error: true,
            errorMessage: `Verse not found for this reference and translation`,
          };
        }
        throw new Error(`API returned ${response.status}`);
      }

      chapterData = await response.json();
      chapterCache.set(cacheKey, chapterData);
    } catch (error: any) {
      if (error?.message?.includes('404')) {
        return {
          text: '',
          reference: formattedRef,
          translation,
          error: true,
          errorMessage: `Verse not found for this reference and translation`,
        };
      }
      return {
        text: '',
        reference: formattedRef,
        translation,
        error: true,
        errorMessage: 'Unable to connect. Please check your internet connection.',
      };
    }
  }

  // Extract verses from chapter data
  const verseEnd = parsed.verseEnd ?? parsed.verseStart;
  const chapterContent = chapterData?.chapter?.content;

  if (!Array.isArray(chapterContent)) {
    return {
      text: '',
      reference: formattedRef,
      translation,
      error: true,
      errorMessage: `Verse not found for this reference and translation`,
    };
  }

  const matchedVerses = chapterContent.filter(
    (v: any) => v.type === 'verse' && v.number >= parsed.verseStart && v.number <= verseEnd
  );

  if (matchedVerses.length === 0) {
    return {
      text: '',
      reference: formattedRef,
      translation,
      error: true,
      errorMessage: `Could not find "${reference}". Please check the chapter and verse numbers.`,
    };
  }

  const verses = matchedVerses.map((v: any) => ({
    text: extractVerseText(v.content),
    verse: v.number,
  }));

  const text = verses.map((v: { text: string }) => v.text).join(' ');
  const translationName = chapterData?.translation?.name || translation;

  return {
    text,
    reference: formattedRef,
    translation: translationName,
    verses,
  };
}

// Split multi-verse text into individual verses
export function splitVerseText(
  text: string,
  reference: string
): { text: string; reference: string }[] {
  const parsed = parseScriptureReference(reference);
  if (!parsed || !parsed.verseEnd) {
    // Single verse or unparseable — return as-is
    return [{ text, reference }];
  }

  const { book, chapter, verseStart, verseEnd } = parsed;
  const totalVerses = verseEnd - verseStart + 1;

  // Strategy 1: Split by numbered verse markers like "16 ...", "17 ..."
  const numberPattern = new RegExp(
    `(?:^|\\s)(${Array.from({ length: totalVerses }, (_, i) => verseStart + i).join('|')})\\s`,
    'g'
  );
  const markers: { verse: number; pos: number }[] = [];
  let m: RegExpExecArray | null;
  const searchText = ' ' + text; // pad so first verse can match
  while ((m = numberPattern.exec(searchText)) !== null) {
    const verseNum = parseInt(m[1]);
    if (verseNum >= verseStart && verseNum <= verseEnd) {
      markers.push({ verse: verseNum, pos: m.index + m[0].indexOf(m[1]) - 1 }); // adjust for padding
    }
  }

  // If we found markers for most verses, use them
  if (markers.length >= totalVerses * 0.6) {
    // Deduplicate and sort
    const uniqueMarkers = markers
      .filter((m, i, arr) => i === 0 || m.verse !== arr[i - 1].verse)
      .sort((a, b) => a.pos - b.pos);

    const results: { text: string; reference: string }[] = [];
    for (let i = 0; i < uniqueMarkers.length; i++) {
      const start = uniqueMarkers[i].pos;
      const end = i + 1 < uniqueMarkers.length ? uniqueMarkers[i + 1].pos : text.length;
      const verseText = text.slice(start, end).replace(/^\d+\s*/, '').trim();
      if (verseText) {
        results.push({
          text: verseText,
          reference: `${book} ${chapter}:${uniqueMarkers[i].verse}`,
        });
      }
    }
    if (results.length > 0) return results;
  }

  // Strategy 2: Split by sentences and distribute evenly
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  if (sentences.length >= totalVerses) {
    const results: { text: string; reference: string }[] = [];
    const perVerse = Math.ceil(sentences.length / totalVerses);
    for (let i = 0; i < totalVerses; i++) {
      const chunk = sentences.slice(i * perVerse, (i + 1) * perVerse).join(' ').trim();
      if (chunk) {
        results.push({
          text: chunk,
          reference: `${book} ${chapter}:${verseStart + i}`,
        });
      }
    }
    if (results.length > 0) return results;
  }

  // Fallback: return as single block
  return [{ text, reference }];
}

// Search for scripture by keywords (simplified version)
export function searchScripture(query: string): string[] {
  const suggestions = [
    'John 3:16',
    'Romans 8:28',
    'Philippians 4:13',
    'Jeremiah 29:11',
    'Proverbs 3:5-6',
    'Isaiah 40:31',
    'Psalm 23:1-6',
    'Matthew 17:20',
    '1 John 4:18',
    'Galatians 5:22-23',
    'Hebrews 11:1',
    'James 1:2-4',
    '2 Timothy 1:7',
    'Joshua 1:9',
    'Ephesians 2:8-9',
    'Romans 12:2',
    'Matthew 28:19-20',
    'John 14:6',
    'Romans 10:9',
  ];

  const lowerQuery = query.toLowerCase();
  return suggestions.filter(s => s.toLowerCase().includes(lowerQuery));
}
