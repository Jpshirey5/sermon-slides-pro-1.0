import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logError, trackEvent } from "@/lib/monitoring";
import { toast } from "sonner";

const CHECKOUT_URL_STORAGE_KEY = "pending_pro_checkout_url";

const SignupIncomplete = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signOut } = useAuth();
  const [loadingAction, setLoadingAction] = useState<"continue" | "exit" | null>(null);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const getSelectedPriceId = (metadataPriceId?: unknown) =>
    searchParams.get("priceId") ||
    localStorage.getItem("pending_pro_checkout_price_id") ||
    (typeof metadataPriceId === "string" ? metadataPriceId : undefined);

  const continueCheckout = async () => {
    setLoadingAction("continue");
    try {
      const storedUrl = localStorage.getItem(CHECKOUT_URL_STORAGE_KEY);
      if (storedUrl) {
        trackEvent("signup_checkout_continue", { source: "stored_url" });
        window.location.href = storedUrl;
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again to continue checkout.");
        navigate("/login", { replace: true });
        return;
      }

      const priceId = getSelectedPriceId(session.user.user_metadata?.signup_checkout_price_id);
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: priceId ? { priceId } : undefined,
      });

      if (error || !data?.url) {
        throw new Error(error?.message || data?.error || "Could not restart checkout");
      }

      localStorage.setItem(CHECKOUT_URL_STORAGE_KEY, data.url);
      trackEvent("signup_checkout_continue", { source: "new_session", hasPriceId: Boolean(priceId) });
      window.location.href = data.url;
    } catch (error) {
      logError(error, { scope: "signup_incomplete_continue" });
      toast.error("Could not restart checkout. Please try again.");
      setLoadingAction(null);
    }
  };

  const exitSignup = async () => {
    setLoadingAction("exit");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.functions.invoke("abandon-signup", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) throw error;
      }

      localStorage.removeItem("pending_pro_checkout");
      localStorage.removeItem("pending_pro_checkout_email");
      localStorage.removeItem("pending_pro_checkout_price_id");
      localStorage.removeItem(CHECKOUT_URL_STORAGE_KEY);
      trackEvent("signup_checkout_abandoned");
      await signOut({ userInitiated: false });
      navigate("/", { replace: true });
    } catch (error) {
      logError(error, { scope: "signup_incomplete_exit" });
      toast.error("Could not exit signup cleanly. Please contact support if this continues.");
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl glass-panel p-8 shadow-elevated text-center">
        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-5">
          <BookOpen className="w-7 h-7 text-primary-foreground" />
        </div>
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
          You haven't completed signup yet
        </h1>
        <p className="text-muted-foreground mb-8">
          If you leave now, you'll need to start the signup process over.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="hero"
            className="flex-1"
            onClick={continueCheckout}
            disabled={Boolean(loadingAction)}
          >
            {loadingAction === "continue" && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue checkout
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={exitSignup}
            disabled={Boolean(loadingAction)}
          >
            {loadingAction === "exit" && <Loader2 className="h-4 w-4 animate-spin" />}
            Exit signup
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SignupIncomplete;
