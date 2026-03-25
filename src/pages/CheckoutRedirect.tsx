import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logError, trackEvent } from "@/lib/monitoring";

const CheckoutRedirect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, accountId, subscription, subscriptionChecked, checkSubscription } = useAuth();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!user || !accountId || !subscriptionChecked || startedRef.current) return;

    if (subscription.subscribed) {
      trackEvent("checkout_bypassed_existing_subscription");
      localStorage.removeItem("pending_pro_checkout");
      localStorage.removeItem("pending_pro_checkout_email");
      localStorage.removeItem("pending_pro_checkout_price_id");
      navigate("/dashboard", { replace: true });
      return;
    }

    startedRef.current = true;

    const startCheckout = async () => {
      try {
        const requestedPriceId =
          searchParams.get("priceId") || localStorage.getItem("pending_pro_checkout_price_id");
        trackEvent("checkout_started", {
          source: "checkout_redirect",
          hasRequestedPriceId: Boolean(requestedPriceId),
        });
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          trackEvent("checkout_failed", { reason: "missing_session" });
          toast.error("Please log in again.");
          navigate("/login", { replace: true });
          return;
        }

        const { data, error } = await supabase.functions.invoke("create-checkout", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: requestedPriceId ? { priceId: requestedPriceId } : undefined,
        });

        if (error || !data?.url) {
          trackEvent("checkout_failed", { reason: error?.message || "missing_checkout_url" });
          toast.error("Could not start checkout.");
          navigate("/account", { replace: true });
          return;
        }

        trackEvent("checkout_redirected_to_stripe");
        localStorage.removeItem("pending_pro_checkout");
        localStorage.removeItem("pending_pro_checkout_price_id");
        window.location.href = data.url;
      } catch (error) {
        logError(error, { scope: "checkout_redirect_start" });
        toast.error("Could not start checkout.");
        navigate("/account", { replace: true });
      }
    };

    startCheckout();
  }, [user, accountId, subscription.subscribed, subscriptionChecked, navigate, searchParams]);

  useEffect(() => {
    if (!subscription.subscribed) return;
    trackEvent("subscription_detected_active");
    checkSubscription();
  }, [subscription.subscribed, checkSubscription]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-primary-foreground" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <h1 className="font-serif text-2xl font-semibold text-foreground">Preparing Checkout</h1>
        <p className="text-muted-foreground">
          Please wait while we securely redirect you to Stripe to activate your subscription.
        </p>
      </div>
    </div>
  );
};

export default CheckoutRedirect;
