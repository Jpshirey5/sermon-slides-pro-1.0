// QUICK BUILD ADDITION — friendly error UI for any phase failure.

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuickBuildErrorCode } from "@/lib/quick-build/types";

interface QuickBuildUploadErrorProps {
  code: QuickBuildErrorCode;
  message: string;
  upgradeRequired?: boolean;
  onRetry?: () => void;
  onUseStructured?: () => void;
}

const QuickBuildUploadError = ({
  code,
  message,
  upgradeRequired,
  onRetry,
  onUseStructured,
}: QuickBuildUploadErrorProps) => {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-foreground">{message}</p>
          <div className="flex flex-wrap gap-2">
            {onRetry && code !== "LIMIT_REACHED" && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Try again
              </Button>
            )}
            {onUseStructured && (
              <Button size="sm" variant="ghost" onClick={onUseStructured}>
                Use Structured Builder
              </Button>
            )}
            {upgradeRequired && (
              <Button size="sm" variant="hero" asChild>
                <a href="/account">Upgrade plan</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickBuildUploadError;
