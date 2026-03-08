import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"
];

const SignUp = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);

  // Invite state
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);

  useEffect(() => {
    if (!inviteToken) return;

    const lookupInvite = async () => {
      setInviteLoading(true);
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: inviteToken });
      if (error || !data || data.length === 0) {
        toast.error("Invalid or expired invite link.");
        setInviteLoading(false);
        return;
      }
      const invite = data[0];
      // Get org name from accounts
      const { data: accountData } = await supabase
        .from("accounts_public")
        .select("name")
        .eq("id", invite.account_id)
        .single();
      
      setInviteValid(true);
      setInviteOrgName(accountData?.name || "Organization");
      setEmail(invite.email);
      setInviteLoading(false);
    };

    lookupInvite();
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (!inviteValid && (!orgName || !city || !state)) {
      toast.error("Please fill in your organization details.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const metadata: Record<string, string> = { full_name: fullName };
      if (inviteValid && inviteToken) {
        metadata.invite_token = inviteToken;
      } else {
        metadata.org_name = orgName;
        metadata.org_city = city;
        metadata.org_state = state;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        if (error.message?.toLowerCase().includes("already registered")) {
          toast.error("This email is already registered. Please log in instead.");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Account created! Confirm your email to continue straight to subscription setup.");
        navigate("/login");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (inviteLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verifying invite...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">SermonSlides</span>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
          <div className="rounded-2xl bg-card border border-border p-8 shadow-elevated">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-7 h-7 text-primary-foreground" />
              </div>
              <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Create Account</h1>
              <p className="text-muted-foreground">
                {inviteValid
                  ? `You've been invited to join ${inviteOrgName}`
                  : "Sign up to get started with SermonSlides"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" type="text" placeholder="John Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@church.org" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required disabled={inviteValid} />
              </div>

              {/* Organization fields — only show if NOT joining via invite */}
              {!inviteValid && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization / Church Name</Label>
                    <Input id="orgName" type="text" placeholder="First Baptist Church" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="h-12" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" type="text" placeholder="Dallas" value={city} onChange={(e) => setCity(e.target.value)} className="h-12" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <select
                        id="state"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        required
                      >
                        <option value="">Select...</option>
                        {US_STATES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {inviteValid && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-sm text-foreground font-medium">Organization: {inviteOrgName}</p>
                  <p className="text-xs text-muted-foreground mt-1">You'll be added as a member of this organization.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" required />
              </div>

              <Button variant="hero" className="w-full" size="lg" type="submit" disabled={loading}>
                {loading ? "Creating Account..." : "Sign Up"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-sm text-primary hover:underline">
                Already have an account? Log in
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default SignUp;
