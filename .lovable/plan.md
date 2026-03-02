

# Replace Bible API with AO Lab Free Use Bible API

## Overview

Completely replace the existing Bible API integration (bible-api.com, bolls.life, hardcoded fallbacks) with the AO Lab Free Use Bible API at `https://bible.helloao.org`. This API requires no authentication, no API keys, and has no usage limits.

## How the New API Works

- Fetches an entire chapter as JSON: `https://bible.helloao.org/api/{translation_id}/{book}/{chapter}.json`
- Each verse in the response has a `number` and `content` array (mix of plain strings and objects with `{text, wordsOfJesus}`)
- Available translations listed at: `/api/available_translations.json`
- Books for a translation at: `/api/{translation_id}/books.json`
- No per-verse endpoint -- you fetch the chapter and extract the verses you need

## Files Changed

### 1. `src/lib/scripture-api.ts` -- Complete Rewrite

**Remove:**
- All old API call logic (bible-api.com, bolls.life endpoints)
- The `translationBibleIds` mapping (old API Bible IDs)
- The entire `fallbackScriptures` dictionary (~100 lines of hardcoded verses)
- The `getFallbackVerse()` function
- The `cleanText()` HTML cleaner (new API returns structured JSON, not HTML)

**Keep:**
- `ScriptureResult` interface (unchanged -- consumed by many files)
- `parseScriptureReference()` function (unchanged)
- `bookMappings` dictionary (the 3-letter codes like GEN, EXO, JHN match the new API exactly)
- `splitVerseText()` and `searchScripture()` functions (unchanged)

**Add:**
- `translationApiIds` mapping: maps user-facing codes to AO Lab IDs (e.g., `'KJV' -> 'eng_kjv'`, `'ASV' -> 'eng_asv'`, `'WEB' -> 'eng_web'`, `'BSB' -> 'eng_bsb'`)
- In-memory cache (`Map<string, chapter data>`) keyed by `{translation}/{book}/{chapter}` to avoid redundant fetches
- `extractVerseText()` helper: walks the verse `content` array, extracting plain strings and `{text}` objects, joining them into clean text
- Rewritten `lookupScripture()`:
  1. Parse reference, resolve book code
  2. Map translation to API ID (default `eng_kjv`)
  3. Check cache for the chapter
  4. If not cached, fetch `https://bible.helloao.org/api/{apiId}/{bookCode}/{chapter}.json`
  5. Cache the response
  6. Filter verses by number (verseStart to verseEnd)
  7. Extract text from each verse's content array
  8. Return `ScriptureResult` with combined text, formatted reference, translation name from response, and individual verses array

**Error handling:**
- Network failures: return user-friendly error "Unable to connect. Please check your internet connection."
- 404 responses: return "Verse not found for this reference and translation"
- Invalid book/chapter/verse: return specific error messages (same as current)

### 2. `src/pages/CreateSermon.tsx` -- Update Translation List

Replace the hardcoded `translations` array with entries that match available AO Lab translations. The list will include:

| Code | Name | AO Lab ID |
|------|------|-----------|
| KJV | King James Version | eng_kjv |
| BSB | Berean Standard Bible | eng_bsb |
| WEB | World English Bible | eng_web |
| ASV | American Standard Version | eng_asv |

Translations like NIV, ESV, NKJV, NASB, NLT, CSB, MSG, AMP are copyrighted and **not available** in this free API. They will be removed from the dropdown since they previously just fell back to WEB/KJV anyway and gave misleading results. The Spanish, French, German, and Portuguese translations will be updated to use actual AO Lab IDs if available, or removed if not.

### 3. `src/components/ScriptureLookup.tsx` -- No Changes Needed

This component calls `lookupScripture()` and `searchScripture()` from the API module. Since those function signatures remain identical, no changes are needed here.

### 4. `src/pages/SlideEditor.tsx` -- No Changes Needed

Only imports `splitVerseText` which is unchanged.

## Performance

- Chapter-level caching means looking up multiple verses from the same chapter (common in sermons) only makes one network request
- The existing 800ms debounce in `CreateSermon.tsx` is preserved
- No duplicate API calls thanks to the cache

## What Users Will Notice

- The translation dropdown will show fewer but **real** translations (no more fake "NIV" that actually returned WEB text)
- Verse lookups will work for any verse in the Bible, not just the ~20 hardcoded popular ones
- No API key needed, no auth, no rate limits
- Default translation changes from KJV to KJV (stays the same)

