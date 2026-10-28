// QUICK BUILD ADDITION — prepares the uploaded document for the AI parser.
// PDFs are sent as the actual file (base64) so the model reviews the real document;
// .docx files are converted to HTML (mammoth) so headings, bold, and list nesting
// survive — unlike raw-text extraction, which destroyed the structure.

export type DocumentPayload =
  /** text: the PDF's own words, so verses can be copied from it exactly. Empty if it couldn't be read. */
  | { kind: "pdf"; base64: string; text: string }
  | { kind: "docx"; html: string };

const isPdf = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const isDocx = (file: File) =>
  file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  file.name.toLowerCase().endsWith(".docx");

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      if (!base64) {
        reject(new Error("The file appears to be empty."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

async function extractDocxHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buffer = await file.arrayBuffer();
  // styleMap: mammoth drops underline by default, but pastors often mark sermon
  // points by underlining. Text color is never emitted by mammoth and cannot be
  // recovered — color-based conventions only survive on the PDF path.
  const result = await (mammoth as any).convertToHtml(
    { arrayBuffer: buffer },
    { styleMap: ["u => u"] },
  );
  const html = String(result?.value || "").trim();
  if (!html) throw new Error("No content could be read from the document.");
  return html;
}

/**
 * The words in a PDF, page by page, keeping line breaks. Verse text is copied
 * from this, so it has to be the document's own text. Returns "" for scanned
 * PDFs or anything that can't be read; those verses are marked to paste.
 */
export async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let page = "";
      for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
        page += item.str ?? "";
        if (item.hasEOL) page += "\n";
      }
      pages.push(page);
    }
    return pages.join("\n\n");
  } catch {
    return "";
  }
}

export async function extractDocument(file: File): Promise<DocumentPayload> {
  if (isDocx(file)) return { kind: "docx", html: await extractDocxHtml(file) };
  if (isPdf(file)) {
    const [base64, text] = await Promise.all([fileToBase64(file), extractPdfText(file)]);
    return { kind: "pdf", base64, text };
  }
  throw new Error("Unsupported file type.");
}
