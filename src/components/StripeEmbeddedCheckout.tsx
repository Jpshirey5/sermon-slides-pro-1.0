import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

// Initialize Stripe with publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

interface StripeEmbeddedCheckoutProps {
  sermonId: string;
  onComplete: () => void;
}

export function StripeEmbeddedCheckout({ sermonId, onComplete }: StripeEmbeddedCheckoutProps) {
  // Fetch the client secret from the edge function
  const fetchClientSecret = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { sermon_id: sermonId }
    });
    
    if (error || !data?.clientSecret) {
      console.error('Failed to create checkout session:', error);
      throw new Error(error?.message || 'Failed to create checkout session');
    }
    
    return data.clientSecret;
  }, [sermonId]);

  const options = {
    fetchClientSecret,
    onComplete,
  };

  return (
    <div className="min-h-[400px] w-full">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout className="w-full" />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

// Loading fallback component
export function CheckoutLoading() {
  return (
    <div className="min-h-[400px] w-full flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Loading payment form...</p>
      </div>
    </div>
  );
}
