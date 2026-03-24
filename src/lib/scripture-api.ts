// Scripture API using Bible.API.Bible (https://scripture.api.bible)
// Free tier with API key

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

// Translation to Bible ID mappings for API.Bible.
// Custom translations can be provided via env vars.
const translationBibleIds: Record<string, string | undefined> = {
  // Free English translations
  'KJV': 'de4e12af7f28f599-02',
  'ASV': '06125adad2d5898a-01',
  'WEB': '9879dbb7cfe39e4d-04',
  'BBE': '65eec8e0b60e656b-01',
  'DARBY': '478f6a31d80ce67f-01',
  'YLT': 'f72b840c855f362c-04',
  // New translations (set these in .env for your API.Bible app)
  'CSB': import.meta.env.VITE_BIBLE_ID_CSB,
  'NKJV': import.meta.env.VITE_BIBLE_ID_NKJV,
  'NIV': import.meta.env.VITE_BIBLE_ID_NIV,
  // ESV is handled separately via edge function — not listed here
};

function getBookCode(book: string): string | null {
  const normalized = book.toLowerCase().trim();
  return bookMappings[normalized] || null;
}

// Clean HTML tags from API response
function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s+|\s+$/g, '') // Trim
    .replace(/\[\d+\]/g, '') // Remove verse numbers in brackets
    .replace(/¶/g, ''); // Remove paragraph markers
}

