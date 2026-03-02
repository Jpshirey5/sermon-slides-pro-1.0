// Scripture API - uses bible-api.com (primary) and bolls.life (fallback)
// Ensures translation accuracy by passing user-selected translation to APIs

export interface ScriptureResult {
  text: string;
  reference: string;
  translation: string;
  error?: boolean;
  errorMessage?: string;
  verses?: { text: string; verse: number }[];
  /** When true, the returned text is from a substitute translation */
  substituted?: boolean;
  /** The translation actually used when substituted */
  actualTranslation?: string;
}

// ── Reference parsing ──────────────────────────────────────────────

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

// ── Book code mappings ─────────────────────────────────────────────

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

function getBookCode(book: string): string | null {
  const normalized = book.toLowerCase().trim();
  return bookMappings[normalized] || null;
}

// ── Translation availability maps ──────────────────────────────────

/** Translations available on bible-api.com (lowercase codes) */
const bibleApiTranslations: Record<string, string> = {
  'KJV': 'kjv',
  'WEB': 'web',
  'ASV': 'asv',
  'BBE': 'bbe',
  'DARBY': 'darby',
  'YLT': 'ylt',
};

/** Translations available on bolls.life */
const bollsLifeTranslations: Record<string, string> = {
  'KJV': 'KJV',
  'ASV': 'ASV',
  'WEB': 'WEB',
  'YLT': 'YLT',
  'BBE': 'BBE',
  'DARBY': 'DARBY',
};

/** Licensed translations not freely available from any API */
const licensedTranslations = new Set([
  'ESV', 'NIV', 'NKJV', 'NLT', 'NASB', 'CSB', 'MSG', 'AMP',
]);

function isTranslationAvailable(translation: string): boolean {
  return !licensedTranslations.has(translation);
}

// ── Text cleaning ──────────────────────────────────────────────────

function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/¶/g, '');
}

// ── Fallback scriptures (KJV only – labeled honestly) ──────────────

const fallbackScriptures: Record<string, string> = {
  'JHN.3.16': 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  'JHN.3.16-17': 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
  'MAT.17.20': 'And Jesus said unto them, Because of your unbelief: for verily I say unto you, If ye have faith as a grain of mustard seed, ye shall say unto this mountain, Remove hence to yonder place; and it shall remove; and nothing shall be impossible unto you.',
  'ROM.8.28': 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
  'PHP.4.13': 'I can do all things through Christ which strengtheneth me.',
  'JER.29.11': 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
  'PRO.3.5': 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.',
  'PRO.3.5-6': 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.',
  'ISA.40.31': 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
  '1JN.4.18': 'There is no fear in love; but perfect love casteth out fear: because fear hath torment. He that feareth is not made perfect in love.',
  'PSA.23.1': 'The LORD is my shepherd; I shall not want.',
  'PSA.23.1-6': 'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake. Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me. Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over. Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.',
  'GAL.5.22': 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith,',
  'GAL.5.22-23': 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law.',
  'HEB.11.1': 'Now faith is the substance of things hoped for, the evidence of things not seen.',
  'JAS.1.2-4': 'My brethren, count it all joy when ye fall into divers temptations; Knowing this, that the trying of your faith worketh patience. But let patience have her perfect work, that ye may be perfect and entire, wanting nothing.',
  '2TI.1.7': 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.',
  'JOS.1.9': 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
  'EPH.2.8-9': 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast.',
  'ROM.12.2': 'And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.',
  'MAT.28.19-20': 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you always, even unto the end of the world. Amen.',
  'JHN.14.6': 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.',
  'ROM.10.9': 'That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.',
};

function getFallbackVerse(bookCode: string, chapter: number, verseStart: number, verseEnd: number | undefined): string | null {
  const key = verseEnd
    ? `${bookCode}.${chapter}.${verseStart}-${verseEnd}`
    : `${bookCode}.${chapter}.${verseStart}`;
  return fallbackScriptures[key] || null;
}

// ── Main lookup function ───────────────────────────────────────────

