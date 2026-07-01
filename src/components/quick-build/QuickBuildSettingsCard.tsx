// QUICK BUILD ADDITION — Account-page accordion card for switching between Structured Builder
// and Quick Build modes. Reuses QuickBuildModeSelector in its "change" variant.

import { useState } from "react";
import { FileText, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSermonCreationMode } from "@/hooks/useSermonCreationMode";
import QuickBuildModeSelector from "./QuickBuildModeSelector";

const QuickBuildSettingsCard = () => {
  const { mode } = useSermonCreationMode();
  const [open, setOpen] = useState(false);

  const isQuickBuild = mode === "quick_build";
  const Icon = isQuickBuild ? Sparkles : FileText;
  const label = isQuickBuild ? "Quick Build" : "Structured Builder";
  const description = isQuickBuild
    ? "Upload your sermon outline. We extract your points and scripture automatically."
    : "Build your sermon point by point, entering each section manually. Full control over structure.";

  return (
    <div
      id="account-creation-method"
      className="rounded-2xl border border-border/70 bg-white/70 p-5"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-foreground">Creation Method</h3>
        </div>
        <div className="rounded-xl border border-border/70 bg-white p-4">
          <p className="text-sm font-medium text-foreground">Current mode: {label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-xl border border-dashed border-border/70 p-4 text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">Structured Builder</span> — fill in each
            section by hand.
          </p>
          <p>
            <span className="font-medium text-foreground">Quick Build</span> — upload an outline
            and let us extract the structure.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Change creation method
        </Button>
      </div>
      <QuickBuildModeSelector open={open} onOpenChange={setOpen} variant="change" />
    </div>
  );
};

export default QuickBuildSettingsCard;
