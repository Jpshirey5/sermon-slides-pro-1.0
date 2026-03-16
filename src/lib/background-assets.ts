import { supabase } from "@/integrations/supabase/client";

const BACKGROUND_BUCKET = "presentation-backgrounds";
const STORAGE_REF_PREFIX = `storage:${BACKGROUND_BUCKET}/`;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getFileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;

  const mime = file.type.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

export function isDataUrlBackground(image?: string | null): boolean {
  return Boolean(image && image.startsWith("data:"));
}

export function isRemoteBackground(image?: string | null): boolean {
  return Boolean(image && /^https?:\/\//i.test(image));
}

export function isStorageBackground(image?: string | null): boolean {
  return Boolean(image && image.startsWith(STORAGE_REF_PREFIX));
}

export function makeStorageBackgroundRef(path: string): string {
  return `${STORAGE_REF_PREFIX}${path}`;
}

export function getStoragePathFromBackgroundRef(image?: string | null): string | null {
  if (!isStorageBackground(image)) return null;
  return image!.slice(STORAGE_REF_PREFIX.length);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read uploaded file."));
    reader.readAsDataURL(file);
  });
}

export async function uploadPresentationBackground(params: {
  file: File;
  accountId: string;
  presentationId: string;
  slideId: string;
}): Promise<string> {
  const { file, accountId, presentationId, slideId } = params;
  const ext = getFileExtension(file);
  const path = `account/${accountId}/sermons/${presentationId}/${slideId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BACKGROUND_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || "Could not upload custom background.");
  }

  return makeStorageBackgroundRef(path);
}

export async function resolveBackgroundImageSource(image?: string): Promise<string | undefined> {
  if (!image) return undefined;
  if (!isStorageBackground(image)) return image;

  const path = getStoragePathFromBackgroundRef(image);
  if (!path) return undefined;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(BACKGROUND_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not resolve background image.");
  }

  const expiresAt = Date.now() + (SIGNED_URL_TTL_SECONDS - 30) * 1000;
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt });
  return data.signedUrl;
}

export async function deleteStoredBackground(image?: string): Promise<void> {
  const path = getStoragePathFromBackgroundRef(image);
  if (!path) return;

  signedUrlCache.delete(path);

  const { error } = await supabase.storage.from(BACKGROUND_BUCKET).remove([path]);
  if (error) {
    console.error("Failed to delete background asset:", error);
  }
}
