

# Fix ProPresenter Export -- Valid Pro6 XML Structure

## Problem

The current `generatePro7Document` function produces XML that does not match any valid ProPresenter format. ProPresenter 7 uses protobuf binary, not XML. The XML structure uses wrong container syntax, wrong attribute values, and missing required child elements. This is why the .probundle fails to import.

## Solution

Rewrite the XML generation in `src/services/proPresenterExport.ts` to produce valid **ProPresenter 6 XML** format, which ProPresenter 7 natively imports via its legacy support. The reference format comes from verified real `.pro6` files.

## Scope -- Only `src/services/proPresenterExport.ts`

No changes to any other file. PPTX export, UI, data models, shared helpers all remain untouched.

## Key Structural Fixes

### 1. Document Root Attributes

Current (broken):
```text
versionNumber="700" drawingBackgroundColor="0" CCLIDisplay="0"
```

Fixed (valid Pro6):
```text
versionNumber="600" os="1" buildNumber="6016"
drawingBackgroundColor="false" CCLIDisplay="false"
```

Also adds missing attributes: `CCLIAuthor`, `CCLICopyrightYear`, `CCLISongNumber`.

### 2. Container Elements

Current (broken):
```text
<groups containerClass="NSMutableArray">
<slides containerClass="NSMutableArray">
<cues containerClass="NSMutableArray">
<displayElements containerClass="NSMutableArray">
```

Fixed (valid Pro6):
```text
<array rvXMLIvarName="groups">
<array rvXMLIvarName="slides">
<array rvXMLIvarName="cues"/>
<array rvXMLIvarName="displayElements">
```

### 3. Timeline Element

Current (broken):
```text
<timeline duration="0" loop="0" ...>
  <timeCues containerClass="NSMutableArray"/>
  <mediaTracks containerClass="NSMutableArray"/>
</timeline>
```

Fixed (valid Pro6):
```text
<RVTimeline timeOffset="0" duration="0" selectedMediaTrackIndex="-1"
  loop="false" rvXMLIvarName="timeline">
  <array rvXMLIvarName="timeCues"/>
  <array rvXMLIvarName="mediaTracks"/>
</RVTimeline>
```

### 4. Text Element Structure

Current (broken) -- text stored as attribute:
```text
<RVTextElement RTFData="base64string" ...>
  <_-RVRect3D-_position x="50" y="50" z="0" width="1820" height="980"/>
  <shadow containerClass="NSMutableDictionary"/>
  <stroke containerClass="NSMutableDictionary"/>
</RVTextElement>
```

Fixed (valid Pro6) -- text stored as child NSString elements:
```text
<RVTextElement adjustsHeightToFit="false" verticalAlignment="1"
  revealType="0" opacity="1" ...>
  <RVRect3D rvXMLIvarName="position">{50 50 0 1820 980}</RVRect3D>
  <shadow rvXMLIvarName="shadow">0|0 0 0 1|{5, -5}</shadow>
  <dictionary rvXMLIvarName="stroke">
    <NSColor rvXMLDictionaryKey="RVShapeElementStrokeColorKey">...</NSColor>
    <NSNumber rvXMLDictionaryKey="RVShapeElementStrokeWidthKey" hint="double">0</NSNumber>
  </dictionary>
  <NSString rvXMLIvarName="PlainText">base64_plain_text</NSString>
  <NSString rvXMLIvarName="RTFData">base64_rtf</NSString>
  <NSString rvXMLIvarName="WinFlowData">base64_flow_doc</NSString>
  <NSString rvXMLIvarName="WinFontData">base64_font_data</NSString>
</RVTextElement>
```

### 5. Background Image Elements

Current (broken):
```text
<RVMediaElement source="Media/filename" ...>
  <_-RVRect3D-_position x="0" y="0" z="0" width="1920" height="1080"/>
</RVMediaElement>
```

Fixed (valid Pro6):
```text
<RVImageElement source="Media/filename" scaleBehavior="3"
  opacity="1" fillColor="1 1 1 1" ...>
  <RVRect3D rvXMLIvarName="position">{0 0 0 1920 1080}</RVRect3D>
  <shadow rvXMLIvarName="shadow">0|0 0 0 1|{5, -5}</shadow>
  <dictionary rvXMLIvarName="stroke">...</dictionary>
</RVImageElement>
```

### 6. Boolean Values

Current: uses `"0"` and `"1"` for booleans.
Fixed: uses `"false"` and `"true"` (Pro6 convention).

### 7. Internal Filename

Current: `Presentation.pro7`
Fixed: `Presentation.pro`

### 8. New Helper Functions

- `encodePlainTextBase64(text)` -- Base64 encodes plain text for `PlainText` field
- `encodeWinFlowData(text, textColor, fontSize)` -- Generates Base64-encoded FlowDocument XML for Windows compatibility
- `encodeWinFontData()` -- Generates Base64-encoded RVFont XML for Windows font metadata
- Updated `encodeRTF()` -- Generates RTF matching Pro6 Windows format (with `\prorft1\uc1\htmautsp\deff2` header)

### 9. Slide Display Attributes

Adds missing Pro6 attributes on `RVDisplaySlide`: `drawingBackgroundColor="false"`, removes `socialItemCount`.

## Files Changed

| File | What Changes |
|------|-------------|
| `src/services/proPresenterExport.ts` | Rewrite `generatePro7Document` (renamed to `generatePro6Document`), update `encodeRTF`, add `encodePlainTextBase64`/`encodeWinFlowData`/`encodeWinFontData` helpers, update `exportAsProBundle` to use `.pro` filename, update `Info.plist` and `Manifest.plist` |

## Files NOT Changed

- `src/lib/export-pptx.ts` -- untouched
- `src/lib/export-propresenter.ts` -- untouched (legacy)
- `src/components/ExportOptionsModal.tsx` -- untouched
- `src/pages/SlideEditor.tsx` -- untouched
- All UI, data models, shared helpers -- untouched

