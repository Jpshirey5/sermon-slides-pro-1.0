import pptxgen from 'pptxgenjs';

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
  lineSpacing?: number;
  fontSize?: number;
}

// Convert hex color to RGB for pptxgenjs (removes # prefix)
function hexToColor(hex: string): string {
  return hex.replace('#', '');
}

// Parse gradient or solid color to get primary color
function parseBackground(bg: string): { color: string; isGradient: boolean } {
  if (bg.startsWith('linear-gradient')) {
    const match = bg.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
    if (match) {
      return { color: match[0].replace('#', ''), isGradient: true };
    }
    return { color: '5c1e2b', isGradient: true };
  }
  if (bg.startsWith('#')) {
    return { color: bg.replace('#', ''), isGradient: false };
  }
  return { color: '5c1e2b', isGradient: false };
}

// Sanitize filename for safe file system use
function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Presentation';
}

// Fetch image and convert to base64 for embedding
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    console.warn('Failed to fetch background image:', url);
    return null;
  }
}

// Map font family to PowerPoint-compatible fonts
function mapFontFamily(fontFamily: string): string {
  if (fontFamily.includes('Playfair')) return 'Georgia';
  if (fontFamily.includes('Inter')) return 'Arial';
  return 'Arial';
}

export async function exportToPowerPoint(
  slides: SlideData[],
  title: string
): Promise<void> {
  const pptx = new pptxgen();

  // Set presentation properties
  pptx.author = 'SermonSlides Pro';
  pptx.title = title;
  pptx.subject = 'Sermon Presentation';
  pptx.company = 'SermonSlides Pro';

  // Set 16:9 widescreen layout (standard for presentations)
  pptx.defineLayout({ name: 'WIDESCREEN', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDESCREEN';

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    const bgInfo = parseBackground(slideData.background);
    const textColor = hexToColor(slideData.textColor);
    const fontFace = mapFontFamily(slideData.fontFamily);
    const baseFontSize = slideData.fontSize || 36;

    // Apply background - try image first, then color
    if (slideData.backgroundImage) {
      try {
        const base64Image = await fetchImageAsBase64(slideData.backgroundImage);
        if (base64Image) {
          slide.background = { data: base64Image };
        } else {
          // Fallback to color if image fetch fails
          slide.background = { color: bgInfo.color };
        }
      } catch {
        slide.background = { color: bgInfo.color };
      }
    } else {
      slide.background = { color: bgInfo.color };
    }

    switch (slideData.type) {
      case 'title':
        // Main title - large, bold, centered
        if (slideData.content.title) {
          slide.addText(slideData.content.title, {
            x: 0.5,
            y: 2.5,
            w: 12.33,
            h: 1.5,
            fontSize: Math.round(baseFontSize * 1.5), // 54pt default
            bold: true,
            color: textColor,
            fontFace: fontFace,
            align: 'center',
            valign: 'middle',
          });
        }

        // Subtitle - smaller, centered below title
        if (slideData.content.subtitle) {
          slide.addText(slideData.content.subtitle, {
            x: 0.5,
            y: 4.2,
            w: 12.33,
            h: 0.8,
            fontSize: Math.round(baseFontSize * 0.67), // 24pt default
            color: textColor,
            fontFace: fontFace,
            align: 'center',
            valign: 'middle',
          });
        }
        break;

      case 'point':
        // Point title - bold, centered
        if (slideData.content.title) {
          slide.addText(slideData.content.title, {
            x: 0.5,
            y: 2.5,
            w: 12.33,
            h: 1.5,
            fontSize: Math.round(baseFontSize * 1.22), // 44pt default
            bold: true,
            color: textColor,
            fontFace: fontFace,
            align: 'center',
            valign: 'middle',
          });
        }

        // Point subtitle - below title
        if (slideData.content.subtitle) {
          slide.addText(slideData.content.subtitle, {
            x: 0.5,
            y: 4.2,
            w: 12.33,
            h: 0.8,
            fontSize: Math.round(baseFontSize * 0.67), // 24pt default
            color: textColor,
            fontFace: fontFace,
            align: 'center',
            valign: 'middle',
          });
        }
        break;

      case 'scripture':
        // Scripture text - italic, centered, with line breaks preserved
        if (slideData.content.scripture) {
          const scriptureLines = slideData.content.scripture.split('\n');
          slide.addText(scriptureLines.map(line => ({ text: line, options: { breakLine: true } })), {
            x: 0.5,
            y: 1.5,
            w: 12.33,
            h: 3.5,
            fontSize: Math.round(baseFontSize * 0.89), // 32pt default
            italic: true,
            color: textColor,
            fontFace: fontFace,
            align: 'center',
            valign: 'middle',
          });
        }

        // Scripture reference - smaller, centered below scripture
        if (slideData.content.reference) {
          slide.addText(`— ${slideData.content.reference}`, {
            x: 0.5,
            y: 5.5,
            w: 12.33,
            h: 0.6,
            fontSize: Math.round(baseFontSize * 0.56), // 20pt default
            color: textColor,
            fontFace: fontFace,
            align: 'center',
            valign: 'middle',
          });
        }
        break;

      case 'blank':
        // Empty slide - background only
        break;
    }
  }

  // Generate and download file with sanitized filename
  const fileName = sanitizeFileName(title);
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
