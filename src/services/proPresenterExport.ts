import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface SlideData {
  id: string;
  type: 'title' | 'point' | 'scripture' | 'blank';
  content: {
    title?: string;
    subtitle?: string;
    scripture?: string;
    reference?: string;
  };
  background: string;
  backgroundImage?: string;
  fontFamily: string;
  textColor: string;
}

export interface ExportValidationResult {
  isValid: boolean;
  errors: string[];
}

// ── UUID ──────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

// ── Text helpers ──────────────────────────────────────

function escapeRTF(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (char === '\\') result += '\\\\';
    else if (char === '{') result += '\\{';
    else if (char === '}') result += '\\}';
    else if (char === '\n') result += '\\par ';
    else if (code > 127) result += `\\u${code}?`;
    else result += char;
  }
  return result;
}

function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Color helpers ─────────────────────────────────────

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16),
    };
  }
  return {
    r: parseInt(cleanHex.substring(0, 2), 16) || 255,
    g: parseInt(cleanHex.substring(2, 4), 16) || 255,
    b: parseInt(cleanHex.substring(4, 6), 16) || 255,
  };
}

function parseBackgroundColor(bg: string): { r: number; g: number; b: number } {
  if (bg.startsWith('linear-gradient')) {
    const match = bg.match(/#([a-fA-F0-9]{6})/);
    if (match) return hexToRGB(`#${match[1]}`);
  }
  if (bg.startsWith('#')) return hexToRGB(bg);
  return { r: 92, g: 30, b: 43 };
}

// ── Base64 encoding helpers ───────────────────────────

function toBase64(str: string): string {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  } catch {
    return btoa(unescape(encodeURIComponent(str)));
  }
}

/**
 * Encode RTF for Pro6 format
 */
function encodeRTF(text: string, textColor: string = '#FFFFFF', fontSize: number = 96): string {
  const rgb = hexToRGB(textColor);
  const escapedText = text ? escapeRTF(text) : '';
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639\n{\\fonttbl\\f0\\fswiss\\fcharset0 Arial;}\n{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}\n\\pard\\tx560\\tx1120\\qc\\pardirnatural\\partightenfactor0\n\\f0\\fs${fontSize * 2}\\cf1 ${escapedText}}`;
  return toBase64(rtf);
}

/**
 * Encode plain text as Base64 for PlainText field
 */
function encodePlainTextBase64(text: string): string {
  return toBase64(text || '');
}

/**
 * Encode FlowDocument XML for Windows compatibility
 */
function encodeWinFlowData(text: string, textColor: string = '#FFFFFF', fontSize: number = 96): string {
  const rgb = hexToRGB(textColor);
  const hexColor = `#FF${rgb.r.toString(16).padStart(2, '0').toUpperCase()}${rgb.g.toString(16).padStart(2, '0').toUpperCase()}${rgb.b.toString(16).padStart(2, '0').toUpperCase()}`;
  const escapedText = escapeXML(text || '');
  const flowDoc = `<FlowDocument TextAlignment="Center" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"><Paragraph><Span Foreground="${hexColor}" FontSize="${fontSize}" FontFamily="Arial">${escapedText}</Span></Paragraph></FlowDocument>`;
  return toBase64(flowDoc);
}

/**
 * Encode RVFont XML for Windows font metadata
 */
function encodeWinFontData(fontSize: number = 96): string {
  const fontXml = `<RVFont xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.datacontract.org/2004/07/ProPresenter.Common"><Name>Arial</Name><Size>${fontSize}</Size><Bold>false</Bold><Italic>false</Italic><Underline>false</Underline></RVFont>`;
  return toBase64(fontXml);
}

// ── Slide text extraction ─────────────────────────────

function getSlideText(slide: SlideData): string {
  switch (slide.type) {
    case 'title':
      return [slide.content.title, slide.content.subtitle].filter(Boolean).join('\n');
    case 'point':
      return [slide.content.title, slide.content.subtitle].filter(Boolean).join('\n');
    case 'scripture':
      return [slide.content.scripture, slide.content.reference ? `— ${slide.content.reference}` : ''].filter(Boolean).join('\n');
    case 'blank':
      return '';
    default:
      return '';
  }
}

function getSlideLabel(slide: SlideData, index: number): string {
  if (slide.content.title) return slide.content.title;
  if (slide.content.reference) return slide.content.reference;
  return `Slide ${index + 1}`;
}

