import JSZip from "jszip";
import { saveAs } from "file-saver";
import { buildPowerPointFile } from "@/lib/export-pptx";
import { getEditorPresentationState, type SermonPresentation } from "@/lib/presentations";
import { generateSlidesFromPresentation } from "@/lib/slide-generation";
import { buildProBundleFile, validateSlidesForExport } from "@/services/proPresenterExport";

export interface BulkExportResult {
  exportedCount: number;
  failed: Array<{ title: string; reason: string }>;
}

function buildPresentationFromState(state: Awaited<ReturnType<typeof getEditorPresentationState>>): SermonPresentation | null {
  if (!state) return null;
  if (!state.formData) return null;

  const presentationDate =
    state.presentationDate ||
    state.formData.date ||
    state.createdAt?.split("T")[0] ||
    new Date().toISOString().split("T")[0];

  return {
    id: state.id,
    title: state.title,
    series: state.series || state.formData.series || null,
    presentationDate,
    date: presentationDate,
    slides: state.editorSlides?.length || 0,
    lastModified: state.updatedAt
      ? new Date(state.updatedAt).toLocaleDateString()
      : new Date().toLocaleDateString(),
    scripture_reference: state.scriptureReference,
    data: state.formData,
  };
}

export async function exportPresentationsAsZip(
  presentationIds: string[],
  format: "pptx" | "probundle"
): Promise<BulkExportResult> {
  const zip = new JSZip();
  const failed: BulkExportResult["failed"] = [];
  let exportedCount = 0;

  for (const presentationId of presentationIds) {
    try {
      const state = await getEditorPresentationState(presentationId);
      if (!state) {
        failed.push({ title: `Presentation ${presentationId}`, reason: "Presentation could not be loaded." });
        continue;
      }

      const generatedPresentation = buildPresentationFromState(state);
      const slides =
        state.editorSlides && state.editorSlides.length > 0 && state.editorSlides[0]?.id
          ? state.editorSlides
          : generatedPresentation
            ? generateSlidesFromPresentation(generatedPresentation)
            : [];

      const validation = validateSlidesForExport(slides);
      if (!validation.isValid) {
        failed.push({
          title: state.title || `Presentation ${presentationId}`,
          reason: validation.errors.join(" "),
        });
        continue;
      }

      const file =
        format === "pptx"
          ? await buildPowerPointFile(slides, state.title)
          : await buildProBundleFile(slides, state.title);

      zip.file(file.filename, file.blob);
      exportedCount += 1;
    } catch (error) {
      failed.push({
        title: `Presentation ${presentationId}`,
        reason: error instanceof Error ? error.message : "Export failed.",
      });
    }
  }

  if (exportedCount === 0) {
    throw new Error(failed[0]?.reason || "No presentations could be exported.");
  }

  const archive = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().split("T")[0];
  saveAs(archive, `sermon-exports-${stamp}.zip`);

  return {
    exportedCount,
    failed,
  };
}
