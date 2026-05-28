// QUICK BUILD ADDITION — sequential 6-step progress indicator for manuscript parsing.

import { Check, Loader2 } from "lucide-react";
import { QUICK_BUILD_STEPS } from "@/lib/quick-build/constants";

interface QuickBuildProgressIndicatorProps {
  currentStep: number; // 0-5
}

const QuickBuildProgressIndicator = ({ currentStep }: QuickBuildProgressIndicatorProps) => {
  return (
    <ol className="space-y-3">
      {QUICK_BUILD_STEPS.map((label, index) => {
        const completed = index < currentStep;
        const active = index === currentStep;
        return (
          <li key={label} className="flex items-start gap-3">
            <div
              className={[
                "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs shrink-0",
                completed
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : active
                    ? "border-primary text-primary"
                    : "border-muted-foreground/30 text-muted-foreground",
              ].join(" ")}
            >
              {completed ? (
                <Check className="h-3 w-3" />
              ) : active ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <p
              className={[
                "text-sm",
                completed
                  ? "text-muted-foreground line-through"
                  : active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
              ].join(" ")}
            >
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
};

export default QuickBuildProgressIndicator;
