import { useState, Suspense } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, Check, ArrowLeft } from "lucide-react";
import { StripeEmbeddedCheckout, CheckoutLoading } from "@/components/StripeEmbeddedCheckout";

interface PaymentPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sermonId: string;
  onPaymentComplete: () => void;
}

export function PaymentPromptModal({
  isOpen,
  onClose,
  sermonId,
  onPaymentComplete,
}: PaymentPromptModalProps) {
  const [showCheckout, setShowCheckout] = useState(false);

  const handleClose = () => {
    setShowCheckout(false);
    onClose();
  };

  const handleComplete = () => {
    setShowCheckout(false);
    onPaymentComplete();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={showCheckout ? "sm:max-w-2xl" : "sm:max-w-md"}>
        {!showCheckout ? (
          <>
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
                  <Check className="w-4 h-4 text-primary" />
                  PowerPoint (.pptx) format
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  ProPresenter 7 (.probundle) format
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Plain text (.txt) format
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Unlimited downloads for this presentation
                </li>
              </ul>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={() => setShowCheckout(true)} className="flex-1">
                <CreditCard className="w-4 h-4 mr-2" />
                Pay $9
              </Button>
            </div>
            
            <p className="text-xs text-center text-muted-foreground">
              Secure payment via Stripe. No account required.
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowCheckout(false)}
                  className="mr-2 -ml-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                Complete Payment
              </DialogTitle>
              <DialogDescription>
                Enter your payment details to unlock exports.
              </DialogDescription>
            </DialogHeader>
            
            <Suspense fallback={<CheckoutLoading />}>
              <StripeEmbeddedCheckout 
                sermonId={sermonId} 
                onComplete={handleComplete} 
              />
            </Suspense>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
