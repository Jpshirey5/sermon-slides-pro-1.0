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

// Convert hex color to ProPresenter color format (RGBA 0-1)
function hexToProPresenterColor(hex: string): { red: number; green: number; blue: number; alpha: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return { red: r, green: g, blue: b, alpha: 1 };
}

// Parse gradient to get primary color
function parseGradientColor(bg: string): string {
  if (bg.startsWith('linear-gradient')) {
    const match = bg.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
    if (match) return match[0];
  }
  if (bg.startsWith('#')) return bg;
  return '#5c1e2b';
}

// Create slide text element
function createTextElement(
  text: string,
  color: string,
  fontSize: number,
  bold: boolean = false,
  italic: boolean = false
): object {
  const colorObj = hexToProPresenterColor(color);
  return {
    element: {
      name: 'Text Element',
      uuid: generateUUID(),
      textElement: {
        textValue: text,
        font: {
          name: 'Arial',
          size: fontSize,
          bold,
          italic,
        },
        color: colorObj,
        alignment: 'center',
        verticalAlignment: 'middle',
      },
      position: {
        x: 0.05,
        y: 0.3,
        width: 0.9,
        height: 0.4,
      },
    },
  };
}

// Create ProPresenter slide
function createSlide(slideData: SlideData): object {
  const bgColor = parseGradientColor(slideData.background);
  const bgColorObj = hexToProPresenterColor(bgColor);
  
  const elements: object[] = [];
  
  switch (slideData.type) {
    case 'title':
      if (slideData.content.title) {
        elements.push(createTextElement(slideData.content.title, slideData.textColor, 72, true));
      }
      if (slideData.content.subtitle) {
        elements.push({
          element: {
            name: 'Subtitle',
            uuid: generateUUID(),
            textElement: {
              textValue: slideData.content.subtitle,
              font: {
                name: 'Arial',
                size: 36,
                bold: false,
                italic: false,
              },
              color: hexToProPresenterColor(slideData.textColor),
              alignment: 'center',
              verticalAlignment: 'middle',
            },
            position: {
              x: 0.05,
              y: 0.6,
              width: 0.9,
              height: 0.2,
            },
          },
        });
      }
      break;

    case 'point':
      if (slideData.content.title) {
        elements.push(createTextElement(slideData.content.title, slideData.textColor, 60, true));
      }
      if (slideData.content.subtitle) {
        elements.push({
          element: {
            name: 'Description',
            uuid: generateUUID(),
            textElement: {
              textValue: slideData.content.subtitle,
              font: {
                name: 'Arial',
                size: 32,
                bold: false,
                italic: false,
              },
              color: hexToProPresenterColor(slideData.textColor),
              alignment: 'center',
              verticalAlignment: 'middle',
            },
            position: {
              x: 0.05,
              y: 0.6,
              width: 0.9,
              height: 0.25,
            },
          },
        });
      }
      break;

    case 'scripture':
      if (slideData.content.scripture) {
        elements.push({
          element: {
            name: 'Scripture Text',
            uuid: generateUUID(),
            textElement: {
              textValue: slideData.content.scripture,
              font: {
                name: 'Arial',
                size: 48,
                bold: false,
                italic: true,
              },
              color: hexToProPresenterColor(slideData.textColor),
              alignment: 'center',
              verticalAlignment: 'middle',
            },
            position: {
              x: 0.05,
              y: 0.2,
              width: 0.9,
              height: 0.5,
            },
          },
        });
      }
      if (slideData.content.reference) {
        elements.push({
          element: {
            name: 'Reference',
            uuid: generateUUID(),
            textElement: {
              textValue: `— ${slideData.content.reference}`,
              font: {
                name: 'Arial',
                size: 28,
                bold: false,
                italic: false,
              },
              color: hexToProPresenterColor(slideData.textColor),
              alignment: 'center',
              verticalAlignment: 'middle',
            },
            position: {
              x: 0.05,
              y: 0.75,
              width: 0.9,
              height: 0.1,
            },
          },
        });
      }
      break;
  }

  return {
    slide: {
      uuid: generateUUID(),
      name: slideData.content.title || slideData.content.scripture || 'Slide',
      background: {
        color: bgColorObj,
      },
      elements,
    },
  };
}

export function exportToProPresenter(slides: SlideData[], title: string): void {
  const presentation = {
    proPresenterDocument: {
      version: '7.0',
      uuid: generateUUID(),
      name: title,
      category: 'Sermon',
      ccliDisplay: false,
      width: 1920,
      height: 1080,
      slides: slides.map(createSlide),
      metadata: {
        createdWith: 'SermonSlides Pro',
        createdAt: new Date().toISOString(),
      },
    },
  };

  // Create JSON content (ProPresenter 7 uses JSON format)
  const jsonContent = JSON.stringify(presentation, null, 2);
  
  // Create blob and download
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pro`;
  
  saveAs(blob, fileName);
}

// Export as RTF for ProPresenter 6 compatibility
export function exportToProPresenter6(slides: SlideData[], title: string): void {
  let rtfContent = '{\\rtf1\\ansi\\deff0\n';
  
  slides.forEach((slide, index) => {
    rtfContent += `\\page\n`;
    
    switch (slide.type) {
      case 'title':
        rtfContent += `{\\b\\fs72 ${slide.content.title || ''}\\par}\n`;
        if (slide.content.subtitle) {
          rtfContent += `{\\fs48 ${slide.content.subtitle}\\par}\n`;
        }
        break;
      case 'point':
        rtfContent += `{\\b\\fs64 ${slide.content.title || ''}\\par}\n`;
        if (slide.content.subtitle) {
          rtfContent += `{\\fs40 ${slide.content.subtitle}\\par}\n`;
        }
        break;
      case 'scripture':
        rtfContent += `{\\i\\fs56 ${slide.content.scripture || ''}\\par}\n`;
        if (slide.content.reference) {
          rtfContent += `{\\fs36 — ${slide.content.reference}\\par}\n`;
        }
        break;
    }
  });
  
  rtfContent += '}';
  
  const blob = new Blob([rtfContent], { type: 'application/rtf' });
  const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_pp6.rtf`;
  
  saveAs(blob, fileName);
}