// Comprehensive fallback scriptures for common verses
const fallbackScriptures: Record<string, Record<string, string>> = {
  'JHN.3.16': {
    'KJV': 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    'WEB': 'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.',
    'default': 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
  },
  'JHN.3.16-17': {
    'KJV': 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
    'default': 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life. For God did not send his Son into the world to condemn the world, but to save the world through him.',
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
  'PRO.3.5-6': {
    'KJV': 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.',
    'default': 'Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.',
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
  'PSA.23.1-6': {
    'KJV': 'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake. Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me. Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over. Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.',
    'default': 'The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul. He guides me along the right paths for his name\'s sake. Even though I walk through the darkest valley, I will fear no evil, for you are with me; your rod and your staff, they comfort me. You prepare a table before me in the presence of my enemies. You anoint my head with oil; my cup overflows. Surely your goodness and love will follow me all the days of my life, and I will dwell in the house of the LORD forever.',
  },
  'GAL.5.22': {
    'KJV': 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith,',
    'default': 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness,',
  },
  'GAL.5.22-23': {
    'KJV': 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law.',
    'default': 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control. Against such things there is no law.',
  },
  'HEB.11.1': {
    'KJV': 'Now faith is the substance of things hoped for, the evidence of things not seen.',
    'default': 'Now faith is confidence in what we hope for and assurance about what we do not see.',
  },
  'JAS.1.2-4': {
    'KJV': 'My brethren, count it all joy when ye fall into divers temptations; Knowing this, that the trying of your faith worketh patience. But let patience have her perfect work, that ye may be perfect and entire, wanting nothing.',
    'default': 'Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, because you know that the testing of your faith produces perseverance. Let perseverance finish its work so that you may be mature and complete, not lacking anything.',
  },
  '2TI.1.7': {
    'KJV': 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.',
    'default': 'For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.',
  },
  'JOS.1.9': {
    'KJV': 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
    'default': 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.',
  },
  'EPH.2.8-9': {
    'KJV': 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast.',
    'default': 'For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast.',
  },
  'ROM.12.2': {
    'KJV': 'And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.',
    'default': 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind. Then you will be able to test and approve what God\'s will is—his good, pleasing and perfect will.',
  },
  'MAT.28.19-20': {
    'KJV': 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you always, even unto the end of the world. Amen.',
    'default': 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you. And surely I am with you always, to the very end of the age.',
  },
  'JHN.14.6': {
    'KJV': 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.',
    'default': 'Jesus answered, "I am the way and the truth and the life. No one comes to the Father except through me."',
  },
  'ROM.10.9': {
    'KJV': 'That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.',
    'default': 'If you declare with your mouth, "Jesus is Lord," and believe in your heart that God raised him from the dead, you will be saved.',
  },
};

function getFallbackVerse(bookCode: string, chapter: number, verseStart: number, verseEnd: number | undefined, translation: string): string | null {
  const key = verseEnd 
    ? `${bookCode}.${chapter}.${verseStart}-${verseEnd}`
    : `${bookCode}.${chapter}.${verseStart}`;
  
  // Try exact match first
  let verses = fallbackScriptures[key];
  if (verses) {
    return verses[translation] || verses['WEB'] || verses['default'] || null;
  }
  
  // If looking for a single verse, try without range
  if (!verseEnd) {
    const singleKey = `${bookCode}.${chapter}.${verseStart}`;
    verses = fallbackScriptures[singleKey];
    if (verses) {
      return verses[translation] || verses['WEB'] || verses['default'] || null;
    }
  }
  
  return null;
}

export async function lookupScripture(
  reference: string,
  translation: string = 'KJV'
): Promise<ScriptureResult | null> {
  // Validate reference format early
  if (!reference || reference.trim().length < 3) {
    return {
      text: '',
      reference: reference,
      translation,
      error: true,
      errorMessage: 'Please enter a valid scripture reference (e.g., John 3:16)',
    };
  }

  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    return {
      text: '',
      reference: reference,
      translation,
      error: true,
      errorMessage: `Invalid format: "${reference}". Use format like "John 3:16" or "Genesis 1:1-5"`,
    };
  }

  const bookCode = getBookCode(parsed.book);
  if (!bookCode) {
    return {
      text: '',
      reference: reference,
      translation,
      error: true,
      errorMessage: `Unknown book: "${parsed.book}". Please check the spelling.`,
    };
  }

  // Format the reference nicely
  const formattedRef = parsed.verseEnd 
    ? `${parsed.book} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`
    : `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;
  const requestedTranslation = translation.toUpperCase();

  // ESV: route through Supabase Edge Function
  if (requestedTranslation === 'ESV') {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/esv-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ q: formattedRef }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          return {
            text: data.text,
            reference: data.canonical || formattedRef,
            translation: requestedTranslation,
            verses: data.verses,
          };
        }
      }
    } catch (error) {
      console.log('ESV API failed, trying fallback APIs...');
    }
  }

  // Try API.Bible (requires VITE_BIBLE_API_KEY for non-ESV translations)
  const bibleApiKey = import.meta.env.VITE_BIBLE_API_KEY;
  const bibleApiBaseUrl = import.meta.env.VITE_BIBLE_API_BASE_URL || 'https://rest.api.bible/v1';
  const bibleId = translationBibleIds[requestedTranslation];
  
  if (bibleApiKey && bibleId) {
    const verseId = parsed.verseEnd 
      ? `${bookCode}.${parsed.chapter}.${parsed.verseStart}-${bookCode}.${parsed.chapter}.${parsed.verseEnd}`
      : `${bookCode}.${parsed.chapter}.${parsed.verseStart}`;

    try {
      const response = await fetch(
        `${bibleApiBaseUrl}/bibles/${bibleId}/passages/${verseId}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'api-key': bibleApiKey,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const passageText = cleanText(data?.data?.content || '');
        if (passageText) {
          return {
            text: passageText,
            reference: data?.data?.reference || formattedRef,
            translation: requestedTranslation,
          };
        }
      }
    } catch (error) {
      console.log('API.Bible lookup failed, trying fallback APIs...');
    }
  }

  // Try fallback for common verses if endpoint data was unavailable
  const fallbackText = getFallbackVerse(bookCode, parsed.chapter, parsed.verseStart, parsed.verseEnd, requestedTranslation);
  if (fallbackText) {
    return {
      text: fallbackText,
      reference: formattedRef,
      translation: requestedTranslation,
    };
  }

  try {
    // bible-api.com is primarily KJV; avoid silent incorrect translation fallback
    // when a specific translation endpoint exists.
    if (requestedTranslation !== 'KJV' && requestedTranslation !== 'WEB') {
      throw new Error('Skip KJV-only fallback for requested translation');
    }

    // Generic fallback source
    const response = await fetch(
      `https://bible-api.com/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.text) {
        const verses = data.verses?.map((v: { text: string; verse: number }) => ({
          text: cleanText(v.text),
          verse: v.verse,
        }));
        return {
          text: cleanText(data.text),
          reference: data.reference || formattedRef,
          translation: requestedTranslation,
          verses,
        };
      }
    }
  } catch (error) {
    console.log('Primary fallback API failed, trying secondary...');
  }

  // Try bolls.life API as secondary fallback
  try {
    // Secondary fallback is KJV-backed; avoid incorrect translation substitution.
    if (requestedTranslation !== 'KJV' && requestedTranslation !== 'WEB') {
      throw new Error('Skip KJV fallback for requested translation');
    }

    const verseQuery = parsed.verseEnd 
      ? `${parsed.verseStart}-${parsed.verseEnd}`
      : `${parsed.verseStart}`;
    
    const response = await fetch(
      `https://bolls.life/get-text/KJV/${bookCode}/${parsed.chapter}/${verseQuery}/`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
        const verses = data.map((v: { text: string; verse: number }, i: number) => ({
          text: cleanText(v.text),
          verse: v.verse ?? (parsed.verseStart + i),
        }));
        const text = verses.map((v: { text: string }) => v.text).join(' ');
        return {
          text,
          reference: formattedRef,
          translation: requestedTranslation,
          verses,
        };
      }
    }
  } catch (error) {
    console.log('Secondary API failed...');
  }

  // Return error for verse not found
  return {
    text: '',
    reference: formattedRef,
    translation: requestedTranslation,
    error: true,
    errorMessage: `Could not find "${reference}". The verse may not exist or there may be a network issue. Please check the chapter and verse numbers.`,
  };
}

// Split multi-verse text into individual verses
// Returns an array of { text, reference } for each verse
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
