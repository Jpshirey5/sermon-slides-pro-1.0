import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, Check, ArrowRight } from "lucide-react";
import { setPendingExportContext } from "@/lib/payPerExport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sermonId: string;
  onPaymentComplete: () => void;
  prepareForCheckout?: () => Promise<void> | void;
}

export function PaymentPromptModal({
  isOpen,
  onClose,
  sermonId,
  prepareForCheckout,
}: PaymentPromptModalProps) {
  const handlePayClick = async () => {
    try {
      await prepareForCheckout?.();
      setPendingExportContext(sermonId);

      const { data, error } = await supabase.functions.invoke("create-guest-checkout", {
        body: { origin: window.location.origin, sermonId },
      });

      if (error || !data?.url) {
        throw new Error(error?.message || data?.error || "Could not start checkout");
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Guest checkout failed:", err);
      const msg = err instanceof Error ? err.message : "Could not start checkout. Please try again.";
      toast.error(msg);
      return;
    }
  };

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
              <span className="text-xl font-bold">$15</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Export this presentation to PowerPoint or ProPresenter formats.
            </p>
          </div>
          
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              PowerPoint (.pptx) format
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              ProPresenter 7 (.probundle) format
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              Unlimited downloads for this presentation
            </li>
          </ul>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handlePayClick} className="flex-1">
            <CreditCard className="w-4 h-4 mr-2" />
            Pay $15
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
        
        <p className="text-xs text-center text-muted-foreground">
          Secure payment via Stripe. You'll return here after payment.
        </p>
      </DialogContent>
    </Dialog>
  );
}
