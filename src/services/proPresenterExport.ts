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
      // Handle unicode characters
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
  // Handle 3-character hex
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
 * Uses the exact RTF format that ProPresenter expects
 */
function encodeRTF(text: string, textColor: string = '#FFFFFF', fontSize: number = 96): string {
  if (!text || text.trim() === '') {
    // Return minimal valid RTF for empty text
    const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639\n{\\fonttbl\\f0\\fswiss\\fcharset0 Arial;}\n{\\colortbl;\\red255\\green255\\blue255;}\n\\pard\\tx560\\tx1120\\qc\\pardirnatural\\partightenfactor0\n\\f0\\fs96\\cf1 }`;
    return btoa(rtf);
  }
  
  const rgb = hexToRGB(textColor);
  const escapedText = escapeRTF(text);
  
  // ProPresenter-compatible RTF format with proper headers
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639
{\\fonttbl\\f0\\fswiss\\fcharset0 Arial;}
{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}
\\pard\\tx560\\tx1120\\qc\\pardirnatural\\partightenfactor0
\\f0\\fs${fontSize * 2}\\cf1 ${escapedText}}`;
  
  // Use TextEncoder for proper UTF-8 handling, then base64 encode
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(rtf);
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  } catch {
    // Fallback for older browsers
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
  return { r: 92, g: 30, b: 43 }; // Default dark red
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
 * Sanitize filename for safe file system usage
 * Keeps spaces and common characters, removes only filesystem-unsafe ones
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*&()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Presentation';
}

/**
 * Generate Pro6 XML document for ProPresenter 7 import
 * This format is designed to be "upgraded" by ProPresenter 7 during import
 */
function generatePro6XML(presentationName: string, slides: SlideData[]): string {
  const presentationUUID = generateUUID();
  const groupUUID = generateUUID();
  const safeName = escapeXML(presentationName);
  
  const slideElements = slides.map((slide, index) => {
    const slideUUID = generateUUID();
    const textElementUUID = generateUUID();
    const text = getSlideText(slide);
    const label = escapeXML(getSlideLabel(slide, index));
    const rtfData = encodeRTF(text, slide.textColor);
    const bgColor = parseBackgroundColor(slide.background);
    
    // ProPresenter uses 0-1 range for colors
    const bgColorAttr = `${(bgColor.r / 255).toFixed(6)} ${(bgColor.g / 255).toFixed(6)} ${(bgColor.b / 255).toFixed(6)} 1`;
    
    return `    <RVDisplaySlide backgroundColor="${bgColorAttr}" enabled="1" highlightColor="0 0 0 0" hotKey="" label="${label}" notes="" UUID="${slideUUID}" drawingBackgroundColor="0" chordChartPath="" socialItemCount="1">
      <cues containerClass="NSMutableArray"></cues>
      <displayElements containerClass="NSMutableArray">
        <RVTextElement UUID="${textElementUUID}" typeID="0" displayName="TextElement" locked="0" persistent="0" revealType="0" displayDelay="0" source="" bezelRadius="0" rotation="0" drawingFill="0" drawingShadow="1" drawingStroke="0" fillColor="0 0 0 0" strokeColor="0 0 0 0" strokeWidth="0" shadowColor="0 0 0 0.5" shadowBlurRadius="4" shadowAngle="315" shadowOffset="3" verticalAlignment="1" RTFData="${rtfData}" fromTemplate="0">
          <_-RVRect3D-_position x="50" y="50" z="0" width="1820" height="980"/>
          <shadow containerClass="NSMutableDictionary"/>
          <stroke containerClass="NSMutableDictionary"/>
        </RVTextElement>
      </displayElements>
    </RVDisplaySlide>`;
  }).join('\n');

  // Full Pro6 XML document with all required attributes for Pro7 upgrade
  return `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="600" docType="0" creatorCode="1349676880" lastDateUsed="${new Date().toISOString()}" usedCount="0" category="Presentation" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="0" notes="" artist="" author="" album="" CCLIDisplay="0" CCLIArtistCredits="" CCLISongTitle="${safeName}" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" chordChartPath="" selectedArrangementID="" UUID="${presentationUUID}">
  <timeline duration="0" loop="0" selectedMediaTrackIndex="0" timeOffset="0" rvXMLIvarName="timeline">
    <timeCues containerClass="NSMutableArray"></timeCues>
    <mediaTracks containerClass="NSMutableArray"></mediaTracks>
  </timeline>
  <bibleReference containerClass="NSMutableDictionary"></bibleReference>
  <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="0" motionSpeed="0"/>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping name="${safeName}" uuid="${groupUUID}" color="0 0 0 0">
      <slides containerClass="NSMutableArray">
${slideElements}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray"></arrangements>
</RVPresentationDocument>`;
}

/**
 * Export slides as a ProPresenter .probundle file
 * A .probundle is a ZIP archive containing a .pro6 XML presentation file
 */
export async function exportAsProBundle(
  slides: SlideData[],
  presentationTitle: string
): Promise<void> {
  const zip = new JSZip();
  
  // Sanitize filename - ProPresenter is picky about filenames
  const safeTitle = sanitizeFileName(presentationTitle);
  
  // Generate Pro6 XML
  const xmlContent = generatePro6XML(safeTitle, slides);
  
  // Add the .pro6 file to the ZIP root (MUST be at root, not in a folder)
  zip.file(`${safeTitle}.pro6`, xmlContent, { binary: false });
  
  // Add background images if any slides have them
  const hasMedia = slides.some(s => s.backgroundImage);
  if (hasMedia) {
    const mediaFolder = zip.folder('media');
    if (mediaFolder) {
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.backgroundImage) {
          try {
            const response = await fetch(slide.backgroundImage);
            if (response.ok) {
              const blob = await response.blob();
              const extension = slide.backgroundImage.split('.').pop()?.split('?')[0] || 'jpg';
              mediaFolder.file(`slide_${i}_bg.${extension}`, blob);
            }
          } catch (error) {
            console.warn('Failed to add media for slide:', i, error);
          }
        }
      }
    }
  }
  
  // Generate the ZIP file with standard compression
  const blob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  
  // Save as .probundle
  saveAs(blob, `${safeTitle}.probundle`);
}

/**
 * Export slides as plain text (for copying to other applications)
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
