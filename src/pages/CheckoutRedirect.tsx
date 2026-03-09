import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CheckoutRedirect = () => {
  const navigate = useNavigate();
  const { user, accountId, subscription, subscriptionChecked, checkSubscription } = useAuth();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!user || !accountId || !subscriptionChecked || startedRef.current) return;

    if (subscription.subscribed) {
      localStorage.removeItem("pending_pro_checkout");
      localStorage.removeItem("pending_pro_checkout_email");
      navigate("/dashboard", { replace: true });
      return;
    }

    startedRef.current = true;

    const startCheckout = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Please log in again.");
          navigate("/login", { replace: true });
          return;
        }

        const { data, error } = await supabase.functions.invoke("create-checkout", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error || !data?.url) {
          toast.error("Could not start checkout.");
          navigate("/account", { replace: true });
          return;
        }

        localStorage.removeItem("pending_pro_checkout");
        window.location.href = data.url;
      } catch {
        toast.error("Could not start checkout.");
        navigate("/account", { replace: true });
      }
    };

    startCheckout();
  }, [user, accountId, subscription.subscribed, subscriptionChecked, navigate]);

  useEffect(() => {
    if (!subscription.subscribed) return;
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
          Please wait while we securely redirect you to Stripe.
        </p>
      </div>
    </div>
  );
};

export default CheckoutRedirect;
