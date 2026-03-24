import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const handleRecovery = async () => {
      // Parse hash fragment for recovery tokens
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (type === "recovery" && accessToken && refreshToken) {
        // Set the session from the recovery tokens
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("Failed to set recovery session:", error);
          toast.error("Invalid or expired reset link.");
          setChecking(false);
          return;
        }

        // Clear the hash from the URL
        window.history.replaceState(null, "", window.location.pathname);
        setReady(true);
        setChecking(false);
        return;
      }

      // Also listen for PASSWORD_RECOVERY event (in case Supabase handles it)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setReady(true);
          setChecking(false);
        }
      });

      // If no hash params, check if there's already a session (user might have been redirected)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
      }
      
      setChecking(false);

      return () => subscription.unsubscribe();
    };

    handleRecovery();
  }, []);

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
        toast.success("Password updated successfully!");
        navigate("/dashboard");
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
