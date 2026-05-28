import { useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordRequirements from "@/components/auth/PasswordRequirements";
import { isPasswordStrong } from "@/lib/password";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) {
        setReady(true);
        setChecking(false);
      }
    });

    const handleRecovery = async () => {
      const tokenHash = searchParams.get("token_hash");
      const queryType = searchParams.get("type");
      const code = searchParams.get("code");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const recoveryState = (location.state as { fromRecoveryEvent?: boolean } | null)?.fromRecoveryEvent;

      // Supabase bounces expired/invalid verify links back with an error code.
      const errorCode = searchParams.get("error_code") ?? hashParams.get("error_code");
      if (errorCode) {
        toast.error(
          errorCode === "otp_expired"
            ? "This reset link has expired. Please request a new one."
            : "This reset link is invalid. Please request a new one.",
        );
        if (!cancelled) {
          setReady(false);
          setChecking(false);
        }
        return;
      }

      if (queryType === "recovery" && tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (error) {
          console.error("Failed to verify recovery token:", error);
          toast.error("Invalid or expired reset link.");
          if (!cancelled) {
            setChecking(false);
          }
          return;
        }

        window.history.replaceState(null, "", window.location.pathname);
        if (!cancelled) {
          setReady(true);
          setChecking(false);
        }
        return;
      }

      // PKCE-flow recovery link arrives as ?code=... and is exchanged for a session.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("Failed to exchange recovery code:", error);
          toast.error("Invalid or expired reset link.");
          if (!cancelled) {
            setChecking(false);
          }
          return;
        }

        window.history.replaceState(null, "", window.location.pathname);
        if (!cancelled) {
          setReady(true);
          setChecking(false);
        }
        return;
      }

      // Parse hash fragment for recovery tokens
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");

      if (type === "recovery" && accessToken && refreshToken) {
        // Set the session from the recovery tokens
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("Failed to set recovery session:", error);
          toast.error("Invalid or expired reset link.");
          if (!cancelled) {
            setChecking(false);
          }
          return;
        }

        // Clear the hash from the URL
        window.history.replaceState(null, "", window.location.pathname);
        if (!cancelled) {
          setReady(true);
          setChecking(false);
        }
        return;
      }

      if (recoveryState) {
        if (!cancelled) {
          setReady(true);
          setChecking(false);
        }
        return;
      }

      if (!cancelled) {
        setReady(false);
        setChecking(false);
      }
    };

    void handleRecovery();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [location.state, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error("Passwords do not match."); return; }
    if (!isPasswordStrong(password)) { toast.error("Password must meet all requirements."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
      } else {
        // End the recovery session so the user logs in fresh with the new password
        // instead of landing straight in their account.
        await supabase.auth.signOut();
        navigate("/login?passwordReset=1", { replace: true });
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted-foreground">Verifying reset link...</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Invalid or expired reset link.</p>
          <Button variant="outline" onClick={() => navigate("/forgot-password")}>Request New Link</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex flex-col items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="rounded-2xl glass-panel p-8 shadow-elevated">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Set New Password</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <PasswordInput id="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" required />
              <PasswordRequirements password={password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <PasswordInput id="confirmPassword" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" required />
            </div>
            <Button variant="hero" className="w-full" size="lg" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
