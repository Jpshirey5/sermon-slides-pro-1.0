import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BookOpen } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowUnsubscribed?: boolean;
  allowPendingCheckout?: boolean;
}

const ProtectedRoute = ({ children, allowUnsubscribed = false, allowPendingCheckout = false }: ProtectedRouteProps) => {
  const { user, loading, subscription, subscriptionChecked } = useAuth();

  if (loading) {
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
  const isPendingCheckout = subscription.signup_status === "pending_checkout";

  if (isPendingCheckout && !allowPendingCheckout) {
    const pendingPriceId =
      typeof window !== "undefined" ? localStorage.getItem("pending_pro_checkout_price_id") : null;
    const params = new URLSearchParams();
    if (pendingPriceId) params.set("priceId", pendingPriceId);
    return <Navigate to={`/signup-incomplete${params.toString() ? `?${params.toString()}` : ""}`} replace />;
  }

  if (!subscription.subscribed && !allowUnsubscribed && pendingProCheckout) {
    const pendingPriceId = localStorage.getItem("pending_pro_checkout_price_id");
    const params = new URLSearchParams({ startCheckout: "pro" });
    if (pendingPriceId) params.set("priceId", pendingPriceId);
    return <Navigate to={`/checkout-redirect?${params.toString()}`} replace />;
  }

  if (!subscription.subscribed && !allowUnsubscribed) {
    return <Navigate to="/account?requiredSubscription=1" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
