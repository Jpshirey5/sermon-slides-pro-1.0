// QUICK BUILD ADDITION — prepares the uploaded document for the AI parser.
// PDFs are sent as the actual file (base64) so the model reviews the real document;
// .docx files are converted to HTML (mammoth) so headings, bold, and list nesting
// survive — unlike raw-text extraction, which destroyed the structure.

export type DocumentPayload =
  | { kind: "pdf"; base64: string }
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

export async function extractDocument(file: File): Promise<DocumentPayload> {
  if (isDocx(file)) return { kind: "docx", html: await extractDocxHtml(file) };
  if (isPdf(file)) return { kind: "pdf", base64: await fileToBase64(file) };
  throw new Error("Unsupported file type.");
}
