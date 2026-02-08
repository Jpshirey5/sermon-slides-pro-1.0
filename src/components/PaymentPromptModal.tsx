import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, Check, ArrowRight } from "lucide-react";

const PENDING_SERMON_KEY = "pending_payment_sermon_id";

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
}: PaymentPromptModalProps) {
  const handlePayClick = () => {
    // Save the sermon ID to localStorage so we can redirect back after payment
    localStorage.setItem(PENDING_SERMON_KEY, sermonId);
    
    // Get the payment link from environment
    const paymentLink = import.meta.env.VITE_STRIPE_PAYMENT_LINK;
    
    if (!paymentLink || paymentLink === "https://buy.stripe.com/YOUR_PAYMENT_LINK") {
      console.error("Stripe Payment Link not configured");
      alert("Payment is not configured yet. Please contact support.");
      return;
    }
    
    // Navigate to Stripe Payment Link in same tab
    window.location.href = paymentLink;
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
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handlePayClick} className="flex-1">
            <CreditCard className="w-4 h-4 mr-2" />
            Pay $9
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
