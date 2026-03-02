
# Fix Bible Translation Accuracy

## Problem

The scripture lookup function completely ignores the user's selected translation. All three code paths return wrong translations:

1. **bible-api.com**: Called without a translation parameter, so it always returns WEB (its default)
2. **bolls.life fallback**: Hardcoded to KJV in the URL
3. **Hardcoded fallback verses**: Only have KJV and generic "default" text

The result: users select ESV but get a mix of WEB and KJV text, labeled as ESV.

## Solution

**File:** `src/lib/scripture-api.ts`

### 1. Pass translation to bible-api.com

bible-api.com supports a `?translation=` query parameter with values like `kjv`, `web`, `asv`, `bbe`, `darby`, `ylt`. Update the fetch URL:

```
https://bible-api.com/{reference}?translation={translationCode}
```

Create a mapping from app translation codes to bible-api.com codes (e.g., `KJV` -> `kjv`, `WEB` -> `web`, `ASV` -> `asv`).

### 2. Pass translation to bolls.life fallback

bolls.life supports many translations. Update the hardcoded `KJV` in the URL to use the user's selected translation. Create a mapping for bolls.life translation codes (e.g., `ESV` -> `ESV`, `NIV` -> `NIV`, `KJV` -> `KJV`, `NKJV` -> `NKJV`).

### 3. Fix translation labeling

Currently the code returns `data.translation_name` from bible-api.com (which could be "World English Bible" even when user selected ESV). Instead, always use the user's selected translation code as the authoritative label, and only accept API text if the API actually supports that translation.

### 4. Add honest fallback handling

When a translation is not available from any API (e.g., The Message, Amplified), return an error telling the user that translation is not available online, rather than silently substituting a different translation's text.

### 5. Remove misleading translation ID mappings

Remove the fake fallback mappings (lines 113-120) like `'ESV': '9879dbb7cfe39e4d-04' // WEB as fallback`. These create the false impression that ESV is supported when it actually returns WEB text.

## Technical Detail

### bible-api.com supported translations
- `kjv`, `web`, `asv`, `bbe`, `darby`, `ylt` (free, no API key)

### bolls.life supported translations
- Supports many translations including KJV, ASV, WEB, YLT, and others
- URL format: `https://bolls.life/get-text/{TRANSLATION}/{book}/{chapter}/{verses}/`

### New translation availability map

```text
Translation | bible-api.com | bolls.life | Available?
KJV         | kjv           | KJV        | Yes
ASV         | asv           | ASV        | Yes
WEB         | web           | WEB        | Yes
BBE         | bbe           | BBE        | Yes
DARBY       | darby         | DARBY      | Yes
YLT         | ylt           | YLT        | Yes
ESV         | --            | --         | No (licensed)
NIV         | --            | --         | No (licensed)
NKJV        | --            | --         | No (licensed)
NLT         | --            | --         | No (licensed)
NASB        | --            | --         | No (licensed)
CSB         | --            | --         | No (licensed)
MSG         | --            | --         | No (licensed)
AMP         | --            | --         | No (licensed)
```

Licensed translations (ESV, NIV, NKJV, NLT, NASB, CSB, MSG, AMP) are not freely available from any public API. Rather than silently substituting WEB/KJV text, the app will:
- Show these translations in the dropdown with a note that they require manual entry
- When auto-lookup is attempted for an unavailable translation, return a clear message: "The [ESV] translation is not available for auto-lookup. Text has been fetched from [KJV] instead. You can manually edit the verse text in the slide editor if needed."
- Still fetch from KJV/WEB as a starting point, but **clearly label** what translation was actually returned so there is no confusion

### Updated `lookupScripture` flow

1. Check if the requested translation is available from bible-api.com -- if yes, fetch with `?translation=code`
2. If not available from bible-api.com, try bolls.life with the correct translation code
3. If the translation is not available from either API, fetch KJV as a base but return the result with a warning flag indicating the text is from a different translation
4. Always return the actual translation used, never mislabel

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/scripture-api.ts` | Fix API calls to pass translation, add translation availability map, add honest fallback with warning labels, remove misleading ID mappings |
