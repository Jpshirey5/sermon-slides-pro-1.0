# Multi-Item Update Plan

## Summary of Changes

Seven changes across four files, all scoped to the specific areas requested.

---

## 1. Remove point numbers from generated slides

**File:** `src/pages/SlideEditor.tsx` (line 125)

Currently: `title: \`${pointNumber}. ${point.title}`Change to:`title: point.title`

Also remove the `pointNumber` variable (lines 114, 119) since it's no longer needed.

---

## 2. Remove "Add Scripture" button inside verse-type cards

**File:** `src/pages/CreateSermon.tsx` (lines 686-694)

Remove the "Add Scripture" `<Button>` inside the verse-type layout. Users will use the bottom "Add Verse" button to add additional verse entries instead.

---

## 3. Remove em dash from verse reference display

Three locations need updating:

**File:** `src/pages/SlideEditor.tsx`

- Preview mode (line 686): Change `— {currentSlide.content.reference}` to `{currentSlide.content.reference}`
- Edit mode (line 1003): Change placeholder from `"— Reference"` to `"Reference"`

**File:** `src/services/proPresenterExport.ts` (line 103)

- Change `\`— ${slide.content.reference}`to just`slide.content.reference` so ProPresenter export text doesn't include the dash

---

## 4. Fix ProPresenter export -- right-align scripture reference

**File:** `src/services/proPresenterExport.ts`

Currently, `getSlideText()` (line 103) combines scripture and reference into a single text block, and the text element uses center alignment for everything.

Changes:

- For scripture slides, create **two separate text elements**: one for the centered verse text, and one for the right-aligned reference at the bottom
- The verse text element: bounds at top area (50,50 to 1820x800), centered alignment (paragraph_style alignment = 2)
- The reference element: bounds at bottom-right area (50,850 to 1820x180), right alignment (paragraph_style alignment = 1), smaller font size (36pt vs 48pt)
- Update `buildSlideMessage()` to check `slide.type === 'scripture'` and create split elements

---

## 5. Add "Edit Form" button in editor header

**File:** `src/pages/SlideEditor.tsx`

Add a button in the header toolbar (near the Preview button, around line 761) that navigates back to the create form with the presentation data pre-loaded.

- Add `Pencil` (or `FileEdit`) icon import from lucide-react
- Button labeled "Edit" that navigates to `/create` or `/dashboard/create` (based on `isFromDashboard`) with presentation data passed via `location.state`
- Only shown when `id && id !== "new"` (i.e., when editing an existing presentation)

**File:** `src/pages/CreateSermon.tsx`

- Accept `location.state` containing presentation data to pre-populate the form
- On mount, if `location.state?.editData` exists, populate `title`, `points`, `globalTranslation`, and `verseBreakdown` from it
- The existing `handleSubmit` already saves and navigates to `/editor/:id`, so regeneration works naturally
- When editing, clear the saved editor slides for that presentation ID so slides are regenerated fresh

---

## 6. Change "Back" link in editor to go to dashboard instead of homepage

**File:** `src/pages/SlideEditor.tsx` (line 698)

Currently: `<Link to={isFromDashboard ? "/dashboard" : "/"}`
Change to: `<Link to="/dashboard"`

Always navigate to dashboard regardless of entry point, since the editor should return users to their workspace. Make sure that there are options for the none account model and subscription model.

---

## 7. Pro subscription check for export flow

**File:** `src/pages/SlideEditor.tsx`

- Import and use `useAuth` from `@/contexts/AuthContext`
- In `handleExportButtonClick()`, check `subscription.subscribed` from auth context
- If subscribed: skip payment modal, show export options directly
- If not subscribed: show payment prompt modal (existing behavior)
- Remove the localStorage-based `isExportUnlocked` check for pro users (keep it as fallback for guest per-sermon purchases)

Updated logic:

```text
if (subscription.subscribed) {
  // Pro user -- show export options immediately
  setShowExportModal(true);
} else if (localStorage export unlocked for this sermon) {
  // Guest who paid for this specific sermon
  setShowExportModal(true);
} else {
  // Show payment modal
  setShowPaymentModal(true);
}
```

---

## Files Modified


| File                                 | Changes                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/SlideEditor.tsx`          | Remove point numbers, remove dash from reference, back link to dashboard, add edit button, pro subscription export check |
| `src/pages/CreateSermon.tsx`         | Remove "Add Scripture" button in verse layout, accept edit data from location state                                      |
| `src/services/proPresenterExport.ts` | Remove dash from reference, split scripture slides into two text elements (centered verse + right-aligned reference)     |
