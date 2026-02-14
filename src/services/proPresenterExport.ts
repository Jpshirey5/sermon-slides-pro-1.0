import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Presentation } from './pro7-schema';

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

export interface ExportValidationResult {
  isValid: boolean;
  errors: string[];
}

// ── UUID ──────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function makeUUID(id?: string) {
  return { string: id ?? generateUUID() };
}

// ── RTF encoding (raw bytes for protobuf) ────────────

function escapeRTF(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (char === '\\') result += '\\\\';
    else if (char === '{') result += '\\{';
    else if (char === '}') result += '\\}';
    else if (char === '\n') result += '\\par ';
    else if (code > 127) result += `\\u${code}?`;
    else result += char;
  }
  return result;
}

function encodeRTFBytes(text: string, textColor: string = '#FFFFFF', fontSize: number = 96): Uint8Array {
  const rgb = hexToRGB(textColor);
  const escapedText = text ? escapeRTF(text) : '';
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639\n{\\fonttbl\\f0\\fswiss\\fcharset0 Arial;}\n{\\colortbl;\\red${rgb.r}\\green${rgb.g}\\blue${rgb.b};}\n\\pard\\tx560\\tx1120\\qc\\pardirnatural\\partightenfactor0\n\\f0\\fs${fontSize * 2}\\cf1 ${escapedText}}`;
  return new TextEncoder().encode(rtf);
}

// ── Color helpers ─────────────────────────────────────

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
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

function parseBackgroundColor(bg: string): { r: number; g: number; b: number } {
  if (bg.startsWith('linear-gradient')) {
    const match = bg.match(/#([a-fA-F0-9]{6})/);
    if (match) return hexToRGB(`#${match[1]}`);
  }
  if (bg.startsWith('#')) return hexToRGB(bg);
  return { r: 92, g: 30, b: 43 };
}

function toProColor(r: number, g: number, b: number, a: number = 1) {
  return { red: r / 255, green: g / 255, blue: b / 255, alpha: a };
}

// ── Slide text extraction ─────────────────────────────

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

function getSlideLabel(slide: SlideData, index: number): string {
  if (slide.content.title) return slide.content.title;
  if (slide.content.reference) return slide.content.reference;
  return `Slide ${index + 1}`;
}

// ── File name / validation ────────────────────────────

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*&()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Presentation';
}

export function validateSlidesForExport(slides: SlideData[]): ExportValidationResult {
  const errors: string[] = [];
  if (!slides || slides.length === 0) {
    errors.push('No slides to export. Please add at least one slide.');
  }
  const slidesWithText = slides.filter((slide) => {
    const text = getSlideText(slide);
    return text && text.trim().length > 0;
  });
  if (slides.length > 0 && slidesWithText.length === 0) {
    errors.push('All slides are empty. Please add content to at least one slide.');
  }
  const ids = slides.map((s) => s.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('Duplicate slide IDs detected. This may cause import issues.');
  }
  return { isValid: errors.length === 0, errors };
}

// ── Image helpers ─────────────────────────────────────

function getImageExtension(url: string): string {
  if (url.startsWith('data:image/')) {
    const match = url.match(/data:image\/(\w+)/);
    if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  }
  const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0];
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

async function fetchImageAsBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith('data:')) {
      const response = await fetch(url);
      return await response.blob();
    }
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

// ── Protobuf message builders ─────────────────────────

function makeRectPath(w: number, h: number) {
  return {
    closed: true,
    points: [
      { point: { x: 0, y: 0 } },
      { point: { x: w, y: 0 } },
      { point: { x: w, y: h } },
      { point: { x: 0, y: h } },
    ],
    shape: { type: 1 }, // RECTANGLE
  };
}

function makeTextAttributes(fontName: string = 'Arial', fontSize: number = 48) {
  return [{
    font: {
      name: fontName,
      size: fontSize,
      bold: false,
      family: fontName,
    },
    paragraph_style: {
      alignment: 2, // CENTER
    },
  }];
}

