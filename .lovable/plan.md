

# Rewrite ProPresenter Export to Native Pro7 Protobuf Binary

## Problem

The `.pro` file uploaded confirms that ProPresenter 7 uses **Google Protocol Buffers (protobuf) binary encoding**, not XML. Our current export writes Pro6 XML into a `.pro` file, which is why ProPresenter imports the bundle but shows nothing -- it can't parse the XML as protobuf.

## Solution

Replace the XML generation with **native protobuf binary encoding** using the `protobufjs` library and the reverse-engineered Proto7 schema from `greyshirtguy/ProPresenter7-Proto`.

The `protobufjs` library supports dynamic schema definition via its reflection API, meaning we can define the message types in JavaScript code without needing `.proto` files at build time.

## How It Works

The `.pro` file is a serialized `rv.data.Presentation` protobuf message containing:

- Presentation metadata (UUID, name, category)
- Cue groups (slide groups with group UUIDs linked to cue UUIDs)
- Cues (one per slide, each containing an Action that holds a Slide)
- Each Slide contains Elements (text elements with RTF data, background media fills)

## What Changes

**File modified:** `src/services/proPresenterExport.ts` only

**New dependency:** `protobufjs` (pure JS, works in browser)

### 1. Add `protobufjs` dependency

Install `protobufjs` for encoding protobuf messages in the browser.

### 2. Define Pro7 protobuf schema in code

Using `protobufjs`'s reflection API (`protobuf.Type`, `protobuf.Field`), define the required message types:

- `Presentation` -- top-level document
- `Presentation.CueGroup` -- links a Group to cue UUIDs
- `Cue` -- contains actions (one per slide)
- `Action` -- contains a Slide
- `Slide` -- contains Elements
- `Slide.Element` -- wraps a `Graphics.Element`
- `Graphics.Element` -- has bounds, fill, text, opacity, etc.
- `Graphics.Text` -- holds RTF data bytes, vertical alignment, font attributes
- `Graphics.Fill` -- holds media reference for background images
- `Media` -- references background image with URL
- `UUID`, `Color`, `Graphics.Rect`, `Graphics.Point`, `Graphics.Size`
- `Group` -- slide group with name and color

### 3. Map slide data to protobuf messages

For each slide:
- Create a `Cue` with a unique UUID and name from the slide label
- Inside the Cue, create an `Action` of type `SLIDE` containing a `Slide`
- The `Slide` has a text `Element` with RTF-encoded content and a background color
- If the slide has a background image, add a `Graphics.Fill` with a `Media` reference pointing to the bundled image file
- Group all cues into a single `Presentation.CueGroup`

### 4. Encode and write binary

- Use `protobufjs`'s `.encode().finish()` to produce a `Uint8Array`
- Write this binary data as `Presentation.pro` in the ZIP bundle

### 5. Update bundle structure

The `.probundle` ZIP will contain:
- `Presentation.pro` -- protobuf binary (was XML before)
- `Media/` -- background images (unchanged)
- Remove `Info.plist` and `Manifest.plist` (not needed for Pro7 native format)

### 6. RTF text encoding

Keep the existing `encodeRTF` helper but output raw bytes instead of Base64, since protobuf stores `rtf_data` as a `bytes` field.

## What Does NOT Change

- `src/lib/export-pptx.ts` -- untouched
- `src/lib/export-propresenter.ts` -- untouched
- `src/components/ExportOptionsModal.tsx` -- untouched
- `src/pages/SlideEditor.tsx` -- untouched
- All UI components, data models, shared helpers -- untouched
- The `SlideData` interface -- untouched (read-only input)
- The `exportAsPlainText` function -- untouched
- The `validateSlidesForExport` and `sanitizeFileName` functions -- untouched

## Technical Details

### Protobuf schema mapping (field numbers from reverse-engineered proto)

```text
Presentation (top-level)
  field 2: UUID uuid
  field 3: string name
  field 6: string category = "Presentation"
  field 12: repeated CueGroup cue_groups
  field 13: repeated Cue cues

Presentation.CueGroup
  field 1: Group group
  field 2: repeated UUID cue_identifiers

Cue
  field 1: UUID uuid
  field 2: string name
  field 10: repeated Action actions
  field 12: bool isEnabled = true

Action (Slide action)
  field 1: UUID uuid
  field 8: Action.SlideType slide  (oneof)

Action.SlideType
  field 1: Presentation presentation
  field 2: Slide slide

Slide
  field 1: repeated Slide.Element elements
  field 4: bool draws_background_color
  field 5: Color background_color
  field 6: Graphics.Size size (1920x1080)
  field 7: UUID uuid

Slide.Element
  field 1: Graphics.Element element

Graphics.Element
  field 1: UUID uuid
  field 2: string name
  field 3: Graphics.Rect bounds
  field 5: double opacity = 1.0
  field 9: Graphics.Fill fill
  field 13: Graphics.Text text

Graphics.Text
  field 5: bytes rtf_data
  field 6: VerticalAlignment = MIDDLE (1)

Graphics.Fill
  field 3: Media media  (for background images)
  field 4: bool enable = true

Media
  field 1: UUID uuid
  field 2: URL url

Group
  field 1: UUID uuid
  field 2: string name
  field 3: Color color
```

### Bundle output structure

```text
SermonTitle.probundle (ZIP)
  +-- Presentation.pro      (protobuf binary)
  +-- Media/
       +-- bg_001.jpg
       +-- bg_002.jpg
```

