import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Sparkles, Zap, Users, Loader2 } from 'lucide-react';
import { useAuth, STRIPE_CONFIG } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sermonId?: string;
  onExport?: () => void;
}

export function PricingModal({ open, onOpenChange, sermonId, onExport }: PricingModalProps) {
  const { user, session, tier, subscriptionStatus } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<'pay' | 'unlimited' | null>(null);

  // If already subscribed, just export
  if (subscriptionStatus.subscribed && onExport) {
    onExport();
    onOpenChange(false);
    return null;
  }

  const handlePayPerSermon = async () => {
    setIsLoading('pay');
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
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to create payment session');
    } finally {
      setIsLoading(null);
    }
  };

  const handleUnlimited = async () => {
    // If not logged in, redirect to signup
    if (!user) {
      navigate('/signup?plan=unlimited');
      onOpenChange(false);
      return;
    }

    setIsLoading('unlimited');
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to create checkout session');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-center">
            Choose Your Export Option
          </DialogTitle>
          <DialogDescription className="text-center">
            Export your sermon slides to PowerPoint or ProPresenter
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          {/* Pay Per Sermon */}
          <div className="relative p-6 rounded-2xl bg-card border border-border hover:border-primary/20 transition-all">
            <div className="mb-4">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-semibold">Pay Per Sermon</h3>
              <p className="text-muted-foreground text-sm mt-1">
                One-time payment for this export
              </p>
            </div>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="font-serif text-4xl font-bold">${STRIPE_CONFIG.payPerSermon.price}</span>
              <span className="text-muted-foreground">one-time</span>
            </div>

            <ul className="space-y-3 mb-6">
              {[
                'Export to PowerPoint & ProPresenter',
                'Full editor access',
                'No account required',
                'Download immediately after payment',
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full"
              onClick={handlePayPerSermon}
              disabled={isLoading !== null}
            >
              {isLoading === 'pay' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Pay $9 & Export'
              )}
            </Button>
          </div>

          {/* Unlimited Plan */}
          <div className="relative p-6 rounded-2xl bg-card border-2 border-primary shadow-elevated">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full gradient-gold text-accent-foreground text-sm font-medium">
                <Sparkles className="w-3 h-3" />
                Best Value
              </div>
            </div>

            <div className="mb-4">
              <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-serif text-xl font-semibold">Unlimited Plan</h3>
              <p className="text-muted-foreground text-sm mt-1">
                For churches & ministry teams
              </p>
            </div>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="font-serif text-4xl font-bold">${STRIPE_CONFIG.unlimited.price}</span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <ul className="space-y-3 mb-6">
              {[
                'Unlimited sermon exports',
                'Save & organize sermon library',
                'Team collaboration (up to 5 users)',
                'Shared templates & assets',
                'Priority support',
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="hero"
              className="w-full"
              onClick={handleUnlimited}
              disabled={isLoading !== null}
            >
              {isLoading === 'unlimited' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : user ? (
                'Subscribe & Export'
              ) : (
                'Sign Up & Subscribe'
              )}
            </Button>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Secure payment powered by Stripe. Cancel anytime.
        </p>
      </DialogContent>
    </Dialog>
  );
}
