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
 * Generate a UUID v4
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
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\line ');
}

/**
 * Convert hex color to RGB values for RTF
 */
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

/**
 * Encode text as Base64-encoded RTF for ProPresenter
 */
function encodeRTF(text: string, textColor: string = '#FFFFFF'): string {
  const rgb = hexToRGB(textColor);
  const escapedText = escapeRTF(text);
  
  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fswiss Helvetica;}}
{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}
\\f0\\fs96\\cf1
${escapedText}
}`;
  
  return btoa(unescape(encodeURIComponent(rtf)));
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
 * Generate Pro6 XML document for ProPresenter
 */
function generatePro6XML(presentationName: string, slides: SlideData[]): string {
  const presentationUUID = generateUUID();
  const groupUUID = generateUUID();
  
  const slideElements = slides.map((slide, index) => {
    const slideUUID = generateUUID();
    const textElementUUID = generateUUID();
    const text = getSlideText(slide);
    const label = getSlideLabel(slide, index);
    const rtfData = encodeRTF(text, slide.textColor);
    const bgColor = parseBackgroundColor(slide.background);
    
    // Create background color attribute
    const bgColorAttr = `${bgColor.r / 255} ${bgColor.g / 255} ${bgColor.b / 255} 1`;
    
    return `    <RVDisplaySlide backgroundColor="${bgColorAttr}" enabled="1" highlightColor="0 0 0 0" hotKey="" label="${escapeXML(label)}" notes="" UUID="${slideUUID}">
      <cues containerClass="NSMutableArray"/>
      <displayElements containerClass="NSMutableArray">
        <RVTextElement UUID="${textElementUUID}" typeID="0" displayName="Text" locked="0" persistent="0" typeID="0" revealType="0" displayDelay="0" source="" bezelRadius="0" rotation="0" drawingFill="0" drawingShadow="1" drawingStroke="0" fillColor="0 0 0 0" strokeColor="0 0 0 0" strokeWidth="0" shadowColor="0 0 0 0.5" shadowBlurRadius="4" shadowAngle="315" shadowOffset="3" verticalAlignment="1" RTFData="${rtfData}">
          <_-RVRect3D-_position x="100" y="100" z="0" width="1720" height="880"/>
        </RVTextElement>
      </displayElements>
    </RVDisplaySlide>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE RVPresentationDocument>
<RVPresentationDocument height="1080" width="1920" versionNumber="600" docType="0" creatorCode="1349676880" lastDateUsed="" usedCount="0" category="Presentation" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="0" notes="" artist="" author="" album="" CCLIDisplay="0" CCLIArtistCredits="" CCLISongTitle="" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" chordChartPath="" selectedArrangementID="" UUID="${presentationUUID}">
  <timeline duration="0" loop="0" selectedMediaTrackIndex="0" timeOffset="0" rvXMLIvarName="timeline">
    <timeCues containerClass="NSMutableArray"/>
    <mediaTracks containerClass="NSMutableArray"/>
  </timeline>
  <bibleReference containerClass="NSMutableDictionary"/>
  <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="0" motionSpeed="0"/>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping name="Main" uuid="${groupUUID}" color="0 0 0 0">
      <slides containerClass="NSMutableArray">
${slideElements}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray"/>
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
 * A .probundle is a ZIP archive containing a .pro6 XML presentation file
 */
export async function exportAsProBundle(
  slides: SlideData[],
  presentationTitle: string
): Promise<void> {
  const zip = new JSZip();
  
  // Sanitize filename
  const safeTitle = presentationTitle.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Presentation';
  
  // Generate Pro6 XML
  const xmlContent = generatePro6XML(safeTitle, slides);
  
  // Add the .pro6 file to the ZIP root
  zip.file(`${safeTitle}.pro6`, xmlContent);
  
  // Create media folder for future media support
  zip.folder('media');
  
  // Add background images if any slides have them
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.backgroundImage) {
      try {
        const response = await fetch(slide.backgroundImage);
        if (response.ok) {
          const blob = await response.blob();
          const extension = slide.backgroundImage.split('.').pop()?.split('?')[0] || 'jpg';
          zip.file(`media/slide_${i}.${extension}`, blob);
        }
      } catch (error) {
        console.warn('Failed to add media for slide:', i, error);
      }
    }
  }
  
  // Generate the ZIP file
  const blob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  // Save as .probundle
  saveAs(blob, `${safeTitle}.probundle`);
}
