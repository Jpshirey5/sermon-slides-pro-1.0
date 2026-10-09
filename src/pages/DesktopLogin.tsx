// The desktop app's only signed-out screen: the logo, the name, and sign in.
// Accounts are created on the website; links here open it in the browser.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/auth/PasswordInput";
import { WEBSITE_URL } from "@/desktop/routes";
import { supabase } from "@/integrations/supabase/client";
import { logError, trackEvent } from "@/lib/monitoring";
import { consumeStoredLogoutReason } from "@/lib/session-security";

/** Opens in the person's browser (the desktop app sends outside links there). */
const openWebsite = (path: string) => window.open(`${WEBSITE_URL}${path}`, "_blank", "noopener");

const DesktopLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sermon Slide Pro";
    trackEvent("login_viewed", { surface: "desktop" });
    const reason = consumeStoredLogoutReason();
    if (reason === "inactive") toast.error("You were signed out after 15 minutes of inactivity.");
    if (reason === "security") toast.error("You were signed out for security. Sign in again to continue.");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) {
        trackEvent("login_failed", { surface: "desktop", reason: signInError.message });
        setError(signInError.message === "Invalid login credentials" ? "That email and password don't match. Try again." : signInError.message);
        return;
      }
      trackEvent("login_succeeded", { surface: "desktop" });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      logError(err, { scope: "desktop_login_submit" });
      setError("Something went wrong. Check the internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full gradient-hero shadow-glow" aria-hidden>
            <BookOpen className="h-12 w-12 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Sermon Slide Pro</h1>
          <p className="mt-2 text-sm text-neutral-400">Sign in to run your services.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="desktop-email" className="text-neutral-300">Email</Label>
            <Input
              id="desktop-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="pastor@yourchurch.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 border-neutral-700 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="desktop-password" className="text-neutral-300">Password</Label>
              <button type="button" className="text-xs text-neutral-400 hover:text-neutral-200" onClick={() => openWebsite("/forgot-password")}>
                Forgot password?
              </button>
            </div>
            <PasswordInput
              id="desktop-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 border-neutral-700 bg-neutral-900 text-neutral-100"
            />
          </div>
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          <Button type="submit" variant="hero" className="h-11 w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Log in
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-neutral-500">
          New to Sermon Slide Pro?{" "}
          <button type="button" className="text-neutral-300 underline-offset-4 hover:underline" onClick={() => openWebsite("/signup")}>
            Create an account on the website
          </button>
        </p>
      </div>
    </div>
  );
};

export default DesktopLogin;
