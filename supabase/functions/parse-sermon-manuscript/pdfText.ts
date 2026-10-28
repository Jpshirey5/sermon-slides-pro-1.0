// Read the words out of an uploaded PDF on the server, so verses can be copied
// from it. The browser normally sends this text along with the PDF; this is the
// backup when it doesn't (an older app version, or a browser that couldn't read
// it). Scanned PDFs have no words to read and return "".

import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const TIME_LIMIT_MS = 15_000;

export async function readPdfText(bytes: Uint8Array, maxChars: number): Promise<string> {
  const read = (async () => {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n\n") : text).slice(0, maxChars);
  })();
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(""), TIME_LIMIT_MS));
  try {
    return await Promise.race([read, timeout]);
  } catch {
    return "";
  }
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
