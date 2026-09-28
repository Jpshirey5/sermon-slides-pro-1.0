import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logError, trackEvent } from "@/lib/monitoring";
import { safeHandoffDestination, savePartnerHandoff } from "@/lib/partner-handoff";

// Read and strip the fragment on the first effect run, so the one-time
// token_hash is out of the address bar and history before any network call.
// The redemption is memoized per token so StrictMode's double effect can't
// redeem it twice, while a later handoff in the same page still works.
let lastFragment: URLSearchParams | null = null;
let redemption: { tokenHash: string; promise: Promise<{ error: Error | null }> } | null = null;

const takeFragment = () => {
  if (window.location.hash.length > 1) {
    lastFragment = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
  }
  return lastFragment ?? new URLSearchParams();
};

const redeem = (tokenHash: string) => {
  if (redemption?.tokenHash !== tokenHash) {
    redemption = {
      tokenHash,
      promise: supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "magiclink" })
        .then(({ error }) => ({ error: error ?? null })),
    };
  }
  return redemption.promise;
};

const PartnerHandoff = () => {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fragment = takeFragment();
    const tokenHash = fragment.get("token_hash");
    const partnerName = fragment.get("partner") || "your church software";

    if (!tokenHash) {
      navigate("/login?handoff=expired", { replace: true });
      return;
    }

    redeem(tokenHash)
      .then(({ error }) => {
        if (cancelled) return;
        lastFragment = null;
        if (error) throw error;
        savePartnerHandoff({
          partnerName,
          deckId: fragment.get("deck"),
          canReturn: fragment.get("can_return") === "1",
        });
        trackEvent("partner_handoff_succeeded", { hasDeck: Boolean(fragment.get("deck")) });
        navigate(safeHandoffDestination(fragment.get("next")), { replace: true });
      })
      .catch((error) => {
        if (cancelled) return;
        lastFragment = null;
        logError(error, { scope: "partner_handoff" });
        trackEvent("partner_handoff_failed", { reason: error instanceof Error ? error.message : "unknown_error" });
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl glass-panel p-8 shadow-elevated text-center">
        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-7 h-7 text-primary-foreground" />
        </div>
        {failed ? (
          <>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">This link has already been used</h1>
            <p className="text-muted-foreground mb-6">
              Go back to your church software and click the Sermon Slide Pro button again to open a fresh link.
            </p>
            <Button asChild variant="outline">
              <Link to="/login">Log in to Sermon Slide Pro directly</Link>
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-4" />
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Opening Sermon Slide Pro</h1>
            <p className="text-muted-foreground">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PartnerHandoff;
