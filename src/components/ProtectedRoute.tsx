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
  const { user, loading, subscription, subscriptionChecked, session, checkSubscription } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [postCheckoutVerifying, setPostCheckoutVerifying] = useState(false);

  const isCheckoutSuccess = searchParams.get("checkout") === "success";
  const tokenHash = searchParams.get("token_hash");
  const authType = searchParams.get("type");
  const hasHashAccessToken = typeof window !== "undefined" && window.location.hash.includes("access_token=");
  const isAuthCallback = Boolean((tokenHash && authType) || hasHashAccessToken);
  const [authFinalizing, setAuthFinalizing] = useState(isAuthCallback);

  useEffect(() => {
    if (!isAuthCallback) {
      setAuthFinalizing(false);
      return;
    }

    let cancelled = false;

    const finalizeAuthFromEmailLink = async () => {
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

    finalizeAuthFromEmailLink();

    return () => {
      cancelled = true;
    };
  }, [isAuthCallback, tokenHash, authType, searchParams, setSearchParams]);

  // Handle post-checkout: re-check subscription then clear param
  useEffect(() => {
    if (!isCheckoutSuccess || !user || postCheckoutVerifying || authFinalizing) return;

    const verify = async () => {
      setPostCheckoutVerifying(true);
      for (let i = 0; i < 5; i++) {
        await checkSubscription();
        await new Promise((r) => setTimeout(r, 2000));
      }

      const cleanedParams = new URLSearchParams(searchParams.toString());
      cleanedParams.delete("checkout");
      setSearchParams(cleanedParams, { replace: true });
      setPostCheckoutVerifying(false);
    };

    verify();
  }, [isCheckoutSuccess, user, postCheckoutVerifying, authFinalizing, checkSubscription, searchParams, setSearchParams]);

  // Redirect to Stripe if unsubscribed (only after check completes, not during callback/post-checkout)
  useEffect(() => {
    if (
      loading ||
      authFinalizing ||
      !user ||
      allowUnsubscribed ||
      subscription.subscribed ||
      redirecting ||
      !subscriptionChecked ||
      isCheckoutSuccess ||
      postCheckoutVerifying
    ) return;

    const redirectToCheckout = async () => {
      setRedirecting(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
        }
      } catch (err) {
        console.error("Checkout redirect failed:", err);
        setRedirecting(false);
      }
    };

    redirectToCheckout();
  }, [loading, authFinalizing, user, subscription.subscribed, allowUnsubscribed, redirecting, session, subscriptionChecked, isCheckoutSuccess, postCheckoutVerifying]);

  if (loading || authFinalizing || !subscriptionChecked || redirecting || isCheckoutSuccess || postCheckoutVerifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">
            {authFinalizing
              ? "Finalizing your account..."
              : redirecting
              ? "Setting up your subscription..."
              : isCheckoutSuccess || postCheckoutVerifying
              ? "Verifying your subscription..."
              : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!subscription.subscribed && !allowUnsubscribed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Redirecting to checkout...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

