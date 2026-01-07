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

// Create text element for ProPresenter 7
function createTextElement(
  text: string,
  textColor: { red: number; green: number; blue: number; alpha: number },
  fontSize: number,
  yPosition: number,
  height: number,
  bold: boolean = false,
  italic: boolean = false
): object {
  return {
    element: {
      uuid: { string: generateUUID() },
      bounds: { origin: { x: 50, y: yPosition }, size: { width: 1820, height } },
      textElement: {
        attributes: {
          paragraphStyle: {
            alignment: 1, // center
          },
          font: {
            name: 'Arial',
            size: fontSize,
          },
          foregroundColor: textColor,
          strokeColor: { red: 0, green: 0, blue: 0, alpha: 0 },
          strokeWidth: 0,
          bold,
          italic,
        },
        RTFData: btoa(text), // Base64 encoded text
        plainText: text,
      },
    },
  };
}

// Create ProPresenter 7 slide cue
function createSlideCue(slideData: SlideData, index: number): object {
  const bgColor = parseGradientColor(slideData.background);
  const bgColorObj = hexToProPresenterColor(bgColor);
  const textColorObj = hexToProPresenterColor(slideData.textColor);

  const elements: object[] = [];
  let slideName = `Slide ${index + 1}`;

  switch (slideData.type) {
    case 'title':
      slideName = slideData.content.title || 'Title Slide';
      if (slideData.content.title) {
        elements.push(createTextElement(slideData.content.title, textColorObj, 80, 350, 150, true, false));
      }
      if (slideData.content.subtitle) {
        elements.push(createTextElement(slideData.content.subtitle, textColorObj, 40, 520, 80, false, false));
      }
      break;

    case 'point':
      slideName = slideData.content.title || 'Point Slide';
      if (slideData.content.title) {
        elements.push(createTextElement(slideData.content.title, textColorObj, 72, 350, 150, true, false));
      }
      if (slideData.content.subtitle) {
        elements.push(createTextElement(slideData.content.subtitle, textColorObj, 36, 520, 100, false, false));
      }
      break;

    case 'scripture':
      slideName = slideData.content.reference || 'Scripture Slide';
      if (slideData.content.scripture) {
        elements.push(createTextElement(slideData.content.scripture, textColorObj, 48, 200, 400, false, true));
      }
      if (slideData.content.reference) {
        elements.push(createTextElement(`— ${slideData.content.reference}`, textColorObj, 28, 650, 60, false, false));
      }
      break;

    case 'blank':
      slideName = 'Blank Slide';
      break;
  }

  return {
    uuid: { string: generateUUID() },
    isEnabled: true,
    timestamp: 0,
    duration: 0,
    actions: [
      {
        uuid: { string: generateUUID() },
        type: { slide: true },
        isEnabled: true,
        slide: {
          presentation: {
            baseSlide: {
              uuid: { string: generateUUID() },
              name: slideName,
              backgroundColor: bgColorObj,
              elements,
              size: { width: 1920, height: 1080 },
            },
          },
        },
      },
    ],
  };
}

// Create complete ProPresenter 7 document structure
function createProPresenter7Document(slides: SlideData[], title: string): object {
  const documentUUID = generateUUID();
  
  return {
    application: {
      name: 'ProPresenter',
      version: '7.13',
    },
    settings: {
      backgroundColor: { red: 0, green: 0, blue: 0, alpha: 1 },
      width: 1920,
      height: 1080,
      selectedArrangementID: { string: generateUUID() },
    },
    cues: slides.map((slide, index) => createSlideCue(slide, index)),
    uuid: { string: documentUUID },
    name: title,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    arrangements: [
      {
        uuid: { string: generateUUID() },
        name: 'Default',
        groupIdentifiers: slides.map(() => ({ string: generateUUID() })),
      },
    ],
    cueGroups: [
      {
        uuid: { string: generateUUID() },
        name: title,
        color: { red: 0.36, green: 0.12, blue: 0.17, alpha: 1 },
        cueIdentifiers: slides.map((_, index) => ({ string: generateUUID() })),
      },
    ],
  };
}

export function exportToProPresenter(slides: SlideData[], title: string): void {
  const presentation = createProPresenter7Document(slides, title);

  // Create JSON content with ProPresenter 7 format
  const jsonContent = JSON.stringify(presentation, null, 2);
  
  // ProPresenter 7 uses .pro files which are JSON-based
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pro`;
  
  saveAs(blob, fileName);
}

// Export as RTF for ProPresenter 6 compatibility
export function exportToProPresenter6(slides: SlideData[], title: string): void {
  let rtfContent = '{\\rtf1\\ansi\\deff0\n';
  
  slides.forEach((slide) => {
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
