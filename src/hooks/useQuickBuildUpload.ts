// QUICK BUILD ADDITION — orchestrates file validation, extraction, parse request, progress state.

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validateFile } from "@/lib/quick-build/validateFile";
import { extractDocument, type DocumentPayload } from "@/lib/quick-build/extractText";
import type {
  QuickBuildErrorCode,
  QuickBuildResponse,
  QuickBuildSuccessResponse,
} from "@/lib/quick-build/types";

export type QuickBuildPhase =
  | "idle"
  | "uploading"
  | "reading"
  | "parsing"
  | "validating"
  | "building"
  | "done"
  | "error";

export interface QuickBuildState {
  phase: QuickBuildPhase;
  step: number; // 0-5 (used by the indicator)
  error: { code: QuickBuildErrorCode; message: string; upgradeRequired: boolean } | null;
  result: QuickBuildSuccessResponse | null;
}

const PHASE_STEPS: Record<Exclude<QuickBuildPhase, "idle" | "error">, number> = {
  uploading: 0,
  reading: 1,
  parsing: 2,
  validating: 3,
  building: 4,
  done: 5,
};

export interface RunUploadOptions {
  file: File;
  translation: string;
  campusId: string | null;
}

export function useQuickBuildUpload() {
  const [state, setState] = useState<QuickBuildState>({
    phase: "idle",
    step: 0,
    error: null,
    result: null,
  });
  const fakeTimerRef = useRef<number | null>(null);

  const setPhase = useCallback((phase: Exclude<QuickBuildPhase, "error">) => {
    setState((prev) => ({ ...prev, phase, step: PHASE_STEPS[phase] ?? prev.step }));
  }, []);

  const clearTimer = useCallback(() => {
    if (fakeTimerRef.current !== null) {
      clearTimeout(fakeTimerRef.current);
      fakeTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setState({ phase: "idle", step: 0, error: null, result: null });
  }, [clearTimer]);

  const failWith = useCallback(
    (code: QuickBuildErrorCode, message: string, upgradeRequired = false) => {
      clearTimer();
      setState({
        phase: "error",
        step: 0,
        error: { code, message, upgradeRequired },
        result: null,
      });
    },
    [clearTimer],
  );

  const run = useCallback(
    async ({ file, translation, campusId }: RunUploadOptions): Promise<QuickBuildResponse | null> => {
      clearTimer();

      // Phase 1 — client-side validation framed as "Uploading"
      const validation = validateFile(file);
      if (!validation.valid) {
        failWith(validation.errorCode || "INVALID_FILE", validation.errorMessage || "Invalid file");
        return null;
      }
      setPhase("uploading");

      // Phase 2 — prepare the document for the AI parser
      // (PDFs go up as the actual file; .docx as structure-preserving HTML)
      setPhase("reading");
      let document: DocumentPayload;
      try {
        document = await extractDocument(file);
      } catch (err) {
        failWith(
          "EXTRACTION_FAILED",
          err instanceof Error
            ? `We couldn't read your file. ${err.message}`
            : "We couldn't read your file. Try saving it in a different format and uploading again.",
        );
        return null;
      }

      // Phase 3 — auth + parse network call (we fake the visual phase 4/5 transitions)
      setPhase("parsing");
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        failWith("AUTH_FAILED", "You need to be signed in to use Quick Build.");
        return null;
      }

      // Simulated sub-step transitions so the user sees progress while we wait on the edge fn.
      fakeTimerRef.current = window.setTimeout(() => setPhase("validating"), 1200);

      const documentBody =
        document.kind === "pdf"
          ? { file_base64: document.base64, media_type: "application/pdf" }
          : { manuscript_html: document.html };

      const { data, error } = await supabase.functions.invoke<QuickBuildResponse>(
        "parse-sermon-manuscript",
        {
          body: {
            ...documentBody,
            file_name: file.name,
            file_size_bytes: file.size,
            translation,
            campus_id: campusId,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      let payload: QuickBuildResponse | null = data || null;
      if (error) {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            payload = (await ctx.json()) as QuickBuildResponse;
          } catch {
            payload = null;
          }
        }
      }

      clearTimer();
      if (!payload) {
        failWith("INTERNAL", error?.message || "We couldn't reach the server. Try again.");
        return null;
      }
      if (!payload.success) {
        failWith(
          payload.error_code,
          payload.error_message,
          Boolean((payload as any).upgrade_required),
        );
        return payload;
      }

      const successPayload = payload as QuickBuildSuccessResponse;
      if (successPayload.warnings?.length) {
        toast.warning(
          `${successPayload.warnings.length} scripture reference${successPayload.warnings.length === 1 ? "" : "s"} couldn't be validated and may be missing — please double-check in Sermon Review.`,
          { duration: 8000 },
        );
      }

      setPhase("building");
      // brief pause so the "Building" label registers visually before navigation
      await new Promise((resolve) => setTimeout(resolve, 400));
      setPhase("done");
      setState((prev) => ({ ...prev, result: payload as QuickBuildSuccessResponse }));
      return payload;
    },
    [clearTimer, failWith, setPhase],
  );

  return { state, run, reset };
}
