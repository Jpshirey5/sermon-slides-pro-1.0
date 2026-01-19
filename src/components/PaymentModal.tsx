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
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          sermonId,
          returnUrl: window.location.origin,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
        toast.info('Complete payment in the new tab to unlock export');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to create payment session. Please try again.');
    } finally {
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
            Your slides are ready! Pay once to export this presentation.
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
            Secure payment via Stripe. No account required.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