export async function lookupScripture(
  reference: string,
  translation: string = 'KJV'
): Promise<ScriptureResult | null> {
  if (!reference || reference.trim().length < 3) {
    return {
      text: '', reference, translation,
      error: true,
      errorMessage: 'Please enter a valid scripture reference (e.g., John 3:16)',
    };
  }

  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    return {
      text: '', reference, translation,
      error: true,
      errorMessage: `Invalid format: "${reference}". Use format like "John 3:16" or "Genesis 1:1-5"`,
    };
  }

  const bookCode = getBookCode(parsed.book);
  if (!bookCode) {
    return {
      text: '', reference, translation,
      error: true,
      errorMessage: `Unknown book: "${parsed.book}". Please check the spelling.`,
    };
  }

  const formattedRef = parsed.verseEnd
    ? `${parsed.book} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`
    : `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;

  // Determine if the requested translation is available
  const translationUnavailable = licensedTranslations.has(translation);
  // The actual translation we'll try to fetch
  const effectiveTranslation = translationUnavailable ? 'KJV' : translation;

  // ── KJV-only hardcoded fallback (only used for KJV) ──
  if (effectiveTranslation === 'KJV') {
    const fallbackText = getFallbackVerse(bookCode, parsed.chapter, parsed.verseStart, parsed.verseEnd);
    if (fallbackText) {
      const result: ScriptureResult = {
        text: fallbackText,
        reference: formattedRef,
        translation: 'KJV',
      };
      if (translationUnavailable) {
        result.substituted = true;
        result.actualTranslation = 'KJV';
        result.translation = 'KJV';
        result.errorMessage = `The ${translation} translation is not available for auto-lookup. Text shown is from KJV. You can manually edit the verse text in the slide editor.`;
      }
      return result;
    }
  }

  // ── Try bible-api.com with the correct translation ──
  const bibleApiCode = bibleApiTranslations[effectiveTranslation];
  if (bibleApiCode) {
    try {
      const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${bibleApiCode}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          const verses = data.verses?.map((v: { text: string; verse: number }) => ({
            text: cleanText(v.text),
            verse: v.verse,
          }));
          const result: ScriptureResult = {
            text: cleanText(data.text),
            reference: data.reference || formattedRef,
            translation: effectiveTranslation, // Always use our known code, not API label
            verses,
          };
          if (translationUnavailable) {
            result.substituted = true;
            result.actualTranslation = effectiveTranslation;
            result.errorMessage = `The ${translation} translation is not available for auto-lookup. Text shown is from ${effectiveTranslation}. You can manually edit the verse text in the slide editor.`;
          }
          return result;
        }
      }
    } catch (error) {
      console.log('bible-api.com failed, trying fallback...');
    }
  }

  // ── Try bolls.life with the correct translation ──
  const bollsCode = bollsLifeTranslations[effectiveTranslation];
  if (bollsCode) {
    try {
      const verseQuery = parsed.verseEnd
        ? `${parsed.verseStart}-${parsed.verseEnd}`
        : `${parsed.verseStart}`;

      const response = await fetch(
        `https://bolls.life/get-text/${bollsCode}/${bookCode}/${parsed.chapter}/${verseQuery}/`,
        { method: 'GET', headers: { 'Accept': 'application/json' } },
      );

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const verses = data.map((v: { text: string; verse: number }, i: number) => ({
            text: cleanText(v.text),
            verse: v.verse ?? (parsed.verseStart + i),
          }));
          const text = verses.map((v: { text: string }) => v.text).join(' ');
          const result: ScriptureResult = {
            text,
            reference: formattedRef,
            translation: effectiveTranslation,
            verses,
          };
          if (translationUnavailable) {
            result.substituted = true;
            result.actualTranslation = effectiveTranslation;
            result.errorMessage = `The ${translation} translation is not available for auto-lookup. Text shown is from ${effectiveTranslation}. You can manually edit the verse text in the slide editor.`;
          }
          return result;
        }
      }
    } catch (error) {
      console.log('bolls.life failed...');
    }
  }

  // ── Nothing worked ──
  return {
    text: '',
    reference: formattedRef,
    translation,
    error: true,
    errorMessage: `Could not find "${reference}". The verse may not exist or there may be a network issue. Please check the chapter and verse numbers.`,
  };
}

// ── Verse splitting utility ────────────────────────────────────────

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

  // Strategy 1: Split by numbered verse markers
  const numberPattern = new RegExp(
    `(?:^|\\s)(${Array.from({ length: totalVerses }, (_, i) => verseStart + i).join('|')})\\s`,
    'g'
  );
  const markers: { verse: number; pos: number }[] = [];
  let m: RegExpExecArray | null;
  const searchText = ' ' + text;
  while ((m = numberPattern.exec(searchText)) !== null) {
    const verseNum = parseInt(m[1]);
    if (verseNum >= verseStart && verseNum <= verseEnd) {
      markers.push({ verse: verseNum, pos: m.index + m[0].indexOf(m[1]) - 1 });
    }
  }

  if (markers.length >= totalVerses * 0.6) {
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

  // Strategy 2: Split by sentences
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

  return [{ text, reference }];
}

// ── Search suggestions ─────────────────────────────────────────────

export function searchScripture(query: string): string[] {
  const suggestions = [
    'John 3:16', 'Romans 8:28', 'Philippians 4:13', 'Jeremiah 29:11',
    'Proverbs 3:5-6', 'Isaiah 40:31', 'Psalm 23:1-6', 'Matthew 17:20',
    '1 John 4:18', 'Galatians 5:22-23', 'Hebrews 11:1', 'James 1:2-4',
    '2 Timothy 1:7', 'Joshua 1:9', 'Ephesians 2:8-9', 'Romans 12:2',
    'Matthew 28:19-20', 'John 14:6', 'Romans 10:9',
  ];
  const lowerQuery = query.toLowerCase();
  return suggestions.filter(s => s.toLowerCase().includes(lowerQuery));
}
