// Scripture API using Bible API (api.bible)
// Free tier supports lookup by reference

export interface ScriptureResult {
  text: string;
  reference: string;
  translation: string;
}

// Parse scripture reference (e.g., "John 3:16" or "Genesis 1:1-5")
export function parseScriptureReference(reference: string): {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
} | null {
  // Match patterns like "John 3:16", "1 John 1:9", "Genesis 1:1-5"
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

// Translation to Bible ID mappings (using API.Bible IDs for free translations)
const translationBibleIds: Record<string, string> = {
  'KJV': 'de4e12af7f28f599-02', // King James Version
  'ASV': '06125adad2d5898a-01', // American Standard Version
  'WEB': '9879dbb7cfe39e4d-04', // World English Bible
  'BBE': '65eec8e0b60e656b-01', // Bible in Basic English
  'DARBY': '478f6a31d80ce67f-01', // Darby Translation
  'YLT': 'f72b840c855f362c-04', // Young's Literal Translation
};

// Fallback scripture texts for common verses (when API is unavailable)
const fallbackScriptures: Record<string, Record<string, string>> = {
  'JHN.3.16': {
    'KJV': 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    'default': 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
  },
  'MAT.17.20': {
    'KJV': 'And Jesus said unto them, Because of your unbelief: for verily I say unto you, If ye have faith as a grain of mustard seed, ye shall say unto this mountain, Remove hence to yonder place; and it shall remove; and nothing shall be impossible unto you.',
    'default': 'For truly I tell you, if you have faith the size of a mustard seed, you will say to this mountain, \'Move from here to there,\' and it will move. Nothing will be impossible for you.',
  },
  'ROM.8.28': {
    'KJV': 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
    'default': 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.',
  },
  'PHP.4.13': {
    'KJV': 'I can do all things through Christ which strengtheneth me.',
    'default': 'I can do all things through Christ who strengthens me.',
  },
  'JER.29.11': {
    'KJV': 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
    'default': 'For I know the plans I have for you," declares the LORD, "plans to prosper you and not to harm you, plans to give you hope and a future.',
  },
  'PRO.3.5': {
    'KJV': 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.',
    'default': 'Trust in the LORD with all your heart and lean not on your own understanding.',
  },
  'ISA.40.31': {
    'KJV': 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
    'default': 'But those who hope in the LORD will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.',
  },
  '1JN.4.18': {
    'KJV': 'There is no fear in love; but perfect love casteth out fear: because fear hath torment. He that feareth is not made perfect in love.',
    'default': 'There is no fear in love. But perfect love drives out fear, because fear has to do with punishment. The one who fears is not made perfect in love.',
  },
  'PSA.23.1': {
    'KJV': 'The LORD is my shepherd; I shall not want.',
    'default': 'The LORD is my shepherd, I lack nothing.',
  },
  'GAL.5.22': {
    'KJV': 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith,',
    'default': 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness,',
  },
};

function getBookCode(book: string): string | null {
  const normalized = book.toLowerCase().trim();
  return bookMappings[normalized] || null;
}

function getFallbackVerse(bookCode: string, chapter: number, verse: number, translation: string): string | null {
  const key = `${bookCode}.${chapter}.${verse}`;
  const verses = fallbackScriptures[key];
  if (!verses) return null;
  return verses[translation] || verses['default'] || null;
}

export async function lookupScripture(
  reference: string,
  translation: string = 'KJV'
): Promise<ScriptureResult | null> {
  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    return null;
  }

  const bookCode = getBookCode(parsed.book);
  if (!bookCode) {
    return null;
  }

  // First try fallback for common verses (faster, no API needed)
  const fallbackText = getFallbackVerse(bookCode, parsed.chapter, parsed.verseStart, translation);
  if (fallbackText && !parsed.verseEnd) {
    return {
      text: fallbackText,
      reference: `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`,
      translation,
    };
  }

  // Try API.Bible for supported translations
  const bibleId = translationBibleIds[translation];
  if (bibleId) {
    try {
      const verseId = parsed.verseEnd 
        ? `${bookCode}.${parsed.chapter}.${parsed.verseStart}-${bookCode}.${parsed.chapter}.${parsed.verseEnd}`
        : `${bookCode}.${parsed.chapter}.${parsed.verseStart}`;
      
      // Note: In production, this would use your API key stored in secrets
      // For now, we'll use the fallback system
      console.log(`Would fetch: ${verseId} from Bible ${bibleId}`);
    } catch (error) {
      console.error('Scripture API error:', error);
    }
  }

  // Return fallback if available
  if (fallbackText) {
    return {
      text: fallbackText,
      reference: `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`,
      translation,
    };
  }

  // Generate a placeholder for demo purposes
  return {
    text: `[Scripture text for ${reference} in ${translation}. Connect to Bible API for full functionality.]`,
    reference,
    translation,
  };
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
    'Ephesians 6:10-18',
  ];

  const lowerQuery = query.toLowerCase();
  return suggestions.filter(s => s.toLowerCase().includes(lowerQuery));
}
