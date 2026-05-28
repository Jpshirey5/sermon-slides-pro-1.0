import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const TARGET_PATH = "/reset-password";

// Detects a Supabase recovery link that landed on the wrong route (e.g. "/")
// because the email template or redirect allow-list pointed somewhere other than
// /reset-password. Returns true when the current URL carries recovery markers.
const urlHasRecoveryMarkers = () => {
  if (typeof window === "undefined") return false;

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  // token_hash (OTP) recovery link
  if (query.get("type") === "recovery" && query.get("token_hash")) return true;
  // implicit-flow recovery link delivered in the hash fragment
  if (hash.get("type") === "recovery" && hash.get("access_token")) return true;
  // expired/invalid verify link bounced back with an error so we can message it
  if (query.get("error_code") || hash.get("error_code")) return true;

  return false;
};

const RecoveryRedirectHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const redirectToReset = (fromEvent: boolean) => {
      if (location.pathname === TARGET_PATH) return;

      navigate(
        {
          pathname: TARGET_PATH,
          search: window.location.search,
          hash: window.location.hash,
        },
        {
          replace: true,
          state: { fromRecoveryEvent: fromEvent },
        },
      );
    };

    // Catch recovery links that landed on the wrong route before any auth event fires.
    if (urlHasRecoveryMarkers()) {
      redirectToReset(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") {
        return;
      }
      redirectToReset(true);
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, navigate]);

  return null;
};

export default RecoveryRedirectHandler;
