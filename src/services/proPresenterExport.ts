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

// Escape special XML characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generate RTF string and Base64 encode it (as per ProPresenter requirements)
function generateRTF(text: string, fontName: string = 'Helvetica', fontSize: number = 60, textColor: string = '#FFFFFF'): string {
  const rgb = hexToRgb(textColor);
  // RTF font size is in half-points
  const rtfFontSize = fontSize * 2;
  
  // Escape RTF special characters in text
  let escapedText = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode > 127) {
      escapedText += `\\u${charCode}?`;
    } else if (text[i] === '\\') {
      escapedText += '\\\\';
    } else if (text[i] === '{') {
      escapedText += '\\{';
    } else if (text[i] === '}') {
      escapedText += '\\}';
    } else if (text[i] === '\n') {
      escapedText += '\\line ';
    } else {
      escapedText += text[i];
    }
  }
  
  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fswiss ${fontName};}}
{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}
\\f0\\fs${rtfFontSize}\\cf1 ${escapedText}
}`;
  
  return btoa(rtf); // Base64 encode for XML safety
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
  const safeTitle = escapeXml(title);
  
  // Build slides XML - each slide as RVDisplaySlide with RVTextElement
  const slidesXml = slides.map((slide, index) => {
    const slideUuid = generateUUID();
    const textElementUuid = generateUUID();
    const slideText = getSlideText(slide);
    const slideLabel = escapeXml(getSlideLabel(slide, index));
    const bgColor = parseGradientColor(slide.background);
    const rgb = hexToRgb(bgColor);
    
    // Determine font size based on slide type
    const fontSize = slide.type === 'title' ? 80 : slide.type === 'scripture' ? 48 : 64;
    
    // Generate RTF with Base64 encoding
    const rtfBase64 = generateRTF(slideText, slide.fontFamily || 'Helvetica', fontSize, slide.textColor);
    
    // Background color as 0-1 floats
    const bgR = (rgb.r / 255).toFixed(6);
    const bgG = (rgb.g / 255).toFixed(6);
    const bgB = (rgb.b / 255).toFixed(6);
    
    return `
        <RVDisplaySlide UUID="${slideUuid}" label="${slideLabel}" backgroundColor="${bgR} ${bgG} ${bgB} 1" enabled="1" highlightColor="0 0 0 0" hotKey="" notes="" slideType="1" sort_index="${index}" drawingBackgroundColor="0" chordChartPath="" serialization-array-index="${index}">
          <cues containerClass="NSMutableArray"></cues>
          <displayElements containerClass="NSMutableArray">
            <RVTextElement displayName="Text" RTFData="${rtfBase64}" displayDelay="0" locked="0" persistent="0" typeID="0" fromTemplate="0" bezelRadius="0" drawingFill="0" drawingShadow="1" drawingStroke="0" fillColor="0 0 0 0" rotation="0" source="" adjustsHeightToFit="0" verticalAlignment="1" revealType="0" serialization-array-index="0" UUID="${textElementUuid}">
              <_-RVRect3D-_position x="100" y="100" z="0" width="1720" height="880"/>
              <stroke containerClass="NSMutableDictionary">
                <NSColor serialization-native-value="0 0 0 1" serialization-dictionary-key="RVShapeElementStrokeColorKey"/>
                <NSNumber serialization-native-value="1" serialization-dictionary-key="RVShapeElementStrokeWidthKey"/>
              </stroke>
              <_shadow containerClass="NSMutableDictionary">
                <NSNumber serialization-native-value="0" serialization-dictionary-key="RVShadowOffsetXKey"/>
                <NSNumber serialization-native-value="0" serialization-dictionary-key="RVShadowOffsetYKey"/>
                <NSNumber serialization-native-value="4" serialization-dictionary-key="RVShadowBlurRadiusKey"/>
                <NSColor serialization-native-value="0 0 0 0.5" serialization-dictionary-key="RVShadowColorKey"/>
              </_shadow>
            </RVTextElement>
          </displayElements>
        </RVDisplaySlide>`;
  }).join('');
  
  // Full Pro6 XML structure with slides inside <slides> container within <RVSlideGrouping>
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="600" docType="0" creatorCode="1349676880" lastDateUsed="${createdDate}" usedCount="0" category="Sermon" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="0" notes="" artist="" author="" album="" CCLIDisplay="0" CCLIArtistCredits="" CCLISongTitle="${safeTitle}" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" chordChartPath="" os="2" buildNumber="16177" selectedArrangementID="${groupUuid}" UUID="${presentationUuid}">
  <timeline timeOffSet="0" selectedMediaTrackIndex="0" unitOfMeasure="60" duration="0" loop="0" containerClass="NSMutableDictionary">
    <timeCues containerClass="NSMutableArray"/>
    <mediaTracks containerClass="NSMutableArray"/>
  </timeline>
  <bibleReference containerClass="NSMutableDictionary"/>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping name="${safeTitle}" uuid="${groupUuid}" color="0.36078431 0.11764706 0.16862745 1" serialization-array-index="0">
      <slides containerClass="NSMutableArray">${slidesXml}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray">
    <RVSongArrangement name="Master" uuid="${groupUuid}" color="0 0 0 0" serialization-array-index="0">
      <groupIDs containerClass="NSMutableArray">
        <NSMutableString serialization-native-value="${groupUuid}" serialization-array-index="0"/>
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
