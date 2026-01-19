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

/**
 * Generate a UUID v4 (uppercase for ProPresenter compatibility)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16).toUpperCase();
  });
}

/**
 * Escape special characters for RTF
 */
function escapeRTF(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    
    if (char === '\\') result += '\\\\';
    else if (char === '{') result += '\\{';
    else if (char === '}') result += '\\}';
    else if (char === '\n') result += '\\par ';
    else if (code > 127) {
      result += `\\u${code}?`;
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Convert hex color to RGB values
 */
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

/**
 * Encode text as Base64-encoded RTF for ProPresenter
 */
function encodeRTF(text: string, textColor: string = '#FFFFFF', fontSize: number = 96): string {
  if (!text || text.trim() === '') {
    const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639\n{\\fonttbl\\f0\\fswiss\\fcharset0 Arial;}\n{\\colortbl;\\red255\\green255\\blue255;}\n\\pard\\tx560\\tx1120\\qc\\pardirnatural\\partightenfactor0\n\\f0\\fs96\\cf1 }`;
    return btoa(rtf);
  }
  
  const rgb = hexToRGB(textColor);
  const escapedText = escapeRTF(text);
  
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639
{\\fonttbl\\f0\\fswiss\\fcharset0 Arial;}
{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}
\\pard\\tx560\\tx1120\\qc\\pardirnatural\\partightenfactor0
\\f0\\fs${fontSize * 2}\\cf1 ${escapedText}}`;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(rtf);
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  } catch {
    return btoa(unescape(encodeURIComponent(rtf)));
  }
}

/**
 * Get slide text content based on slide type
 */
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

/**
 * Get slide label/title
 */
function getSlideLabel(slide: SlideData, index: number): string {
  if (slide.content.title) return slide.content.title;
  if (slide.content.reference) return slide.content.reference;
  return `Slide ${index + 1}`;
}

/**
 * Parse background color from gradient or solid color
 */
function parseBackgroundColor(bg: string): { r: number; g: number; b: number } {
  if (bg.startsWith('linear-gradient')) {
    const match = bg.match(/#([a-fA-F0-9]{6})/);
    if (match) {
      return hexToRGB(`#${match[1]}`);
    }
  }
  if (bg.startsWith('#')) {
    return hexToRGB(bg);
  }
  return { r: 92, g: 30, b: 43 };
}

/**
 * Sanitize filename for safe file system usage
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*&()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Presentation';
}

/**
 * Validate slides before export
 */
export function validateSlidesForExport(slides: SlideData[]): ExportValidationResult {
  const errors: string[] = [];
  
  if (!slides || slides.length === 0) {
    errors.push('No slides to export. Please add at least one slide.');
  }
  
  const slidesWithText = slides.filter(slide => {
    const text = getSlideText(slide);
    return text && text.trim().length > 0;
  });
  
  if (slides.length > 0 && slidesWithText.length === 0) {
    errors.push('All slides are empty. Please add content to at least one slide.');
  }
  
  const ids = slides.map(s => s.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('Duplicate slide IDs detected. This may cause import issues.');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get image extension from URL or data URL
 */
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

/**
 * Fetch image as blob
 */
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

/**
 * Generate Info.plist content
 */
function generateInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.renewedvision.propresenter7.document</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>RVBundleFormatVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

/**
 * Generate Manifest.plist content
 */
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

/**
 * Generate Pro7 presentation document
 */
function generatePro7Document(
  presentationName: string,
  slides: SlideData[],
  mediaMap: Map<number, string>
): string {
  const presentationUUID = generateUUID();
  const groupUUID = generateUUID();

  const slideElements = slides.map((slide, index) => {
    const slideUUID = generateUUID();
    const textElementUUID = generateUUID();
    const text = getSlideText(slide);
    const label = getSlideLabel(slide, index);
    const rtfData = encodeRTF(text, slide.textColor);
    const bgColor = parseBackgroundColor(slide.background);
    
    const bgR = (bgColor.r / 255).toFixed(6);
    const bgG = (bgColor.g / 255).toFixed(6);
    const bgB = (bgColor.b / 255).toFixed(6);
    
    let backgroundElement = '';
    const mediaFilename = mediaMap.get(index);
    if (mediaFilename) {
      const mediaElementUUID = generateUUID();
      backgroundElement = `
        <RVMediaElement UUID="${mediaElementUUID}" typeID="0" displayName="Background" locked="0" persistent="0" revealType="0" displayDelay="0" source="Media/${mediaFilename}" bezelRadius="0" rotation="0" drawingFill="0" drawingShadow="0" drawingStroke="0" fillColor="0 0 0 0" strokeColor="0 0 0 0" strokeWidth="0" shadowColor="0 0 0 0" shadowBlurRadius="0" shadowAngle="0" shadowOffset="0" scaleBehavior="3" flippedHorizontally="0" flippedVertically="0" naturalSize="{1920, 1080}" manufactureName="" manufactureURL="" manufactureID="">
          <_-RVRect3D-_position x="0" y="0" z="0" width="1920" height="1080"/>
        </RVMediaElement>`;
    }

    return `    <RVDisplaySlide backgroundColor="${bgR} ${bgG} ${bgB} 1" enabled="1" highlightColor="0 0 0 0" hotKey="" label="${escapeXML(label)}" notes="" UUID="${slideUUID}" drawingBackgroundColor="0" chordChartPath="" socialItemCount="1">
      <cues containerClass="NSMutableArray"></cues>
      <displayElements containerClass="NSMutableArray">${backgroundElement}
        <RVTextElement UUID="${textElementUUID}" typeID="0" displayName="TextElement" locked="0" persistent="0" revealType="0" displayDelay="0" source="" bezelRadius="0" rotation="0" drawingFill="0" drawingShadow="1" drawingStroke="0" fillColor="0 0 0 0" strokeColor="0 0 0 0" strokeWidth="0" shadowColor="0 0 0 0.5" shadowBlurRadius="4" shadowAngle="315" shadowOffset="3" verticalAlignment="1" RTFData="${rtfData}" fromTemplate="0">
          <_-RVRect3D-_position x="50" y="50" z="0" width="1820" height="980"/>
          <shadow containerClass="NSMutableDictionary"/>
          <stroke containerClass="NSMutableDictionary"/>
        </RVTextElement>
      </displayElements>
    </RVDisplaySlide>`;
  }).join('\n');

  const escapedName = escapeXML(presentationName);

  return `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="700" docType="0" creatorCode="1349676880" lastDateUsed="${new Date().toISOString()}" usedCount="0" category="Presentation" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="0" notes="" artist="" author="" album="" CCLIDisplay="0" CCLIArtistCredits="" CCLISongTitle="${escapedName}" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" chordChartPath="" selectedArrangementID="" UUID="${presentationUUID}">
  <timeline duration="0" loop="0" selectedMediaTrackIndex="0" timeOffset="0" rvXMLIvarName="timeline">
    <timeCues containerClass="NSMutableArray"></timeCues>
    <mediaTracks containerClass="NSMutableArray"></mediaTracks>
  </timeline>
  <bibleReference containerClass="NSMutableDictionary"></bibleReference>
  <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="0" motionSpeed="0"/>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping name="${escapedName}" uuid="${groupUUID}" color="0 0 0 0">
      <slides containerClass="NSMutableArray">
${slideElements}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray"></arrangements>
</RVPresentationDocument>`;
}

/**
 * Escape special characters for XML
 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export slides as a ProPresenter .probundle file
 * This is a ZIP archive with the .probundle extension
 */
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
  const presentationFileName = 'Presentation.pro7';
  const pro7Content = generatePro7Document(safeTitle, slides, mediaMap);
  
  zip.file('Info.plist', generateInfoPlist());
  zip.file('Manifest.plist', generateManifestPlist(presentationFileName, mediaFiles));
  zip.file(`Documents/${presentationFileName}`, pro7Content);

  // Generate and save the bundle
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${safeTitle}.probundle`);
}

/**
 * Export slides as plain text
 */
export function exportAsPlainText(
  slides: SlideData[],
  presentationTitle: string
): void {
  const lines: string[] = [
    `# ${presentationTitle}`,
    `Exported: ${new Date().toLocaleDateString()}`,
    '',
    '---',
    ''
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
