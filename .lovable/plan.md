

# Fix Verse-by-Verse Splitting

## The Problem

When a multi-verse passage like "John 3:1-12" is looked up, the bible-api.com API actually returns each verse individually in a `verses` array. But the current code ignores this array and only uses the combined `data.text` field. Later, `splitVerseText` tries to re-split that combined text using pattern matching, which fails because there are no verse number markers in the text.

## The Solution

Instead of trying to split text after the fact, store the individual verses from the API response at lookup time. Then when "Verse by Verse" is selected, the verses are already cleanly separated.

## Changes

### 1. Update `ScriptureResult` interface (`src/lib/scripture-api.ts`)

Add an optional `verses` array to the result type:

```
verses?: { text: string; verse: number }[]
```

### 2. Update `lookupScripture()` (`src/lib/scripture-api.ts`)

When the bible-api.com response includes a `verses` array, store it in the result:

```
verses: data.verses?.map(v => ({ text: cleanText(v.text), verse: v.verse }))
```

Also update the fallback scriptures: for multi-verse entries in the hardcoded `fallbackScriptures`, add pre-split verse arrays so they work offline too.

### 3. Update how scripture text is stored (`src/components/ScriptureLookup.tsx`)

Pass the `verses` array through the `onScriptureFound` callback so it gets saved with the presentation data. Update the callback signature to include optional verses data.

### 4. Update `CreateSermon.tsx` data model

When saving scripture data for each point, include the individual `verses` array alongside the existing `text` and `reference` fields.

### 5. Update slide generation (`src/pages/SlideEditor.tsx`)

In the "verse-by-verse" branch of `generateSlidesFromData`, instead of calling `splitVerseText()` on the combined text, use the stored `verses` array directly. Each entry already has clean text and a verse number, so creating individual slides is straightforward:

```
scripture.verses.forEach(verse => {
  // Create one slide per verse with reference like "John 3:16"
})
```

Fall back to `splitVerseText()` only if `verses` data isn't available (backward compatibility with old saved sermons).

## Files Modified

| File | What Changes |
|------|-------------|
| `src/lib/scripture-api.ts` | Add `verses` field to `ScriptureResult`, populate from API response |
| `src/components/ScriptureLookup.tsx` | Pass verses data through callback |
| `src/pages/CreateSermon.tsx` | Store verses array in scripture data |
| `src/pages/SlideEditor.tsx` | Use stored verses array for verse-by-verse slides |

## Result

When "Verse by Verse" is selected and a passage like "John 3:1-12" is used, each verse will reliably get its own slide with the correct reference, because the verses are separated at API fetch time rather than guessed later.

