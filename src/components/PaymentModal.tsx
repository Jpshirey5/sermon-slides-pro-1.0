import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Lock, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sermonId?: string;
}

export function PaymentModal({ open, onOpenChange, sermonId }: PaymentModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      console.log('[PaymentModal] Creating payment session for sermon:', sermonId);
      
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          sermonId,
          returnUrl: window.location.origin,
        },
      });

      console.log('[PaymentModal] Response:', { data, error });

      if (error) throw error;
      
      if (data?.url) {
        console.log('[PaymentModal] Opening Stripe in new tab:', data.url);
        // Open Stripe in new tab - presentation is already saved in localStorage
        window.open(data.url, '_blank');
        onOpenChange(false);
        setIsLoading(false);
      } else {
        throw new Error('No checkout URL received from payment service');
      }
    } catch (error) {
      console.error('[PaymentModal] Payment error:', error);
      toast.error('Failed to create payment session. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-2xl">
            <Lock className="w-5 h-5 text-primary" />
            Unlock Export
          </DialogTitle>
          <DialogDescription>
            Your slides are ready! Pay once to export this presentation. After payment, return to this tab to download.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">One-time payment</span>
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold text-foreground">$9</span>
            </div>
            <p className="text-muted-foreground mt-2">per presentation export</p>
          </div>

          <div className="space-y-3 mb-6">
            <p className="text-sm font-medium text-foreground">Includes:</p>
            <ul className="space-y-2">
              {[
                'PowerPoint (.pptx) export',
                'ProPresenter 7 (.pro) export',
                'ProPresenter 6 (.rtf) export',
                'Immediate download after payment',
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <Button 
            variant="hero" 
            className="w-full" 
            size="lg"
            onClick={handlePayment}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>Pay $9 & Export</>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-4">
            Secure payment via Stripe. A new tab will open for checkout.<br />
            Return to this tab after payment to download your files.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