function buildSlideMessage(slide: SlideData, _index: number, mediaFilename?: string) {
  const text = getSlideText(slide);
  const bgColor = parseBackgroundColor(slide.background);
  const slideUUID = makeUUID();

  // Text element with attributes
  const textElement = {
    element: {
      uuid: makeUUID(),
      name: 'TextElement',
      bounds: {
        origin: { x: 50, y: 50 },
        size: { width: 1820, height: 980 },
      },
      opacity: 1.0,
      path: makeRectPath(1820, 980),
      text: {
        attributes: makeTextAttributes('Arial', 48),
        rtf_data: encodeRTFBytes(text, slide.textColor),
        vertical_alignment: 1, // MIDDLE
      },
    },
  };

  const elements: any[] = [textElement];

  // Background image element (if present)
  if (mediaFilename) {
    const bgElement = {
      element: {
        uuid: makeUUID(),
        name: 'BackgroundImage',
        bounds: {
          origin: { x: 0, y: 0 },
          size: { width: 1920, height: 1080 },
        },
        opacity: 1.0,
        path: makeRectPath(1920, 1080),
        fill: {
          media: {
            uuid: makeUUID(),
            url: {
              relative_path: `Media/${mediaFilename}`,
            },
          },
          enable: true,
        },
      },
    };
    // Background goes first so text renders on top
    elements.unshift(bgElement);
  }

  return {
    elements,
    draws_background_color: true,
    background_color: toProColor(bgColor.r, bgColor.g, bgColor.b),
    size: { width: 1920, height: 1080 },
    uuid: slideUUID,
  };
}

function buildPresentationMessage(
  presentationName: string,
  slides: SlideData[],
  mediaMap: Map<number, string>
) {
  const presentationUUID = makeUUID();
  const groupUUID = makeUUID();

  const cues: any[] = [];
  const cueIdentifiers: any[] = [];

  slides.forEach((slide, index) => {
    const cueUUID = makeUUID();
    const actionUUID = makeUUID();
    const label = getSlideLabel(slide, index);
    const mediaFilename = mediaMap.get(index);

    const slideMsg = buildSlideMessage(slide, index, mediaFilename);

    const cue = {
      uuid: cueUUID,
      name: label,
      actions: [
        {
          uuid: actionUUID,
          isEnabled: true,
          type: 11, // ACTION_TYPE_PRESENTATION_SLIDE
          slide: {
            presentation: {
              base_slide: slideMsg,
            },
          },
        },
      ],
      isEnabled: true,
    };

    cues.push(cue);
    cueIdentifiers.push(cueUUID);
  });

  return {
    application_info: {
      platform: 1, // MACOS
      version: {
        major_version: 7,
        minor_version: 16,
      },
    },
    uuid: presentationUUID,
    name: presentationName,
    category: 'Presentation',
    cue_groups: [
      {
        group: {
          uuid: groupUUID,
          name: presentationName,
          color: toProColor(0, 0, 0, 1),
        },
        cue_identifiers: cueIdentifiers,
      },
    ],
    cues,
  };
}

// ── Public export functions ───────────────────────────

export async function exportAsProBundle(
  slides: SlideData[],
  presentationTitle: string
): Promise<void> {
  const validation = validateSlidesForExport(slides);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(' '));
  }

  const safeTitle = sanitizeFileName(presentationTitle);
  const zip = new JSZip();

  // Collect media files
  const mediaMap = new Map<number, string>();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.backgroundImage) {
      const ext = getImageExtension(slide.backgroundImage);
      const filename = `bg_${String(i + 1).padStart(3, '0')}.${ext}`;
      const blob = await fetchImageAsBlob(slide.backgroundImage);
      if (blob) {
        zip.file(`Media/${filename}`, blob);
        mediaMap.set(i, filename);
      }
    }
  }

  // Build protobuf message
  const presentationData = buildPresentationMessage(safeTitle, slides, mediaMap);

  // Encode to binary
  const errMsg = Presentation.verify(presentationData);
  if (errMsg) {
    console.warn('Protobuf verification warning:', errMsg);
  }
  const message = Presentation.create(presentationData);
  const buffer = Presentation.encode(message).finish();

  console.log(`[ProPresenter Export] Encoded ${buffer.length} bytes for "${safeTitle}"`);

  // Write binary .pro file using presentation title
  zip.file(`${safeTitle}.pro`, buffer);

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${safeTitle}.probundle`);
}

export function exportAsPlainText(
  slides: SlideData[],
  presentationTitle: string
): void {
  const lines: string[] = [
    `# ${presentationTitle}`,
    `Exported: ${new Date().toLocaleDateString()}`,
    '',
    '---',
    '',
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