// ── File name / validation ────────────────────────────

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*&()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Presentation';
}

export function validateSlidesForExport(slides: SlideData[]): ExportValidationResult {
  const errors: string[] = [];
  if (!slides || slides.length === 0) {
    errors.push('No slides to export. Please add at least one slide.');
  }
  const slidesWithText = slides.filter((slide) => {
    const text = getSlideText(slide);
    return text && text.trim().length > 0;
  });
  if (slides.length > 0 && slidesWithText.length === 0) {
    errors.push('All slides are empty. Please add content to at least one slide.');
  }
  const ids = slides.map((s) => s.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('Duplicate slide IDs detected. This may cause import issues.');
  }
  return { isValid: errors.length === 0, errors };
}

// ── Image helpers ─────────────────────────────────────

function getImageExtension(url: string): string {
  if (url.startsWith('data:image/')) {
    const match = url.match(/data:image\/(\w+)/);
    if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  }
  const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0];
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

async function fetchImageAsBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith('data:')) {
      const response = await fetch(url);
      return await response.blob();
    }
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

// ── Pro6 XML generators ───────────────────────────────

function generateStrokeDictionary(): string {
  return `<dictionary rvXMLIvarName="stroke">
        <NSColor rvXMLDictionaryKey="RVShapeElementStrokeColorKey">0 0 0 1</NSColor>
        <NSNumber rvXMLDictionaryKey="RVShapeElementStrokeWidthKey" hint="double">0</NSNumber>
      </dictionary>`;
}

function generateTextElement(
  text: string,
  textColor: string,
  fontSize: number = 96
): string {
  const uuid = generateUUID();
  const rtfData = encodeRTF(text, textColor, fontSize);
  const plainText = encodePlainTextBase64(text);
  const winFlowData = encodeWinFlowData(text, textColor, fontSize);
  const winFontData = encodeWinFontData(fontSize);

  return `<RVTextElement displayDelay="0" displayName="TextElement" locked="false" persistent="false" typeID="0" fromTemplate="false" bezelRadius="0" drawingFill="false" drawingShadow="true" drawingStroke="false" fillColor="0 0 0 0" rotation="0" source="" adjustsHeightToFit="false" verticalAlignment="1" revealType="0" opacity="1" UUID="${uuid}">
      <RVRect3D rvXMLIvarName="position">{50 50 0 1820 980}</RVRect3D>
      <shadow rvXMLIvarName="shadow">0|0 0 0 0.5|{3, -3}</shadow>
      ${generateStrokeDictionary()}
      <NSString rvXMLIvarName="PlainText">${plainText}</NSString>
      <NSString rvXMLIvarName="RTFData">${rtfData}</NSString>
      <NSString rvXMLIvarName="WinFlowData">${winFlowData}</NSString>
      <NSString rvXMLIvarName="WinFontData">${winFontData}</NSString>
    </RVTextElement>`;
}

function generateImageElement(mediaFilename: string): string {
  const uuid = generateUUID();
  return `<RVImageElement displayDelay="0" displayName="Background" locked="false" persistent="false" typeID="0" fromTemplate="false" bezelRadius="0" drawingFill="false" drawingShadow="false" drawingStroke="false" fillColor="1 1 1 1" rotation="0" source="Media/${mediaFilename}" scaleBehavior="3" flippedHorizontally="false" flippedVertically="false" naturalSize="{1920, 1080}" opacity="1" manufactureName="" manufactureURL="" UUID="${uuid}">
      <RVRect3D rvXMLIvarName="position">{0 0 0 1920 1080}</RVRect3D>
      <shadow rvXMLIvarName="shadow">0|0 0 0 1|{5, -5}</shadow>
      ${generateStrokeDictionary()}
    </RVImageElement>`;
}

