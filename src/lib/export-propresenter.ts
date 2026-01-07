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

// Create slide object for ProPresenter 7
function createSlide(slideData: SlideData, index: number): object {
  const bgColor = parseGradientColor(slideData.background);
  const bgColorObj = hexToProPresenterColor(bgColor);
  const textColorObj = hexToProPresenterColor(slideData.textColor);
  
  let slideText = '';
  let slideLabel = `Slide ${index + 1}`;

  switch (slideData.type) {
    case 'title':
      slideLabel = slideData.content.title || 'Title';
      slideText = slideData.content.title || '';
      if (slideData.content.subtitle) {
        slideText += '\n' + slideData.content.subtitle;
      }
      break;
    case 'point':
      slideLabel = slideData.content.title || 'Point';
      slideText = slideData.content.title || '';
      if (slideData.content.subtitle) {
        slideText += '\n' + slideData.content.subtitle;
      }
      break;
    case 'scripture':
      slideLabel = slideData.content.reference || 'Scripture';
      slideText = slideData.content.scripture || '';
      if (slideData.content.reference) {
        slideText += '\n— ' + slideData.content.reference;
      }
      break;
    case 'blank':
      slideLabel = 'Blank';
      break;
  }

  return {
    id: {
      uuid: generateUUID(),
      name: slideLabel,
      index: index,
    },
    enabled: true,
    notes: '',
    text: {
      rawText: slideText,
    },
    label: {
      color: bgColorObj,
      text: slideLabel,
    },
    size: {
      width: 1920,
      height: 1080,
    },
    background: {
      color: bgColorObj,
    },
    textElements: [
      {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
        text: slideText,
        textStyle: {
          fontName: slideData.fontFamily || 'Arial',
          fontSize: slideData.type === 'title' ? 80 : slideData.type === 'scripture' ? 48 : 64,
          fontColor: textColorObj,
          alignment: 'center',
          verticalAlignment: 'center',
        },
      },
    ],
  };
}

// Create ProPresenter 7 document (JSON format)
export function exportToProPresenter(slides: SlideData[], title: string): void {
  const presentation = {
    name: title,
    uuid: generateUUID(),
    width: 1920,
    height: 1080,
    notes: '',
    chordChart: null,
    arrangements: [
      {
        uuid: generateUUID(),
        name: 'Master',
        groups: [
          {
            uuid: generateUUID(),
            name: title,
            color: { red: 0.36, green: 0.12, blue: 0.17, alpha: 1 },
            slides: slides.map((slide, index) => createSlide(slide, index)),
          },
        ],
      },
    ],
    cueGroups: [],
    timeline: {
      duration: 0,
      loops: false,
      items: [],
    },
    createdDate: new Date().toISOString(),
    lastModifiedDate: new Date().toISOString(),
    category: 'Sermon',
    ccliDisplay: false,
    ccliNumber: '',
    author: '',
    artist: '',
    copyright: '',
  };

  const jsonContent = JSON.stringify(presentation, null, 2);
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
