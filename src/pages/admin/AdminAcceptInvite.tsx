import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/auth/PasswordInput";
import { supabase } from "@/integrations/supabase/client";
import { adminApi } from "@/lib/admin-api";
import { buildAppUrl } from "@/lib/site-url";
import { toast } from "sonner";

const AdminAcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Sermon Slide Pro | Admin Center";
    return () => {
      document.title = "Sermon Slide Pro";
    };
  }, []);

  const acceptInvite = async () => {
    await adminApi("admin_invite_accept", { token });
    toast.success("Admin invite accepted.");
    navigate("/admin", { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      toast.error("Invite token is missing.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              admin_invite_token: token,
            },
            emailRedirectTo: buildAppUrl(`/admin/accept-invite?token=${encodeURIComponent(token)}`),
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your admin login, then return to this invite link.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
      }

      await acceptInvite();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept admin invite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl glass-panel p-8 shadow-elevated">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Accept Admin Invite</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in or create an admin-only login.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <Button variant={mode === "signin" ? "hero" : "outline"} onClick={() => setMode("signin")}>Sign In</Button>
          <Button variant={mode === "signup" ? "hero" : "outline"} onClick={() => setMode("signup")}>Create Login</Button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <Button type="submit" variant="hero" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Invite"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/admin/login" className="text-sm text-primary hover:underline">Back to admin login</Link>
        </div>
      </div>
    </div>
  );
};

export default AdminAcceptInvite;
