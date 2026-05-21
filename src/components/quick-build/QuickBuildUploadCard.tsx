// QUICK BUILD ADDITION — replaces the dashboard Create New Presentation card with a drag/drop
// manuscript-upload card when the user's mode is "quick_build". For any other mode, renders the
// children passthrough so the structured-builder card is completely unaltered.

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_TRANSLATION } from "@/lib/translations";
import { useAuth } from "@/contexts/AuthContext";
import { useQuickBuildUpload } from "@/hooks/useQuickBuildUpload";
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "@/lib/quick-build/constants";
import { validateFile } from "@/lib/quick-build/validateFile";
import { listAccountCampuses, type Campus } from "@/lib/campuses";
import { logError } from "@/lib/monitoring";
import { toast } from "sonner";
import QuickBuildProgressIndicator from "./QuickBuildProgressIndicator";
import QuickBuildUploadError from "./QuickBuildUploadError";
import type { SermonCreationMode } from "@/lib/quick-build/types";

interface QuickBuildUploadCardProps {
  mode: SermonCreationMode | null;
  dashboardSelectedCampusId: string | null;
  children: ReactNode;
}

const QuickBuildUploadCard = ({ mode, dashboardSelectedCampusId, children }: QuickBuildUploadCardProps) => {
  const navigate = useNavigate();
  const { profile, subscription, accountId } = useAuth();
  const { state, run, reset } = useQuickBuildUpload();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [campusId, setCampusId] = useState<string>("");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusesLoading, setCampusesLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const isQuickBuild = mode === "quick_build";
  const isEnterprise = (subscription?.plan_tier || "").toLowerCase() === "enterprise";

  useEffect(() => {
    if (!isEnterprise || !accountId) {
      setCampuses([]);
      setCampusId("");
      return;
    }

    let cancelled = false;
    setCampusesLoading(true);

    (async () => {
      try {
        const loaded = await listAccountCampuses(accountId);
        if (cancelled) return;
        setCampuses(loaded);
        const preferred =
          dashboardSelectedCampusId || profile?.preferred_dashboard_campus_id || "";
        const matched = preferred && loaded.some((c) => c.id === preferred) ? preferred : "";
        setCampusId(matched || loaded.find((c) => c.isPrimary)?.id || loaded[0]?.id || "");
      } catch (error) {
        logError(error, { scope: "quick_build_load_campuses" });
        if (!cancelled) setCampuses([]);
      } finally {
        if (!cancelled) setCampusesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, dashboardSelectedCampusId, isEnterprise, profile?.preferred_dashboard_campus_id]);

  useEffect(() => {
    if (state.phase === "done" && state.result) {
      const r = state.result;
      const pendingPresentation = {
        id: r.sermon_id,
        title: r.title,
        series: r.series,
        presentationDate: r.presentation_date,
        date: r.presentation_date,
        campusId: r.campus_id,
        formerCampusName: null,
        slides: 0,
        lastModified: "Just now",
        scripture_reference: undefined,
        data: r.form_data,
      };
      navigate(`/dashboard/create/review/${r.sermon_id}`, {
        state: { pendingPresentation },
      });
      setDialogOpen(false);
      reset();
    }
  }, [state.phase, state.result, navigate, reset]);

  const tierLabel = useMemo(() => {
    const tier = (subscription?.plan_tier || "").toLowerCase();
    if (tier === "pro") return "5 uploads / month";
    if (tier === "team") return "15 uploads / month";
    if (tier === "enterprise") return "Unlimited uploads";
    return null;
  }, [subscription?.plan_tier]);

  const showProgress = state.phase !== "idle" && state.phase !== "error";

  if (!isQuickBuild) {
    return <>{children}</>;
  }

  const startWithFile = (file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.errorMessage || "That file isn't supported.");
      return;
    }
    if (isEnterprise && campuses.length > 0 && !campusId) {
      toast.error("Pick a campus before uploading.");
      return;
    }
    setDialogOpen(true);
    void run({
      file,
      translation: profile?.default_translation || DEFAULT_TRANSLATION,
      campusId: campusId || null,
    });
  };

  const handlePickFile = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) startWithFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) startWithFile(file);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      {/* Quick Build card — replaces the structured-builder card entirely while mode is "quick_build" */}
      <div
        className="max-w-2xl mx-auto rounded-3xl glass-panel p-8 mb-14"
        data-tour-id="dashboard-create-button"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-5">
            <UploadCloud className="w-6 h-6 text-primary-foreground" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground mb-2">
            Upload your sermon manuscript
          </h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-xl">
            We&apos;ll pull out the title, series, points, and scripture references to build out your sermon for you. Then drop you
            straight into Sermon Review for revisions.
          </p>

          {isEnterprise && (campuses.length > 0 || campusesLoading) && (
            <div className="w-full max-w-sm text-left mb-5">
              <Label htmlFor="quick-build-card-campus" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Campus
              </Label>
              <Select
                value={campusId}
                onValueChange={setCampusId}
                disabled={campusesLoading || campuses.length === 0}
              >
                <SelectTrigger id="quick-build-card-campus" className="mt-2 h-10">
                  <SelectValue placeholder={campusesLoading ? "Loading campuses..." : "Select a campus"} />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.isPrimary ? `${campus.name} (Primary)` : campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <button
            type="button"
            onClick={handlePickFile}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={[
              "w-full rounded-2xl border-2 border-dashed bg-muted/20 px-6 py-10 text-center transition cursor-pointer",
              dragActive
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary hover:bg-primary/5",
            ].join(" ")}
            aria-label="Upload sermon manuscript"
          >
            <UploadCloud className={`mx-auto h-10 w-10 ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
            <p className="mt-3 text-sm font-medium text-foreground">
              {dragActive ? "Drop to upload" : "Drag a manuscript here, or click to choose"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .docx or .pdf · up to {Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB
            </p>
          </button>

          {tierLabel && (
            <p className="mt-4 text-xs text-muted-foreground">Your plan: {tierLabel}.</p>
          )}
        </div>
      </div>

      {/* Hidden file input triggered by the click area */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={handleInputChange}
      />

      {/* children intentionally not rendered — Quick Build mode owns the card */}
      <div className="hidden">{children}</div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next && showProgress) return; // can't dismiss mid-parse
          setDialogOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {state.phase === "error" ? "We hit a snag" : "Building your sermon"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-left">
              {state.phase === "error"
                ? "Review the issue below and try again."
                : "Hang tight — this usually takes a few seconds."}
            </DialogDescription>
          </DialogHeader>

          {showProgress && (
            <div className="space-y-3">
              <QuickBuildProgressIndicator currentStep={state.step} />
              {state.phase !== "done" && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Please keep this dialog open.
                </p>
              )}
            </div>
          )}

          {state.phase === "error" && state.error && (
            <QuickBuildUploadError
              code={state.error.code}
              message={state.error.message}
              upgradeRequired={state.error.upgradeRequired}
              onRetry={() => {
                setDialogOpen(false);
                reset();
              }}
              onUseStructured={() => {
                setDialogOpen(false);
                reset();
                navigate("/dashboard/create");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuickBuildUploadCard;
