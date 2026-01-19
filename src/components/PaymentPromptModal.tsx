import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, Loader2 } from "lucide-react";

interface PaymentPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToPayment: () => void;
  isLoading: boolean;
}

export function PaymentPromptModal({
  isOpen,
  onClose,
  onProceedToPayment,
  isLoading,
}: PaymentPromptModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Export Your Presentation
          </DialogTitle>
          <DialogDescription>
            Unlock export for this presentation with a one-time payment.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">One-time Export Access</span>
              <span className="text-xl font-bold">$9</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Export this presentation to PowerPoint or ProPresenter formats.
            </p>
          </div>
          
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              PowerPoint (.pptx) format
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              ProPresenter 7 (.probundle) format
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              ProPresenter 6 (.rtf) format
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Unlimited downloads for this presentation
            </li>
          </ul>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onProceedToPayment} className="flex-1" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay $9
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
