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

  // Handle post-checkout: re-check subscription then clear param
  useEffect(() => {
    if (!isCheckoutSuccess || !user || postCheckoutVerifying) return;

    const verify = async () => {
      setPostCheckoutVerifying(true);
      // Retry up to 5 times with 2s delay to allow webhook processing
      for (let i = 0; i < 5; i++) {
        await checkSubscription();
        // Need to read latest value — use a small delay then re-check
        await new Promise((r) => setTimeout(r, 2000));
        // Re-invoke to get fresh state
        await checkSubscription();
        // We can't read state directly here, so after retries we just clear the param
        // and let the component re-render with updated context
      }
      // Remove the checkout param to prevent re-triggering
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
      setPostCheckoutVerifying(false);
    };

    verify();
  }, [isCheckoutSuccess, user]);

  // Redirect to Stripe if unsubscribed (only after check completes, not during post-checkout)
  useEffect(() => {
    if (
      loading ||
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
  }, [loading, user, subscription.subscribed, allowUnsubscribed, redirecting, session, subscriptionChecked, isCheckoutSuccess, postCheckoutVerifying]);

  if (loading || !subscriptionChecked || redirecting || isCheckoutSuccess || postCheckoutVerifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">
            {redirecting
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
