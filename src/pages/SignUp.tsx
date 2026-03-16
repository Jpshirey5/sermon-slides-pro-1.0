import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookOpen, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordRequirements from "@/components/auth/PasswordRequirements";
import { isPasswordStrong } from "@/lib/password";
import SubscriptionPlanPicker from "@/components/SubscriptionPlanPicker";
import { getPlanByPriceId, SUBSCRIPTION_PLANS, type BillingInterval } from "@/lib/subscriptionPlans";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"
];

type SignupNotice = {
  title: string;
  description: string;
  onContinue?: () => void;
};

const SignUp = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const selectedPriceId = searchParams.get("priceId");
  const nextPath = searchParams.get("next");
  const preselectedPlan = getPlanByPriceId(selectedPriceId);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [planLoading, setPlanLoading] = useState<BillingInterval | null>(null);
  const [notice, setNotice] = useState<SignupNotice | null>(null);

  // Invite state
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);

  const showNotice = (title: string, description: string, onContinue?: () => void) => {
    setNotice({ title, description, onContinue });
  };

  const handleNoticeContinue = () => {
    const onContinue = notice?.onContinue;
    setNotice(null);
    onContinue?.();
  };

  useEffect(() => {
    if (!inviteToken) return;

    const lookupInvite = async () => {
      setInviteLoading(true);
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: inviteToken });
      if (error || !data || data.length === 0) {
        showNotice("Invite unavailable", "This invite link is invalid or has expired.");
        setInviteLoading(false);
        return;
      }
      const invite = data[0];
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

  const validateForm = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    if (!trimmedName || !normalizedEmail || !password || !confirmPassword) {
      showNotice("Missing details", "Please fill in all fields.");
      return null;
    }
    if (!inviteValid && (!orgName || !city || !state)) {
      showNotice("Organization details needed", "Please fill in your organization details.");
      return null;
    }
    if (password !== confirmPassword) {
      showNotice("Passwords do not match", "Please make sure both password fields match before continuing.");
      return null;
    }
    if (!isPasswordStrong(password)) {
      showNotice("Password requirements", "Your password must meet all listed requirements before you can continue.");
      return null;
    }

    return { normalizedEmail, trimmedName };
  };

  const createAccount = async (selectedBillingInterval?: BillingInterval) => {
    const validated = validateForm();
    if (!validated) return;

    const { normalizedEmail, trimmedName } = validated;
    setLoading(true);
    try {
      const metadata: Record<string, string> = { full_name: trimmedName };
      if (inviteValid && inviteToken) {
        metadata.invite_token = inviteToken;
      } else {
        metadata.org_name = orgName.trim() || "My Church";
        metadata.org_city = city.trim();
        metadata.org_state = state;
      }

      const selectedPlanConfig = selectedBillingInterval ? SUBSCRIPTION_PLANS[selectedBillingInterval] : preselectedPlan;
      const checkoutParams = new URLSearchParams({ startCheckout: "pro" });
      if (selectedPlanConfig?.priceId) checkoutParams.set("priceId", selectedPlanConfig.priceId);

      const emailRedirectTo = !inviteValid
        ? `${window.location.origin}/checkout-redirect?${checkoutParams.toString()}`
        : `${window.location.origin}/dashboard`;

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: metadata,
          emailRedirectTo,
        },
      });

      if (error) {
        const message = error.message?.toLowerCase() || "";
        if (message.includes("already registered") || message.includes("already exists") || message.includes("user already registered")) {
          showNotice("Email already registered", "This email is already registered. Please log in instead.");
        } else {
          showNotice("Signup error", error.message);
        }
      } else if (!inviteValid) {
        localStorage.setItem("pending_pro_checkout", "true");
        localStorage.setItem("pending_pro_checkout_email", normalizedEmail);
        localStorage.setItem("pending_pro_checkout_price_id", selectedPlanConfig!.priceId);
        showNotice(
          "Confirm your email",
          "Your account has been created. Confirm your email to continue to secure Pro checkout.",
          () => navigate("/login"),
        );
      } else if (inviteValid) {
        if (signUpData?.session) {
          showNotice("Invite accepted", "Your invite has been accepted. Continue to your dashboard.", () => navigate("/dashboard"));
        } else {
          showNotice(
            "Confirm your email",
            "Your invite has been accepted. Check your email to confirm your account, then continue to log in.",
            () => navigate("/login"),
          );
        }
      } else {
        showNotice(
          "Account created",
          "Check your email to confirm your account, then continue to log in and access your dashboard.",
          () => navigate(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"),
        );
      }
    } catch {
      showNotice("Unexpected error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
      setPlanLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteValid) {
      await createAccount();
      return;
    }

    const validated = validateForm();
    if (!validated) return;

    if (preselectedPlan) {
      await createAccount(preselectedPlan.id);
      return;
    }

    setShowPlanSelection(true);
  };

  const handleSelectPlan = async (interval: BillingInterval) => {
    setPlanLoading(interval);
    await createAccount(interval);
  };

  if (inviteLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying invite...</p>
        </div>
      </div>
    );
  }

  const isEmailLocked = inviteValid;

  return (
    <div className="app-shell flex flex-col">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">Sermon Slide Pro</span>
            </Link>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
          <div className="rounded-2xl glass-panel p-8 shadow-elevated">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-7 h-7 text-primary-foreground" />
              </div>
              <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Create Account</h1>
              <p className="text-muted-foreground">
                {inviteValid
                  ? `You've been invited to join ${inviteOrgName}`
                  : showPlanSelection
                  ? "Choose your billing plan to finish setting up your account."
                  : "Create your account to continue to secure Pro checkout."}
              </p>
            </div>

            {!inviteValid && !showPlanSelection && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-6">
                <p className="text-sm text-foreground font-medium">Paid account setup</p>
                <p className="text-xs text-muted-foreground mt-1">All new accounts require a Pro subscription. After you confirm your email, we’ll send you to secure checkout.</p>
              </div>
            )}

            {showPlanSelection ? (
              <div className="space-y-4">
                <SubscriptionPlanPicker
                  title="Choose Your Pro Plan"
                  description="Select monthly or yearly billing to finish creating your account."
                  onSelectPlan={handleSelectPlan}
                  loadingInterval={planLoading}
                />
                <Button variant="outline" className="w-full" onClick={() => setShowPlanSelection(false)} disabled={loading}>
                  Back to Account Details
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" type="text" placeholder="John Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@church.org" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required disabled={isEmailLocked} />
                </div>

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
                  <PasswordInput id="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" required />
                  <PasswordRequirements password={password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <PasswordInput id="confirmPassword" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" required />
                </div>

                <Button variant="hero" className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading ? "Creating Account..." : inviteValid ? "Sign Up" : preselectedPlan ? `Continue with ${preselectedPlan.label}` : "Continue to Plan Selection"}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link to={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} className="text-sm text-primary hover:underline">
                Already have an account? Log in
              </Link>
            </div>
          </div>
        </motion.div>
      </main>

      <AlertDialog open={!!notice}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{notice?.title}</AlertDialogTitle>
            <AlertDialogDescription>{notice?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleNoticeContinue}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SignUp;
