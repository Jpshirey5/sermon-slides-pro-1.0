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
}

// Convert hex color to RGB for pptxgenjs
function hexToColor(hex: string): string {
  // Remove # if present
  return hex.replace('#', '');
}

// Parse gradient or solid color to get primary color
function parseBackground(bg: string): { color: string; isGradient: boolean } {
  if (bg.startsWith('linear-gradient')) {
    // Extract first color from gradient
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

  // Set slide layout
  pptx.defineLayout({ name: 'CUSTOM', width: 13.33, height: 7.5 });
  pptx.layout = 'CUSTOM';

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    const bgInfo = parseBackground(slideData.background);

    // Set background
    if (slideData.backgroundImage) {
      try {
        slide.background = { path: slideData.backgroundImage };
      } catch {
        slide.background = { color: bgInfo.color };
      }
    } else if (bgInfo.isGradient) {
      // Use gradient approximation
      slide.background = {
        color: bgInfo.color,
      };
    } else {
      slide.background = { color: bgInfo.color };
    }

    const textColor = hexToColor(slideData.textColor);

    switch (slideData.type) {
      case 'title':
        // Main title
        slide.addText(slideData.content.title || '', {
          x: 0.5,
          y: 2.5,
          w: 12.33,
          h: 1.5,
          fontSize: 54,
          bold: true,
          color: textColor,
          fontFace: slideData.fontFamily.includes('Playfair') ? 'Georgia' : 'Arial',
          align: 'center',
          valign: 'middle',
        });

        // Subtitle
        if (slideData.content.subtitle) {
          slide.addText(slideData.content.subtitle, {
            x: 0.5,
            y: 4.2,
            w: 12.33,
            h: 0.8,
            fontSize: 24,
            color: textColor,
            fontFace: 'Arial',
            align: 'center',
            valign: 'middle',
          });
        }
        break;

      case 'point':
        // Point title
        slide.addText(slideData.content.title || '', {
          x: 0.5,
          y: 2.5,
          w: 12.33,
          h: 1.5,
          fontSize: 44,
          bold: true,
          color: textColor,
          fontFace: slideData.fontFamily.includes('Playfair') ? 'Georgia' : 'Arial',
          align: 'center',
          valign: 'middle',
        });

        // Point subtitle
        if (slideData.content.subtitle) {
          slide.addText(slideData.content.subtitle, {
            x: 0.5,
            y: 4.2,
            w: 12.33,
            h: 0.8,
            fontSize: 24,
            color: textColor,
            fontFace: 'Arial',
            align: 'center',
            valign: 'middle',
          });
        }
        break;

      case 'scripture':
        // Scripture text
        slide.addText(slideData.content.scripture || '', {
          x: 0.5,
          y: 1.5,
          w: 12.33,
          h: 3.5,
          fontSize: 32,
          italic: true,
          color: textColor,
          fontFace: slideData.fontFamily.includes('Playfair') ? 'Georgia' : 'Arial',
          align: 'center',
          valign: 'middle',
        });

        // Scripture reference
        if (slideData.content.reference) {
          slide.addText(`— ${slideData.content.reference}`, {
            x: 0.5,
            y: 5.5,
            w: 12.33,
            h: 0.6,
            fontSize: 20,
            color: textColor,
            fontFace: 'Arial',
            align: 'center',
            valign: 'middle',
          });
        }
        break;

      case 'blank':
        // Empty slide with just background
        break;
    }
  }

  // Generate and download file
  await pptx.writeFile({ fileName: `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx` });
}
