

# Plan: Add ESV Translation via ESV API

## Summary

Add real ESV Bible text lookup using the ESV API (api.esv.org), routed through a Supabase Edge Function to keep the API key secure. Clean up the translation dropdown to only show translations that actually work.

## Changes

### 1. Store the ESV API key as a Supabase secret
- Use the secrets tool to request and store `ESV_API_KEY`

### 2. Create new Edge Function `supabase/functions/esv-lookup/index.ts`
- Accepts `{ q: "John 3:16" }` in the request body
- Calls `https://api.esv.org/v3/passage/text/` with params:
  - `q` = the passage query
  - `include-passage-references=false`
  - `include-verse-numbers=true`
  - `include-footnotes=false`
  - `include-headings=false`
  - `include-short-copyright=false`
- Uses header `Authorization: Token ${ESV_API_KEY}`
- Returns the passage text and parsed verse data

### 3. Update `src/lib/scripture-api.ts`
- In `lookupScripture()`, when translation is `'ESV'`, call the `esv-lookup` edge function instead of bible-api.com
- Parse the ESV API response to extract verse-by-verse text (split on `[verse_number]` markers)
- Remove the ESV fallback mapping to WEB (`'ESV': '9879dbb7cfe39e4d-04'`)

### 4. Update translation list in `src/pages/CreateSermon.tsx`
- Remove translations that are just fallbacks to other versions (NIV, NKJV, NASB, NLT, CSB, MSG, AMP all map to KJV/WEB/ASV — they don't return the actual translation text)
- Keep only translations that genuinely work: **KJV, ESV, WEB, ASV**
- Also keep non-English ones if they work (RVR1960, LSG, LUT, ALMEIDA) — these use real Bible IDs in API.Bible

### 5. Remove fake mappings in `translationBibleIds`
- Remove lines 113-120 that map NIV/NKJV/NASB/NLT/CSB/MSG/AMP to fallback IDs

## Files

| File | Change |
|------|--------|
| `supabase/functions/esv-lookup/index.ts` | New edge function proxying ESV API |
| `src/lib/scripture-api.ts` | Route ESV lookups through edge function; remove fake translation mappings |
| `src/pages/CreateSermon.tsx` | Trim dropdown to only working translations |

