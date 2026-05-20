// QUICK BUILD ADDITION — client-side text extraction for .docx (mammoth) and .pdf (pdfjs-dist, lazy)

const isPdf = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const isDocx = (file: File) =>
  file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  file.name.toLowerCase().endsWith(".docx");

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buffer = await file.arrayBuffer();
  const result = await (mammoth as any).extractRawText({ arrayBuffer: buffer });
  const value = String(result?.value || "").trim();
  if (!value) throw new Error("No text could be read from the document.");
  return value;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  try {
    const workerModule: any = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    if (workerModule?.default) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    }
  } catch {
    // Fall back: pdfjs may run on the main thread; slower but functional.
  }
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pageTexts.push(text);
  }
  const joined = pageTexts.join("\n\n").trim();
  if (!joined) throw new Error("No text could be extracted from the PDF.");
  return joined;
}

export async function extractText(file: File): Promise<string> {
  if (isDocx(file)) return extractDocx(file);
  if (isPdf(file)) return extractPdf(file);
  throw new Error("Unsupported file type for extraction.");
}
