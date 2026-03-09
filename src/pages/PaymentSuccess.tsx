import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertTriangle, BookOpen } from "lucide-react";
import { getPendingExportSermonId, getPendingExportSnapshot } from "@/lib/payPerExport";
import { getPresentation, saveEditorSlides, savePresentation } from "@/lib/presentations";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolveAndRedirect = async () => {
      const snapshot = getPendingExportSnapshot();
      const pendingSermonId =
        getPendingExportSermonId() ||
        searchParams.get("sermonId") ||
        snapshot?.sermonId ||
        null;

      if (pendingSermonId) {
        let presentation = await getPresentation(pendingSermonId);

        // Rehydrate from pending snapshot if storage lookup failed.
        if (!presentation && snapshot && snapshot.sermonId === pendingSermonId) {
          const today = new Date().toISOString().split("T")[0];
          await savePresentation({
            id: pendingSermonId,
            title: snapshot.title || "Sermon Presentation",
            date: today,
            slides: Array.isArray(snapshot.slides) ? snapshot.slides.length : 0,
            lastModified: "Just now",
            data: {
              title: snapshot.title || "Sermon Presentation",
              date: today,
              translation: "KJV",
              verseBreakdown: "full-verses",
              points: [],
            },
          });
          if (Array.isArray(snapshot.slides) && snapshot.slides.length > 0) {
            await saveEditorSlides(pendingSermonId, snapshot.slides);
          }
          presentation = await getPresentation(pendingSermonId);
        }

        if (presentation?.id) {
          navigate(`/editor/${presentation.id}?payment=success`, { replace: true });
          return;
        }
      }

      // Last attempt: rebuild from snapshot only.
      if (snapshot?.sermonId) {
        const today = new Date().toISOString().split("T")[0];
        const restoredId = await savePresentation({
          id: snapshot.sermonId,
          title: snapshot.title || "Sermon Presentation",
          date: today,
          slides: Array.isArray(snapshot.slides) ? snapshot.slides.length : 0,
          lastModified: "Just now",
          data: {
            title: snapshot.title || "Sermon Presentation",
            date: today,
            translation: "KJV",
            verseBreakdown: "full-verses",
            points: [],
          },
        });
        if (restoredId) {
          if (Array.isArray(snapshot.slides) && snapshot.slides.length > 0) {
            await saveEditorSlides(restoredId, snapshot.slides);
          }
          navigate(`/editor/${restoredId}?payment=success`, { replace: true });
          return;
        }
      }

      setError(
        "Payment succeeded, but we could not restore your presentation automatically. Use Return to Create and regenerate your slides."
      );
    };

    resolveAndRedirect();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-panel rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive mx-auto mb-4 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground mb-2">Restore Needed</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate("/create", { replace: true })}
              className="inline-flex items-center justify-center rounded-full px-5 h-11 bg-primary text-primary-foreground font-medium hover:opacity-90"
            >
              Return to Create
            </button>
            <button
              onClick={() => navigate("/dashboard", { replace: true })}
              className="inline-flex items-center justify-center rounded-full px-5 h-11 border border-border text-foreground hover:bg-muted"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-primary-foreground" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-muted-foreground">Payment successful! Restoring your presentation...</p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
