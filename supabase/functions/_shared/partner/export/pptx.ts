// PARTNER API — server-side port of src/lib/export-pptx.ts (buildPowerPointFile).
// Layout, fonts, and per-slide-type text boxes are copied verbatim; only I/O
// differs: background images come from a caller-supplied resolver and the deck
// is returned as bytes. Keep in sync with the browser module.

import pptxgen from 'npm:pptxgenjs@4.0.1';
import type { SlideData } from '../slides.ts';
import type { ResolvedImage } from './images.ts';

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
export function sanitizePptxFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Presentation';
}


// Map font family to PowerPoint-compatible fonts
function mapFontFamily(fontFamily: string): string {
  if (fontFamily.includes('Playfair')) return 'Georgia';
  if (fontFamily.includes('Inter')) return 'Arial';
  return 'Arial';
}

export async function buildPowerPointBytes(
  slides: SlideData[],
  title: string,
  resolveImage: (ref: string) => Promise<ResolvedImage | null>,
): Promise<{ bytes: Uint8Array; filename: string }> {
  // deno-lint-ignore no-explicit-any
  const pptx = new (pptxgen as any)();

  // Set presentation properties
  pptx.author = 'Sermon Slide Pro';
  pptx.title = title;
  pptx.subject = 'Sermon Presentation';
  pptx.company = 'Sermon Slide Pro';

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
    const image = slideData.backgroundImage ? await resolveImage(slideData.backgroundImage) : null;
    slide.background = image ? { data: image.dataUrl } : { color: bgInfo.color };

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

  const fileName = sanitizePptxFileName(title);
  const bytes = await pptx.write({ outputType: "uint8array" }) as Uint8Array;
  return {
    bytes,
    filename: `${fileName}.pptx`,
  };
}
