// Images and videos for services. Images (backgrounds, graphics) go to the
// existing presentation-backgrounds bucket, the same place the slide editor
// keeps them. Videos go to the private service-media bucket and are listed in
// service_media. Everything stays inside the church's own folder.

import { supabase } from "@/integrations/supabase/client";
import { ensureResolvedAccountAccess } from "@/lib/account-access";
import { uploadPresentationBackground } from "@/lib/background-assets";

const VIDEO_BUCKET = "service-media";
const VIDEO_URL_TTL_SECONDS = 6 * 60 * 60;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

export type DroppedFileKind = "image" | "video" | "unsupported";

export function classifyFile(file: Pick<File, "type" | "name">): DroppedFileKind {
  const type = file.type.toLowerCase();
  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  if (["mp4", "m4v", "mov", "webm"].includes(ext)) return "video";
  return "unsupported";
}

/** Why a file can't be used, in plain language, or null if it's fine. */
export function fileProblem(file: Pick<File, "type" | "name" | "size">): string | null {
  const kind = classifyFile(file);
  if (kind === "unsupported") return `${file.name} isn't a picture or video we can use. Try PNG, JPG, MP4, or MOV.`;
  if (kind === "image" && file.size > MAX_IMAGE_BYTES) return `${file.name} is larger than 10 MB. Try a smaller picture.`;
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) return `${file.name} is larger than 1 GB. Try a shorter or smaller video.`;
  return null;
}

async function requireAccountId(): Promise<{ accountId: string; userId: string | null }> {
  const access = await ensureResolvedAccountAccess();
  if (!access.accountId) throw new Error("You need to be signed in to a church account.");
  return { accountId: access.accountId, userId: access.userId };
}

/** Upload a background or graphic. Returns the storage ref slides keep. */
export async function uploadSlideImage(file: File, serviceId: string, slideId: string): Promise<string> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  const { accountId } = await requireAccountId();
  return uploadPresentationBackground({ file, accountId, presentationId: `service-${serviceId}`, slideId });
}

export interface MediaItem {
  id: string;
  fileName: string;
  storagePath: string;
  durationSeconds: number | null;
  sizeBytes: number;
  createdAt: string;
}

/** Read a video's length and size in the browser before uploading. */
export function probeVideo(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve({ duration: null, width: null, height: null });
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (r: { duration: number | null; width: number | null; height: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done({ duration: null, width: null, height: null }), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done({
        duration: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    };
    video.onerror = () => {
      clearTimeout(timer);
      done({ duration: null, width: null, height: null });
    };
    video.src = url;
  });
}

/** Upload a video to the church's library. Returns the new media id. */
export async function uploadVideo(file: File): Promise<string> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  if (classifyFile(file) !== "video") throw new Error(`${file.name} isn't a video.`);
  const { accountId, userId } = await requireAccountId();
  const meta = await probeVideo(file);
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `account/${accountId}/${crypto.randomUUID()}.${ext}`;
  const contentType = VIDEO_TYPES.includes(file.type) ? file.type : ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";

  const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file, { contentType, upsert: false, cacheControl: "86400" });
  if (uploadError) {
    const tooBig = /exceed|too large|payload/i.test(uploadError.message);
    throw new Error(tooBig ? "That video is larger than your storage plan allows. Raise the upload limit in Supabase, or use a smaller file." : uploadError.message);
  }

  const { data, error } = await supabase
    .from("service_media")
    .insert({
      account_id: accountId,
      kind: "video",
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: contentType,
      size_bytes: file.size,
      duration_seconds: meta.duration,
      width: meta.width,
      height: meta.height,
      created_by_user_id: userId,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(VIDEO_BUCKET).remove([path]).catch(() => undefined);
    throw new Error(`Could not save the video: ${error.message}`);
  }
  return (data as { id: string }).id;
}

export async function listVideos(): Promise<MediaItem[]> {
  const { accountId } = await requireAccountId();
  const { data, error } = await supabase
    .from("service_media")
    .select("id, file_name, storage_path, duration_seconds, size_bytes, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load videos: ${error.message}`);
  return ((data ?? []) as { id: string; file_name: string; storage_path: string; duration_seconds: number | null; size_bytes: number; created_at: string }[]).map((r) => ({
    id: r.id,
    fileName: r.file_name,
    storagePath: r.storage_path,
    durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    sizeBytes: Number(r.size_bytes),
    createdAt: r.created_at,
  }));
}

const videoUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** A playable link for a stored video, good for several hours. */
export async function videoUrl(storagePath: string): Promise<string> {
  const cached = videoUrlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(storagePath, VIDEO_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not load the video.");
  videoUrlCache.set(storagePath, { url: data.signedUrl, expiresAt: Date.now() + (VIDEO_URL_TTL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
}
