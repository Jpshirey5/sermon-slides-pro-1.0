

# Fix Empty Slides in ProPresenter Export

## Root Cause

After comparing our protobuf schema against the official `.proto` files from greyshirtguy/ProPresenter7-Proto, I found several issues that explain why slides appear but have no content:

### 1. Type hierarchy conflict with PresentationSlide

`PresentationSlide` is added to BOTH `Action` (as a nested type) AND to `root`. In protobufjs, a type can only have one parent. When `root.add(PresentationSlide)` runs after `Action.add(PresentationSlide)`, it silently removes it from `Action`. This can cause `Action.SlideType`'s reference to `PresentationSlide` to fail during encoding.

### 2. Missing Graphics.Text.Attributes (font metadata)

The real proto defines `Graphics.Text.Attributes` at field 3, which contains critical font information (name, size, bold, italic). Without this, ProPresenter may not know how to render text even though RTF data is present.

### 3. Missing Graphics.Path.Shape

The real proto has a `Shape` sub-message on `Path` (field 3) that tells ProPresenter the element shape type (rectangle, ellipse, etc.). Without it, ProPresenter may not recognize the element geometry.

### 4. Missing ApplicationInfo

The real `Presentation` message has `ApplicationInfo` at field 1 which identifies the creating application, platform, and version. ProPresenter may require this to determine how to parse the document.

## Changes

### File 1: `src/services/pro7-schema.ts`

**Remove PresentationSlide from Action's nested types.** Keep it only at root level so there's no parent conflict. `Action.SlideType` will resolve `PresentationSlide` by walking up to root.

**Add Graphics.Text.Attributes** with Font sub-message:
- `Font` message with `name` (field 1), `size` (field 2), `bold` (field 8), `family` (field 9)
- `Attributes` message with `font` (field 1) and `paragraph_style` (field 6)
- `Paragraph` message with `alignment` (field 1) -- set to CENTER (2)
- Wire these into `Graphics.Text` at field 3

**Add Graphics.Path.Shape** message with `type` field (field 1), set to TYPE_RECTANGLE (1). Add as field 3 on `Graphics.Path`.

**Add ApplicationInfo** message with `platform` (field 1) and `version` (field 2) fields. Add to `Presentation` at field 1.

**Add Version** message with `major_version` (field 1) and `minor_version` (field 2).

### File 2: `src/services/proPresenterExport.ts`

**Populate text attributes** in `buildSlideMessage`: include font name, font size, and paragraph alignment when building the text element data.

**Set path shape** to TYPE_RECTANGLE (1) on all element paths.

**Set application_info** on the presentation message with platform and version numbers matching ProPresenter 7.

**Add debug logging**: Log the encoded buffer size and a decoded verification check so we can confirm the data is actually being serialized.

## Technical Details

### New message types to add to schema

```text
ApplicationInfo
  field 1: Platform platform (enum: UNDEFINED=0, MACOS=1, WINDOWS=2)
  field 2: Version version

Version
  field 1: uint32 major_version
  field 2: uint32 minor_version

Graphics.Text.Attributes
  field 1: Font font
  field 6: Paragraph paragraph_style

Graphics.Text.Attributes.Font
  field 1: string name
  field 2: double size
  field 8: bool bold
  field 9: string family

Graphics.Text.Attributes.Paragraph
  field 1: Alignment alignment (enum: LEFT=0, RIGHT=1, CENTER=2, JUSTIFIED=3)

Graphics.Path.Shape
  field 1: Type type (enum: UNKNOWN=0, RECTANGLE=1, ELLIPSE=2, ...)
```

### Data structure changes in export

```text
Graphics.Element.text:
  BEFORE: { rtf_data, vertical_alignment }
  AFTER:  { rtf_data, vertical_alignment, attributes: { font: { name, size }, paragraph_style: { alignment } } }

Graphics.Element.path:
  BEFORE: { closed, points }
  AFTER:  { closed, points, shape: { type: 1 } }

Presentation:
  BEFORE: { uuid, name, category, cue_groups, cues }
  AFTER:  { application_info: { platform: 1, version: { major_version: 7, minor_version: 16 } }, uuid, name, category, cue_groups, cues }
```

### Type hierarchy fix

```text
BEFORE:
  root
    +-- PresentationSlide  (moved here from Action, leaving Action without it)
  Action
    +-- SlideType (references PresentationSlide -- may fail)
    +-- (PresentationSlide was here but got moved)

AFTER:
  root
    +-- PresentationSlide
  Action
    +-- SlideType (references PresentationSlide -- resolves through root)
    (PresentationSlide NOT added here at all)
```

## Files NOT Changed

- `src/lib/export-pptx.ts` -- untouched
- `src/lib/export-propresenter.ts` -- untouched
- `src/components/ExportOptionsModal.tsx` -- untouched
- `src/pages/SlideEditor.tsx` -- untouched
- All UI, data models, shared helpers -- untouched