function generatePro6Document(
  presentationName: string,
  slides: SlideData[],
  mediaMap: Map<number, string>
): string {
  const presentationUUID = generateUUID();
  const groupUUID = generateUUID();
  const escapedName = escapeXML(presentationName);

  const slideElements = slides
    .map((slide, index) => {
      const slideUUID = generateUUID();
      const text = getSlideText(slide);
      const label = escapeXML(getSlideLabel(slide, index));
      const bgColor = parseBackgroundColor(slide.background);
      const bgR = (bgColor.r / 255).toFixed(6);
      const bgG = (bgColor.g / 255).toFixed(6);
      const bgB = (bgColor.b / 255).toFixed(6);

      const mediaFilename = mediaMap.get(index);
      const bgElement = mediaFilename ? generateImageElement(mediaFilename) : '';
      const textElement = generateTextElement(text, slide.textColor);

      return `    <RVDisplaySlide backgroundColor="${bgR} ${bgG} ${bgB} 1" enabled="true" highlightColor="0 0 0 0" hotKey="" label="${label}" notes="" UUID="${slideUUID}" drawingBackgroundColor="false" chordChartPath="">
      <array rvXMLIvarName="cues"/>
      <array rvXMLIvarName="displayElements">
        ${bgElement}${bgElement ? '\n        ' : ''}${textElement}
      </array>
    </RVDisplaySlide>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="600" docType="0" creatorCode="1349676880" lastDateUsed="${new Date().toISOString()}" usedCount="0" category="Presentation" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="false" notes="" artist="" author="" album="" CCLIDisplay="false" CCLIArtistCredits="" CCLISongTitle="${escapedName}" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" CCLIAuthor="" CCLICopyrightYear="" CCLISongNumber="" chordChartPath="" selectedArrangementID="" UUID="${presentationUUID}" os="1" buildNumber="6016">
  <RVTimeline timeOffset="0" duration="0" selectedMediaTrackIndex="-1" loop="false" rvXMLIvarName="timeline">
    <array rvXMLIvarName="timeCues"/>
    <array rvXMLIvarName="mediaTracks"/>
  </RVTimeline>
  <array rvXMLIvarName="bibleReference"/>
  <RVProTransitionObject transitionType="-1" transitionDuration="1" motionEnabled="false" motionDuration="0" motionSpeed="0" rvXMLIvarName="transitionObject"/>
  <array rvXMLIvarName="groups">
    <RVSlideGrouping name="${escapedName}" uuid="${groupUUID}" color="0 0 0 0">
      <array rvXMLIvarName="slides">
${slideElements}
      </array>
    </RVSlideGrouping>
  </array>
  <array rvXMLIvarName="arrangements"/>
</RVPresentationDocument>`;
}

function generateInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.renewedvision.propresenter.document</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>RVBundleFormatVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

function generateManifestPlist(presentationFileName: string, mediaFiles: string[]): string {
  let mediaEntries = '';
  mediaFiles.forEach((filename) => {
    mediaEntries += `    <string>Media/${filename}</string>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>RVPresentationDocument</key>
  <string>Documents/${presentationFileName}</string>
  <key>RVMediaFiles</key>
  <array>
${mediaEntries}  </array>
</dict>
</plist>`;
}

// ── Public export functions ───────────────────────────

export async function exportAsProBundle(
  slides: SlideData[],
  presentationTitle: string
): Promise<void> {
  const validation = validateSlidesForExport(slides);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(' '));
  }

  const safeTitle = sanitizeFileName(presentationTitle);
  const zip = new JSZip();

  // Collect media files
  const mediaMap = new Map<number, string>();
  const mediaFiles: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.backgroundImage) {
      const ext = getImageExtension(slide.backgroundImage);
      const filename = `bg_${String(i + 1).padStart(3, '0')}.${ext}`;
      const blob = await fetchImageAsBlob(slide.backgroundImage);
      if (blob) {
        zip.file(`Media/${filename}`, blob);
        mediaMap.set(i, filename);
        mediaFiles.push(filename);
      }
    }
  }

  // Generate and add files
  const presentationFileName = 'Presentation.pro';
  const pro6Content = generatePro6Document(safeTitle, slides, mediaMap);

  zip.file('Info.plist', generateInfoPlist());
  zip.file('Manifest.plist', generateManifestPlist(presentationFileName, mediaFiles));
  zip.file(`Documents/${presentationFileName}`, pro6Content);

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${safeTitle}.probundle`);
}

export function exportAsPlainText(
  slides: SlideData[],
  presentationTitle: string
): void {
  const lines: string[] = [
    `# ${presentationTitle}`,
    `Exported: ${new Date().toLocaleDateString()}`,
    '',
    '---',
    '',
  ];

  slides.forEach((slide, index) => {
    lines.push(`## Slide ${index + 1}`);
    const text = getSlideText(slide);
    if (text) {
      lines.push(text);
    } else {
      lines.push('(Blank slide)');
    }
    lines.push('');
  });

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const safeTitle = sanitizeFileName(presentationTitle);
  saveAs(blob, `${safeTitle}.txt`);
}
