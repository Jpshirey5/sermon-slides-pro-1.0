

# Fix ProPresenter Export: Correct Schema Field Numbers and Data Structure

## Root Causes Found

After comparing our protobuf schema against the official reverse-engineered `.proto` definitions from greyshirtguy/ProPresenter7-Proto, two clear problems explain both issues:

### Why slides are empty
The `Action.slide` field is assigned **field number 8** in our schema, but the real ProPresenter proto uses **field number 23**. ProPresenter reads field 23 for slide data, finds nothing there, and renders empty slides.

Additionally, the real structure wraps slides in a `PresentationSlide` message (with a `base_slide` field) rather than referencing `Slide` directly. Our schema skips this wrapper entirely.

### Why the title shows "Presentation"
The internal filename inside the ZIP is hardcoded to `Presentation.pro`. ProPresenter uses this filename as the presentation title in its library.

## Changes Required

### File 1: `src/services/pro7-schema.ts`

**Fix Action.slide field number**: Change from field 8 to field **23** (matching the real `oneof ActionTypeData`).

**Add Action.type field**: The real Action has a `type` field at position 9, which must be set to `11` (ACTION_TYPE_PRESENTATION_SLIDE) for slide actions.

**Add Action.isEnabled field**: The real Action has `isEnabled` at field 6.

**Add PresentationSlide wrapper**: The real structure is `Action.SlideType.presentation (field 2) -> PresentationSlide.base_slide (field 1) -> Slide`. Our schema jumps straight to `Slide`, skipping the `PresentationSlide` wrapper.

**Fix SlideType fields**: The real `SlideType` has `PresentationSlide presentation` at field **2** (not field 1), and does not have a direct `Slide` at field 2.

**Fix Color type**: The real proto uses `float` for color channels, not `double`.

**Fix URL fields**: The real proto uses `absolute_string` (field 1) and `relative_path` (field 2) as a `oneof Storage`, not `local_path`/`external_path`.

**Add Graphics.Path**: The real elements include a `path` field (field 8) with `closed` and `points`. A basic closed path is needed for ProPresenter to recognize the element shape.

### File 2: `src/services/proPresenterExport.ts`

**Fix internal filename**: Change `zip.file('Presentation.pro', buffer)` to use the sanitized presentation title as the filename.

**Set Action.type**: Set to `11` (ACTION_TYPE_PRESENTATION_SLIDE) on every action.

**Set Action.isEnabled**: Set to `true` on every action.

**Wrap slides in PresentationSlide**: Nest `Slide` inside `{ base_slide: slideMsg }` inside `SlideType.presentation`.

**Fix media URL format**: Use `relative_path` instead of `local_path` for bundled media references.

**Add element path**: Include a basic closed rectangular path on each element so ProPresenter recognizes the element shape.

## Technical Summary of Field Number Corrections

```text
CURRENT (broken)                    CORRECT (from real proto)
---------------------------         ---------------------------
Action.slide = field 8              Action.slide = field 23
Action (no type field)              Action.type = field 9, value 11
Action (no isEnabled)               Action.isEnabled = field 6
SlideType.presentation = field 1    SlideType.presentation = field 2
SlideType.slide = field 2           (removed - not in real proto)
Color fields = double               Color fields = float
URL.local_path = field 1            URL.absolute_string = field 1
URL.external_path = field 2         URL.relative_path = field 2
(no PresentationSlide)              PresentationSlide.base_slide = field 1
```

## Files NOT Changed

- `src/lib/export-pptx.ts` -- untouched
- `src/lib/export-propresenter.ts` -- untouched
- `src/components/ExportOptionsModal.tsx` -- untouched
- `src/pages/SlideEditor.tsx` -- untouched
- All UI, data models, shared helpers -- untouched

