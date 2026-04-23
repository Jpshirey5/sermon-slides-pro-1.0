import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const ConfirmEmailChange = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirming your new email...");

  useEffect(() => {
    let cancelled = false;

    const confirmEmailChange = async () => {
      const token = searchParams.get("token");
      if (!token) {
        if (!cancelled) {
          setStatus("error");
          setMessage("This email change link is missing required details. Please request a new confirmation link.");
        }
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("confirm-email-change", {
          body: { token },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Could not confirm the new email.");
        }

        if (!cancelled) {
          setStatus("success");
          setMessage("Your new email is confirmed. Taking you to the right place now...");
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const destination = sessionData.session
          ? "/account?emailChanged=1"
          : "/login?next=%2Faccount&emailChanged=1";

        window.setTimeout(() => {
          if (!cancelled) navigate(destination, { replace: true });
        }, 900);
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            error instanceof Error && error.message
              ? error.message
              : "We couldn't confirm your new email. Please request a fresh confirmation link.",
          );
        }
      }
    };

    void confirmEmailChange();

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

        {status === "loading" && (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-4" />
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Confirming your new email</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Email confirmed</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Email change link issue</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild variant="hero">
                <Link to="/login">Go to Log In</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/account">Back to Account</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ConfirmEmailChange;
