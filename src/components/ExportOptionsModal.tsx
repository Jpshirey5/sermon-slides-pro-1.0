import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Presentation, Download, Loader2 } from "lucide-react";

interface ExportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: "pptx" | "probundle") => void;
  isExporting: boolean;
  title?: string;
  description?: string;
  exportingLabel?: string;
}

export function ExportOptionsModal({
  isOpen,
  onClose,
  onExport,
  isExporting,
  title = "Export Your Presentation",
  description = "Choose your preferred format to download.",
  exportingLabel = "Exporting...",
}: ExportOptionsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isExporting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-4"
            onClick={() => onExport("probundle")}
            disabled={isExporting}
          >
            <Presentation className="w-5 h-5 mr-3 text-purple-500" />
            <div className="text-left">
              <div className="font-medium">ProPresenter (.probundle)</div>
              <div className="text-xs text-muted-foreground">Bundle format with media support for ProPresenter 7+</div>
            </div>
          </Button>
          
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-4"
            onClick={() => onExport("pptx")}
            disabled={isExporting}
          >
            <FileText className="w-5 h-5 mr-3 text-blue-500" />
            <div className="text-left">
              <div className="font-medium">PowerPoint (.pptx)</div>
              <div className="text-xs text-muted-foreground">Compatible with Microsoft PowerPoint</div>
            </div>
          </Button>
        </div>
        
        {isExporting && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {exportingLabel}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
