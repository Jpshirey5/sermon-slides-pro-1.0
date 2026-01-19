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

// Generate UUID for ProPresenter
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

// Convert hex color to RGB values (0-255)
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

// Parse gradient to get primary color
function parseGradientColor(bg: string): string {
  if (bg.startsWith('linear-gradient')) {
    const match = bg.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
    if (match) return match[0];
  }
  if (bg.startsWith('#')) return bg;
  return '#000000';
}

// Encode text to RTF format (simple encoding for special characters)
function encodeRtfText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode > 127) {
      result += `\\u${charCode}?`;
    } else if (text[i] === '\\') {
      result += '\\\\';
    } else if (text[i] === '{') {
      result += '\\{';
    } else if (text[i] === '}') {
      result += '\\}';
    } else if (text[i] === '\n') {
      result += '\\line ';
    } else {
      result += text[i];
    }
  }
  return result;
}

// Encode RTF to Base64
function textToBase64(text: string): string {
  // Convert the text to bytes and then base64
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

// Create RTF string for slide text
function createRtfString(text: string, fontName: string, fontSize: number, textColor: string): string {
  const rgb = hexToRgb(textColor);
  // RTF font size is in half-points
  const rtfFontSize = fontSize * 2;
  
  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 ${fontName};}}
{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}
\\f0\\fs${rtfFontSize}\\cf1 ${encodeRtfText(text)}
}`;
  
  return rtf;
}

// Get slide text content
function getSlideText(slide: SlideData): string {
  switch (slide.type) {
    case 'title':
      let titleText = slide.content.title || '';
      if (slide.content.subtitle) {
        titleText += '\n' + slide.content.subtitle;
      }
      return titleText;
    case 'point':
      let pointText = slide.content.title || '';
      if (slide.content.subtitle) {
        pointText += '\n' + slide.content.subtitle;
      }
      return pointText;
    case 'scripture':
      let scriptureText = slide.content.scripture || '';
      if (slide.content.reference) {
        scriptureText += '\n— ' + slide.content.reference;
      }
      return scriptureText;
    case 'blank':
    default:
      return '';
  }
}

// Get slide label
function getSlideLabel(slide: SlideData, index: number): string {
  switch (slide.type) {
    case 'title':
      return slide.content.title || 'Title';
    case 'point':
      return slide.content.title || `Point ${index + 1}`;
    case 'scripture':
      return slide.content.reference || 'Scripture';
    case 'blank':
      return 'Blank';
    default:
      return `Slide ${index + 1}`;
  }
}

// Create Pro6 XML document
function createPro6Xml(slides: SlideData[], title: string): string {
  const presentationUuid = generateUUID();
  const groupUuid = generateUUID();
  const createdDate = new Date().toISOString();
  
  // Build slides XML
  const slidesXml = slides.map((slide, index) => {
    const slideUuid = generateUUID();
    const textElementUuid = generateUUID();
    const slideText = getSlideText(slide);
    const slideLabel = getSlideLabel(slide, index);
    const bgColor = parseGradientColor(slide.background);
    const rgb = hexToRgb(bgColor);
    
    
    // Create RTF data
    const fontSize = slide.type === 'title' ? 80 : slide.type === 'scripture' ? 48 : 64;
    const rtfString = createRtfString(slideText, slide.fontFamily || 'Arial', fontSize, slide.textColor);
    const rtfBase64 = textToBase64(rtfString);
    
    // Background color as 0-1 floats
    const bgR = (rgb.r / 255).toFixed(6);
    const bgG = (rgb.g / 255).toFixed(6);
    const bgB = (rgb.b / 255).toFixed(6);
    
    return `
    <RVDisplaySlide backgroundColor="${bgR} ${bgG} ${bgB} 1" enabled="1" highlightColor="0 0 0 0" hotKey="" label="${encodeRtfText(slideLabel)}" notes="" slideType="1" sort_index="${index}" UUID="${slideUuid}" drawingBackgroundColor="0" chordChartPath="" serialization-array-index="${index}">
      <cues containerClass="NSMutableArray"></cues>
      <displayElements containerClass="NSMutableArray">
        <RVTextElement displayDelay="0" displayName="Default" locked="0" persistent="0" typeID="0" fromTemplate="0" bezelRadius="0" drawingFill="0" drawingShadow="1" drawingStroke="0" fillColor="0 0 0 0" rotation="0" source="" adjustsHeightToFit="0" verticalAlignment="1" RTFData="${rtfBase64}" revealType="0" serialization-array-index="0" UUID="${textElementUuid}">
          <stroke containerClass="NSMutableDictionary">
            <NSColor serialization-native-value="0 0 0 1" serialization-dictionary-key="RVShapeElementStrokeColorKey"></NSColor>
            <NSNumber serialization-native-value="1" serialization-dictionary-key="RVShapeElementStrokeWidthKey"></NSNumber>
          </stroke>
          <_shadow containerClass="NSMutableDictionary">
            <NSNumber serialization-native-value="0" serialization-dictionary-key="RVShadowOffsetXKey"></NSNumber>
            <NSNumber serialization-native-value="0" serialization-dictionary-key="RVShadowOffsetYKey"></NSNumber>
            <NSNumber serialization-native-value="4" serialization-dictionary-key="RVShadowBlurRadiusKey"></NSNumber>
            <NSColor serialization-native-value="0 0 0 0.5" serialization-dictionary-key="RVShadowColorKey"></NSColor>
          </_shadow>
          <position containerClass="NSMutableDictionary">
            <NSNumber serialization-native-value="0" serialization-dictionary-key="x"></NSNumber>
            <NSNumber serialization-native-value="0" serialization-dictionary-key="y"></NSNumber>
            <NSNumber serialization-native-value="1920" serialization-dictionary-key="width"></NSNumber>
            <NSNumber serialization-native-value="1080" serialization-dictionary-key="height"></NSNumber>
          </position>
        </RVTextElement>
      </displayElements>
    </RVDisplaySlide>`;
  }).join('\n');
  
  // Full Pro6 XML structure
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="600" docType="0" creatorCode="1349676880" lastDateUsed="${createdDate}" usedCount="0" category="Sermon" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="0" notes="" artist="" author="" album="" CCLIDisplay="0" CCLIArtistCredits="" CCLISongTitle="${title}" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" chordChartPath="" os="2" buildNumber="16177" selectedArrangementID="${groupUuid}" UUID="${presentationUuid}">
  <timeline timeOffSet="0" selectedMediaTrackIndex="0" unitOfMeasure="60" duration="0" loop="0" containerClass="NSMutableDictionary">
    <timeCues containerClass="NSMutableArray"></timeCues>
    <mediaTracks containerClass="NSMutableArray"></mediaTracks>
  </timeline>
  <bibleReference containerClass="NSMutableDictionary"></bibleReference>
  <_groups containerClass="NSMutableArray">
    <RVSlideGrouping name="${title}" uuid="${groupUuid}" color="0.36078431 0.11764706 0.16862745 1" serialization-array-index="0">
      <slides containerClass="NSMutableArray">${slidesXml}
      </slides>
    </RVSlideGrouping>
  </_groups>
  <arrangements containerClass="NSMutableArray">
    <RVSongArrangement name="Master" uuid="${groupUuid}" color="0 0 0 0" serialization-array-index="0">
      <groupIDs containerClass="NSMutableArray">
        <NSMutableString serialization-native-value="${groupUuid}" serialization-array-index="0"></NSMutableString>
      </groupIDs>
    </RVSongArrangement>
  </arrangements>
</RVPresentationDocument>`;

  return xml;
}

/**
 * Export slides as a ProPresenter .probundle file
 * A .probundle is a ZIP archive containing a .pro6 XML file
 * ProPresenter 7 will import and auto-convert Pro6 format
 */
export async function exportAsProBundle(
  slides: SlideData[],
  presentationTitle: string
): Promise<void> {
  const zip = new JSZip();
  
  // Generate the Pro6 XML content
  const pro6Xml = createPro6Xml(slides, presentationTitle);
  
  // Sanitize filename
  const safeTitle = presentationTitle.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Presentation';
  
  // Add the .pro6 file to the ZIP root
  zip.file(`${safeTitle}.pro6`, pro6Xml);
  
  // Create media folder (empty for now, but structure is correct)
  zip.folder('media');
  
  // Generate the ZIP file
  const blob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  // Save as .probundle
  saveAs(blob, `${safeTitle}.probundle`);
}
