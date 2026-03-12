import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowUnsubscribed?: boolean;
}

const ProtectedRoute = ({ children, allowUnsubscribed = false }: ProtectedRouteProps) => {
  const { user, loading, subscription, subscriptionChecked, checkSubscription } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tokenHash = searchParams.get("token_hash");
  const authType = searchParams.get("type");
  const hasHashAccessToken = typeof window !== "undefined" && window.location.hash.includes("access_token=");
  const isAuthCallback = Boolean((tokenHash && authType) || hasHashAccessToken);
  const [authFinalizing, setAuthFinalizing] = useState(isAuthCallback);

  // Handle email confirmation callback
  useEffect(() => {
    if (!isAuthCallback) {
      setAuthFinalizing(false);
      return;
    }

    let cancelled = false;

    const finalizeAuth = async () => {
      try {
        if (tokenHash && authType) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: authType as any,
          });

          const cleanedParams = new URLSearchParams(searchParams.toString());
          cleanedParams.delete("token_hash");
          cleanedParams.delete("type");
          cleanedParams.delete("next");
          setSearchParams(cleanedParams, { replace: true });
        }

        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (err) {
        console.error("Auth callback finalization failed:", err);
      } finally {
        if (!cancelled) setAuthFinalizing(false);
      }
    };

    finalizeAuth();
    return () => { cancelled = true; };
  }, [isAuthCallback, tokenHash, authType, searchParams, setSearchParams]);

  if (loading || authFinalizing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">
            {authFinalizing ? "Finalizing your account..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!subscriptionChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const pendingProCheckout = typeof window !== "undefined" && localStorage.getItem("pending_pro_checkout") === "true";
  if (!subscription.subscribed && !allowUnsubscribed && pendingProCheckout) {
    const pendingPriceId = localStorage.getItem("pending_pro_checkout_price_id");
    const params = new URLSearchParams({ startCheckout: "pro" });
    if (pendingPriceId) params.set("priceId", pendingPriceId);
    return <Navigate to={`/checkout-redirect?${params.toString()}`} replace />;
  }

  // No more auto-redirect to Stripe. If unsubscribed and not allowed, show message.
  if (!subscription.subscribed && !allowUnsubscribed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground">Subscription Required</h2>
          <p className="text-muted-foreground">
            You need an active Pro subscription to access the dashboard. Visit our homepage to subscribe.
          </p>
          <a href="/#pricing" className="text-primary hover:underline font-medium">
            View Pricing
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
