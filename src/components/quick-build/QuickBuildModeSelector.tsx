// QUICK BUILD ADDITION — Modal that asks the user to pick between Structured Builder and Quick Build.
// Used both as an onboarding gate (when profile.user_sermon_creation_mode is NULL) and as a
// settings-card "change mode" affordance.

import { useState } from "react";
import { Sparkles, FileText, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSermonCreationMode } from "@/hooks/useSermonCreationMode";
import type { SermonCreationMode } from "@/lib/quick-build/types";

interface QuickBuildModeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "onboarding" | "change";
  onDismissDefault?: SermonCreationMode;
  onChosen?: (mode: SermonCreationMode) => void;
}

const QuickBuildModeSelector = ({
  open,
  onOpenChange,
  variant = "onboarding",
  onDismissDefault = "structured_builder",
  onChosen,
}: QuickBuildModeSelectorProps) => {
  const { setMode } = useSermonCreationMode();
  const [saving, setSaving] = useState<SermonCreationMode | null>(null);

  const handleChoose = async (chosen: SermonCreationMode) => {
    setSaving(chosen);
    try {
      await setMode(chosen);
      onChosen?.(chosen);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your choice.");
    } finally {
      setSaving(null);
    }
  };

  const handleClose = async (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (variant === "onboarding") {
      try {
        await setMode(onDismissDefault);
        onChosen?.(onDismissDefault);
      } catch {
        // silent — they can change later in Account
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {variant === "onboarding" ? "How do you want to build sermons?" : "Change your creation method"}
          </DialogTitle>
          <DialogDescription className="pt-2 text-left">
            {variant === "onboarding"
              ? "Pick the workflow that fits how you already prepare sermons. You can change this anytime in Account."
              : "Switch the workflow used on the dashboard. Your existing presentations are not affected."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void handleChoose("structured_builder")}
            disabled={saving !== null}
            className="text-left rounded-2xl border border-border bg-white p-5 transition hover:border-primary hover:shadow-md disabled:opacity-60"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Structured Builder</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Build your sermon point by point, entering each section manually. Full control over structure.
            </p>
            {saving === "structured_builder" && (
              <p className="mt-3 inline-flex items-center text-xs text-primary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving...
              </p>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleChoose("quick_build")}
            disabled={saving !== null}
            className="text-left rounded-2xl border border-border bg-white p-5 transition hover:border-primary hover:shadow-md disabled:opacity-60"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground">Quick Build</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your sermon outline. We&apos;ll extract your points and scripture automatically.
            </p>
            {saving === "quick_build" && (
              <p className="mt-3 inline-flex items-center text-xs text-primary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving...
              </p>
            )}
          </button>
        </div>

        {variant === "change" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving !== null}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuickBuildModeSelector;
