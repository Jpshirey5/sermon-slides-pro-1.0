import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getPendingCheckoutPath, getPostConfirmPath } from "@/lib/site-url";
import { logError, trackEvent } from "@/lib/monitoring";

const AuthConfirm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("We couldn't confirm your email. Please try the link again or request a new one.");

  useEffect(() => {
    let cancelled = false;

    const finalizeConfirmation = async () => {
      const tokenHash = searchParams.get("token_hash");
      const authType = searchParams.get("type") as EmailOtpType | null;

      if (!tokenHash || !authType) {
        trackEvent("email_confirmation_failed", { reason: "missing_token_or_type" });
        if (!cancelled) {
          setErrorMessage("This confirmation link is missing required details. Request a fresh confirmation email and try again.");
          setStatus("error");
        }
        return;
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: authType,
        });

        if (error) {
          throw error;
        }

        let currentSession = null;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const { data } = await supabase.auth.getSession();
          currentSession = data.session;
          if (currentSession) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        if (!currentSession) {
          throw new Error("Your email was confirmed, but we could not establish a session. Please log in to continue.");
        }

        const metadata = currentSession.user.user_metadata ?? {};
        const storedPendingCheckout = typeof window !== "undefined" && localStorage.getItem("pending_pro_checkout") === "true";
        const storedPriceId = typeof window !== "undefined" ? localStorage.getItem("pending_pro_checkout_price_id") : null;
        const metadataPriceId =
          typeof metadata.signup_checkout_price_id === "string" ? metadata.signup_checkout_price_id : null;
        const metadataIntent = typeof metadata.signup_intent === "string" ? metadata.signup_intent : null;
        const intent = storedPendingCheckout ? "checkout" : metadataIntent;
        const shouldStartCheckout =
          authType !== "invite" &&
          (intent === "checkout" || (authType === "signup" && metadataIntent !== "dashboard"));

        const destination =
          authType === "invite"
            ? "/signup?invite=complete"
            : shouldStartCheckout
              ? getPendingCheckoutPath(storedPriceId ?? metadataPriceId)
              : getPostConfirmPath(intent, storedPriceId ?? metadataPriceId);

        trackEvent("email_confirmation_succeeded", {
          intent: authType === "invite" ? "invite" : (intent ?? "dashboard"),
          destination,
        });

        if (!cancelled) {
          navigate(destination, { replace: true });
        }
      } catch (error) {
        logError(error, { scope: "auth_confirm" });
        trackEvent("email_confirmation_failed", {
          reason: error instanceof Error ? error.message : "unknown_error",
        });
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error && error.message
              ? error.message
              : "We couldn't confirm your email. Please request a fresh confirmation email and try again.",
          );
          setStatus("error");
        }
      }
    };

    finalizeConfirmation();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl glass-panel p-8 shadow-elevated text-center">
        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-7 h-7 text-primary-foreground" />
        </div>

        {status === "loading" ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-4" />
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Confirming your email</h1>
            <p className="text-muted-foreground">
              Please wait while we verify your account and send you to the right next step.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Confirmation link issue</h1>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild variant="hero">
                <Link to="/login">Go to Log In</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/signup">Back to Sign Up</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthConfirm;
