import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { resolveBackgroundImageSource } from "@/lib/background-assets";
import type { SlideData } from "@/lib/export-pptx";

const PAGE_WIDTH_IN = 13.33;
const PAGE_HEIGHT_IN = 7.5;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  const value = parseInt(clean, 16);
  if (Number.isNaN(value)) return { r: 92, g: 30, b: 43 };
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function parseBackgroundColor(bg: string): { r: number; g: number; b: number } {
  if (bg.startsWith("linear-gradient")) {
    const match = bg.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
    if (match) return hexToRgb(match[0]);
    return { r: 92, g: 30, b: 43 };
  }
  if (bg.startsWith("#")) return hexToRgb(bg);
  return { r: 92, g: 30, b: 43 };
}

export function sanitizePdfFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "Presentation";
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// jsPDF ships with helvetica, times, and courier. Map app fonts to the closest built-in.
function mapFontFamily(fontFamily: string): "helvetica" | "times" | "courier" {
  const lower = fontFamily.toLowerCase();
  if (lower.includes("playfair") || lower.includes("georgia") || lower.includes("times") || lower.includes("serif")) {
    return "times";
  }
  if (lower.includes("courier") || lower.includes("mono")) return "courier";
  return "helvetica";
}

function drawCenteredText(
  doc: jsPDF,
  text: string,
  options: {
    font: "helvetica" | "times" | "courier";
    style: "normal" | "bold" | "italic" | "bolditalic";
    sizePt: number;
    color: { r: number; g: number; b: number };
    yCenterIn: number;
    lineSpacing: number;
    maxWidthIn?: number;
  },
) {
  const { font, style, sizePt, color, yCenterIn, lineSpacing, maxWidthIn = PAGE_WIDTH_IN - 1 } = options;
  doc.setFont(font, style);
  doc.setFontSize(sizePt);
  doc.setTextColor(color.r, color.g, color.b);
  const lines = doc.splitTextToSize(text, maxWidthIn) as string[];
  const lineHeightIn = (sizePt / 72) * lineSpacing;
  const blockHeightIn = lineHeightIn * lines.length;
  let y = yCenterIn - blockHeightIn / 2 + lineHeightIn * 0.75;
  for (const line of lines) {
    doc.text(line, PAGE_WIDTH_IN / 2, y, { align: "center" });
    y += lineHeightIn;
  }
}

export async function buildPdfFile(
  slides: SlideData[],
  title: string,
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [PAGE_WIDTH_IN, PAGE_HEIGHT_IN],
    compress: true,
  });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (i > 0) doc.addPage([PAGE_WIDTH_IN, PAGE_HEIGHT_IN], "landscape");

    const bgColor = parseBackgroundColor(slide.background);
    doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    doc.rect(0, 0, PAGE_WIDTH_IN, PAGE_HEIGHT_IN, "F");

    if (slide.backgroundImage) {
      try {
        const resolved = await resolveBackgroundImageSource(slide.backgroundImage);
        const dataUrl = resolved ? await fetchImageAsDataUrl(resolved) : null;
        if (dataUrl) {
          const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(dataUrl, format, 0, 0, PAGE_WIDTH_IN, PAGE_HEIGHT_IN, undefined, "FAST");
          doc.setFillColor(0, 0, 0);
          doc.setGState(doc.GState({ opacity: 0.4 }));
          doc.rect(0, 0, PAGE_WIDTH_IN, PAGE_HEIGHT_IN, "F");
          doc.setGState(doc.GState({ opacity: 1 }));
        }
      } catch {
        // background image failed — solid color already drawn
      }
    }

    const font = mapFontFamily(slide.fontFamily);
    const textColor = hexToRgb(slide.textColor);
    const baseSize = slide.fontSize || 36;
    const lineSpacing = slide.lineSpacing ?? 1.4;

    switch (slide.type) {
      case "title": {
        if (slide.content.title) {
          drawCenteredText(doc, slide.content.title, {
            font,
            style: "bold",
            sizePt: Math.round(baseSize * 1.5),
            color: textColor,
            yCenterIn: slide.content.subtitle ? PAGE_HEIGHT_IN * 0.42 : PAGE_HEIGHT_IN / 2,
            lineSpacing,
          });
        }
        if (slide.content.subtitle) {
          drawCenteredText(doc, slide.content.subtitle, {
            font,
            style: "normal",
            sizePt: Math.round(baseSize * 0.67),
            color: textColor,
            yCenterIn: PAGE_HEIGHT_IN * 0.65,
            lineSpacing,
          });
        }
        break;
      }
      case "point": {
        if (slide.content.title) {
          drawCenteredText(doc, slide.content.title, {
            font,
            style: "bold",
            sizePt: Math.round(baseSize * 1.22),
            color: textColor,
            yCenterIn: slide.content.subtitle ? PAGE_HEIGHT_IN * 0.42 : PAGE_HEIGHT_IN / 2,
            lineSpacing,
          });
        }
        if (slide.content.subtitle) {
          drawCenteredText(doc, slide.content.subtitle, {
            font,
            style: "normal",
            sizePt: Math.round(baseSize * 0.67),
            color: textColor,
            yCenterIn: PAGE_HEIGHT_IN * 0.65,
            lineSpacing,
          });
        }
        break;
      }
      case "scripture": {
        if (slide.content.scripture) {
          drawCenteredText(doc, slide.content.scripture, {
            font,
            style: "italic",
            sizePt: Math.round(baseSize * 0.89),
            color: textColor,
            yCenterIn: slide.content.reference ? PAGE_HEIGHT_IN * 0.45 : PAGE_HEIGHT_IN / 2,
            lineSpacing,
          });
        }
        if (slide.content.reference) {
          drawCenteredText(doc, `— ${slide.content.reference}`, {
            font,
            style: "normal",
            sizePt: Math.round(baseSize * 0.56),
            color: textColor,
            yCenterIn: PAGE_HEIGHT_IN * 0.82,
            lineSpacing,
          });
        }
        break;
      }
      case "blank":
        break;
    }
  }

  const filename = `${sanitizePdfFileName(title)}.pdf`;
  const blob = doc.output("blob");
  return { blob, filename };
}

export async function exportToPdf(slides: SlideData[], title: string): Promise<void> {
  const { blob, filename } = await buildPdfFile(slides, title);
  saveAs(blob, filename);
}
