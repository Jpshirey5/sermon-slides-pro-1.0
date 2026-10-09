// PARTNER API — background image resolution for server-side exports.
// Only two sources are honoured: the app's own presentation-backgrounds bucket
// (storage:presentation-backgrounds/<path>, read with the service role) and
// inline data: URLs. Arbitrary http(s) URLs are never fetched server-side, so a
// slide cannot turn the export worker into an SSRF proxy; those slides fall
// back to their background color, as the browser export does on fetch failure.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { Buffer } from "node:buffer";

export interface ResolvedImage {
  bytes: Uint8Array;
  extension: string;
  dataUrl: string;
}

const BACKGROUND_BUCKET = "presentation-backgrounds";
const STORAGE_REF_PREFIX = `storage:${BACKGROUND_BUCKET}/`;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const extensionFor = (mime: string) => {
  const subtype = mime.split("/")[1]?.split(";")[0]?.toLowerCase() || "jpeg";
  return subtype === "jpeg" ? "jpg" : subtype in MIME_BY_EXTENSION ? subtype : "jpg";
};

const fromBytes = (bytes: Uint8Array, mime: string): ResolvedImage => {
  const extension = extensionFor(mime);
  const normalizedMime = MIME_BY_EXTENSION[extension];
  return {
    bytes,
    extension,
    dataUrl: `data:${normalizedMime};base64,${Buffer.from(bytes).toString("base64")}`,
  };
};

export const createImageResolver = (db: SupabaseClient) => {
  const cache = new Map<string, Promise<ResolvedImage | null>>();

  const resolve = async (ref: string): Promise<ResolvedImage | null> => {
    try {
      const dataMatch = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(ref);
      if (dataMatch) {
        const bytes = Uint8Array.from(Buffer.from(dataMatch[2], "base64"));
        return bytes.byteLength > MAX_IMAGE_BYTES ? null : fromBytes(bytes, dataMatch[1]);
      }

      if (ref.startsWith(STORAGE_REF_PREFIX)) {
        const path = ref.slice(STORAGE_REF_PREFIX.length);
        const { data, error } = await db.storage.from(BACKGROUND_BUCKET).download(path);
        if (error || !data || data.size > MAX_IMAGE_BYTES) return null;
        return fromBytes(new Uint8Array(await data.arrayBuffer()), data.type || "image/jpeg");
      }
    } catch (error) {
      console.warn("[PARTNER-API] Background image unavailable for export", String(error));
    }
    return null;
  };

  return (ref: string) => {
    if (!cache.has(ref)) cache.set(ref, resolve(ref));
    return cache.get(ref)!;
  };
};
