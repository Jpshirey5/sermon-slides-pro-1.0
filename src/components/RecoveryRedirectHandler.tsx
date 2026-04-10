import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const RecoveryRedirectHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") {
        return;
      }

      const targetPath = "/reset-password";
      const currentSearch = typeof window !== "undefined" ? window.location.search : "";
      const currentHash = typeof window !== "undefined" ? window.location.hash : "";

      if (location.pathname === targetPath) {
        return;
      }

      navigate(
        {
          pathname: targetPath,
          search: currentSearch,
          hash: currentHash,
        },
        {
          replace: true,
          state: { fromRecoveryEvent: true },
        },
      );
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, navigate]);

  return null;
};

export default RecoveryRedirectHandler;
