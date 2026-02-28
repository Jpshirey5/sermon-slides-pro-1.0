
# Add "Add Verse" Option to Create Page

## Overview

Add a second button next to "Add Another Sermon Point" that lets users add a standalone verse slide. Verse-only items skip the title input and show only scripture reference fields with auto-lookup.

## Changes

### File: `src/pages/CreateSermon.tsx`

**1. Add a `type` field to `SermonPoint` interface**

Add `type: 'point' | 'verse'` to distinguish between sermon points and standalone verse slides.

Update default state to include `type: 'point'`.

**2. Add `addVerse()` function**

Similar to `addPoint()` but creates a point with `type: 'verse'`, empty title, and one empty scripture entry pre-added.

**3. Update the card rendering (lines 465-588)**

For `type === 'verse'` items:
- Show a "Verse" label instead of the point number
- Hide the title input field
- Show scripture fields directly (no expand/collapse needed -- always expanded)
- Keep the same scripture input, auto-lookup, and delete functionality

For `type === 'point'` items:
- Keep existing layout exactly as-is (title input + expandable supporting scriptures)

**4. Replace the single "Add Another Sermon Point" button (lines 591-597)**

Replace with two side-by-side buttons:
- "Add Sermon Point" (existing `addPoint()`)
- "Add Verse" (new `addVerse()`)

Both buttons use `variant="outline"` and sit in a flex row with equal width.

**5. Update submit validation (line 611)**

Currently requires at least one point with a title. Update to also accept verse-only items (points where `type === 'verse'` and at least one scripture has a reference).

**6. Update slide count calculation (lines 293-303)**

Count verse-type points: each scripture with text counts as a slide (no point-title slide).

### File: `src/pages/SlideEditor.tsx`

**7. Handle verse-type points in slide generation (lines 113-178)**

Currently, points without a title are skipped (line 115: `if (point.title)`). Add handling for `type === 'verse'` points:
- Skip creating a point-title slide
- Still generate scripture slides from the point's scriptures array
- Use the same verse-by-verse / full-verses logic already in place

This means changing the condition from `if (point.title)` to handle both cases: points with titles get a title slide + scripture slides, verse-type points get only scripture slides.
