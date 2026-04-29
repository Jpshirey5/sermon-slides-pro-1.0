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
import { BookOpen, ArrowLeft, Loader2, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordRequirements from "@/components/auth/PasswordRequirements";
import { isPasswordStrong } from "@/lib/password";
import SubscriptionPlanPicker from "@/components/SubscriptionPlanPicker";
import { getPlanById, getPlanByPriceId, type SubscriptionPlanId } from "@/lib/subscriptionPlans";
import { logError, trackEvent } from "@/lib/monitoring";
import { markDeferredDashboardMessages, startProductTour } from "@/lib/product-tour";
import { buildAppUrl } from "@/lib/site-url";

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
  const inviteParam = searchParams.get("invite");
  const legacyInviteToken = inviteParam && inviteParam !== "complete" ? inviteParam : null;
  const isInviteCompletionMode = inviteParam === "complete";
  const selectedPriceId = searchParams.get("priceId");
  const nextPath = searchParams.get("next");
  const preselectedPlan = getPlanByPriceId(selectedPriceId);
  const requiresPlanFirst = !inviteParam && !preselectedPlan;

  const [fullName, setFullName] = useState("");
  const [churchRole, setChurchRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [planLoading, setPlanLoading] = useState<SubscriptionPlanId | null>(null);
  const [notice, setNotice] = useState<SignupNotice | null>(null);

  // Invite state
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteParam));

  const showNotice = (title: string, description: string, onContinue?: () => void) => {
    setNotice({ title, description, onContinue });
  };

  const handleNoticeContinue = () => {
    const onContinue = notice?.onContinue;
    setNotice(null);
    onContinue?.();
  };

  useEffect(() => {
    trackEvent("signup_viewed", {
      invited: Boolean(inviteParam),
      inviteMode: isInviteCompletionMode ? "complete" : legacyInviteToken ? "legacy" : "none",
      hasPreselectedPlan: Boolean(preselectedPlan),
      nextPath: nextPath || "/dashboard",
    });
  }, [inviteParam, isInviteCompletionMode, legacyInviteToken, nextPath, preselectedPlan]);

  useEffect(() => {
    if (!legacyInviteToken) return;

    const lookupInvite = async () => {
      setInviteLoading(true);
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: legacyInviteToken });
      if (error || !data || data.length === 0) {
        trackEvent("invite_lookup_failed", { reason: error?.message || "not_found" });
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
      trackEvent("invite_lookup_succeeded");
      setInviteLoading(false);
    };

    lookupInvite().catch((error) => {
      logError(error, { scope: "invite_lookup" });
      setInviteLoading(false);
    });
  }, [legacyInviteToken]);

  useEffect(() => {
    if (!isInviteCompletionMode) return;

    let cancelled = false;

    const loadInviteCompletionContext = async () => {
      setInviteLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const invitedUser = sessionData.session?.user ?? null;

      if (!invitedUser) {
        trackEvent("invite_completion_context_failed", { reason: "missing_session" });
        if (!cancelled) {
          showNotice(
            "Invite session expired",
            "Please use your invite email again so we can finish setting up your account.",
            () => navigate("/login"),
          );
          setInviteLoading(false);
        }
        return;
      }

      let nextAccountId: string | null = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data } = await supabase.rpc("get_user_account_id", { _user_id: invitedUser.id });
        if (data) {
          nextAccountId = data;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const [{ data: accountData }, { data: profileData }] = await Promise.all([
        nextAccountId
          ? supabase.from("accounts_public").select("name").eq("id", nextAccountId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("profiles").select("full_name, church_role").eq("id", invitedUser.id).maybeSingle(),
      ]);

      if (!cancelled) {
        setInviteValid(true);
        setInviteOrgName(accountData?.name || "Your organization");
        setEmail(invitedUser.email || "");
        setFullName(profileData?.full_name || "");
        setChurchRole(profileData?.church_role || "");
        setInviteLoading(false);
      }

      trackEvent("invite_completion_context_loaded", {
        hasAccount: Boolean(nextAccountId),
      });

      if (!nextAccountId && !cancelled) {
        showNotice(
          "Finishing your invite",
          "Your invite was confirmed. Your organization access is still finishing in the background, so the signup page may take a moment to fully reflect it.",
        );
      }
    };

    loadInviteCompletionContext().catch((error) => {
      logError(error, { scope: "invite_completion_context" });
      if (!cancelled) {
        setInviteLoading(false);
        showNotice(
          "Invite setup issue",
          "We couldn't finish preparing your invited account. Please try the invite link again or log in to continue.",
          () => navigate("/login"),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isInviteCompletionMode, navigate]);

  const validateForm = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    const trimmedChurchRole = churchRole.trim();

    if (!trimmedName || !trimmedChurchRole || !normalizedEmail || !password || !confirmPassword) {
      trackEvent("signup_validation_failed", { reason: "missing_details", invited: inviteValid });
      showNotice("Missing details", "Please fill in all fields.");
      return null;
    }
    if (!inviteValid && (!orgName || !city || !state)) {
      trackEvent("signup_validation_failed", { reason: "missing_organization_details", invited: inviteValid });
      showNotice("Organization details needed", "Please fill in your organization details.");
      return null;
    }
    if (password !== confirmPassword) {
      trackEvent("signup_validation_failed", { reason: "password_mismatch", invited: inviteValid });
      showNotice("Passwords do not match", "Please make sure both password fields match before continuing.");
      return null;
    }
    if (!isPasswordStrong(password)) {
      trackEvent("signup_validation_failed", { reason: "weak_password", invited: inviteValid });
      showNotice("Password requirements", "Your password must meet all listed requirements before you can continue.");
      return null;
    }

    return { normalizedEmail, trimmedName, trimmedChurchRole };
  };

  const completeInvitedAccount = async () => {
    const validated = validateForm();
    if (!validated) return;

    const { trimmedName, normalizedEmail, trimmedChurchRole } = validated;
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const invitedUser = sessionData.session?.user ?? null;

      if (!invitedUser) {
        showNotice("Invite session expired", "Please use your invite email again so we can finish setting up your account.", () => navigate("/login"));
        return;
      }

      const { error: updateUserError } = await supabase.auth.updateUser({
        password,
        data: {
          ...invitedUser.user_metadata,
          full_name: trimmedName,
          church_role: trimmedChurchRole,
        },
      });

      if (updateUserError) {
        throw updateUserError;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedName,
          church_role: trimmedChurchRole,
          email: normalizedEmail,
        })
        .eq("id", invitedUser.id);

      if (profileError) {
        throw profileError;
      }

      await supabase.auth.refreshSession();
      startProductTour(invitedUser.id);
      markDeferredDashboardMessages(invitedUser.id);
      trackEvent("invite_completion_succeeded", { invited: true });
      showNotice(
        "Account ready",
        "Your name and login have been set up. Continue to your dashboard.",
        () => navigate("/dashboard"),
      );
    } catch (error) {
      logError(error, { scope: "invite_completion_submit" });
      showNotice(
        "Could not finish setup",
        error instanceof Error && error.message
          ? error.message
          : "We couldn't finish creating your invited account. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async (selectedPlanId?: SubscriptionPlanId) => {
    if (isInviteCompletionMode) {
      await completeInvitedAccount();
      return;
    }

    const validated = validateForm();
    if (!validated) return;

    const { normalizedEmail, trimmedName, trimmedChurchRole } = validated;
    const selectedPlanConfig = selectedPlanId ? getPlanById(selectedPlanId) : preselectedPlan;
    if (!inviteValid && !selectedPlanConfig) {
      trackEvent("signup_validation_failed", { reason: "missing_subscription_plan", invited: false });
      showNotice("Choose a subscription plan", "Please choose a subscription plan before creating your account.");
      return;
    }

    setLoading(true);
    try {
      trackEvent("signup_submitted", {
        invited: inviteValid,
        billingInterval: selectedPlanId || preselectedPlan?.id || "none",
      });
      const metadata: Record<string, string> = { full_name: trimmedName, church_role: trimmedChurchRole };
      if (inviteValid && legacyInviteToken) {
        metadata.invite_token = legacyInviteToken;
        metadata.signup_intent = "dashboard";
      } else {
        metadata.org_name = orgName.trim() || "My Church";
        metadata.org_city = city.trim();
        metadata.org_state = state;
      }

      if (!inviteValid) {
        metadata.signup_intent = "checkout";
        if (selectedPlanConfig?.priceId) {
          metadata.signup_checkout_price_id = selectedPlanConfig.priceId;
        }
      }

      const emailRedirectTo = buildAppUrl("/auth/confirm");

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: metadata,
          emailRedirectTo,
        },
      });

      if (error) {
        trackEvent("signup_failed", {
          invited: inviteValid,
          reason: error.message,
        });
        const message = error.message?.toLowerCase() || "";
        if (message.includes("already registered") || message.includes("already exists") || message.includes("user already registered")) {
          showNotice("Email already registered", "This email is already registered. Please log in instead.");
        } else {
          showNotice("Signup error", error.message);
        }
      } else if (!inviteValid) {
        const newUserId = signUpData.user?.id;
        if (newUserId) startProductTour(newUserId);
        trackEvent("signup_succeeded", {
          invited: false,
          billingInterval: selectedPlanId || preselectedPlan?.id || "none",
        });
        localStorage.setItem("pending_pro_checkout", "true");
        localStorage.setItem("pending_pro_checkout_email", normalizedEmail);
        localStorage.setItem("pending_pro_checkout_price_id", selectedPlanConfig!.priceId);
        showNotice(
          "Confirm your email",
          "Your account has been created. Confirm your email to continue to secure subscription checkout.",
          () => navigate("/login"),
        );
      } else if (inviteValid) {
        const newUserId = signUpData.user?.id;
        if (newUserId) {
          startProductTour(newUserId);
          markDeferredDashboardMessages(newUserId);
        }
        trackEvent("signup_succeeded", { invited: true });
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
        trackEvent("signup_succeeded", { invited: false, nextPath: nextPath || "/dashboard" });
        showNotice(
          "Account created",
          "Check your email to confirm your account, then continue to log in and access your dashboard.",
          () => navigate(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"),
        );
      }
    } catch (error) {
      logError(error, {
        scope: "signup_submit",
        invited: inviteValid,
        billingInterval: selectedPlanId || preselectedPlan?.id || "none",
      });
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

    showNotice("Choose a subscription plan", "Please choose a subscription plan before creating your account.");
  };

  const handleSelectPlan = async (planId: SubscriptionPlanId) => {
    const plan = getPlanById(planId);
    if (!plan) return;
    setPlanLoading(planId);
    trackEvent("signup_plan_selected", { planId });
    navigate(`/signup?priceId=${encodeURIComponent(plan.priceId)}`);
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
  const signupSteps = isInviteCompletionMode
    ? [
        { title: "Invite confirmed", detail: "Your organization access is already connected.", complete: true },
        { title: "Finish your account", detail: "Add your name and set your password.", complete: false },
        { title: "Start building slides", detail: "Open the dashboard and create your first presentation.", complete: false },
      ]
    : inviteValid
    ? [
        { title: "Create your account", detail: "Set your password and accept the invitation.", complete: true },
        { title: "Join your organization", detail: `You will be added to ${inviteOrgName || "your organization"}.`, complete: false },
        { title: "Start building slides", detail: "Open the dashboard and create your first presentation.", complete: false },
      ]
    : [
        { title: "Create your account", detail: "Enter your details and secure your login.", complete: true },
        { title: "Choose your plan", detail: "Pick Pro, Team, or Enterprise with monthly or annual billing.", complete: Boolean(showPlanSelection || preselectedPlan) },
        { title: "Confirm email and finish checkout", detail: "We will send you to secure checkout after confirmation.", complete: false },
      ];

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
              <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
                {requiresPlanFirst ? "Choose Your Plan" : isInviteCompletionMode ? "Finish Creating Your Account" : "Create Account"}
              </h1>
              <p className="text-muted-foreground">
                {requiresPlanFirst
                  ? "Select a subscription plan before creating your account."
                  : isInviteCompletionMode
                  ? `You're joining ${inviteOrgName} as a team member.`
                  : inviteValid
                  ? `You've been invited to join ${inviteOrgName}`
                  : showPlanSelection
                  ? "Choose your billing plan to finish setting up your account."
                  : "Create your account to continue to secure subscription checkout."}
              </p>
            </div>

            {!inviteValid && !showPlanSelection && !requiresPlanFirst && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-6">
                <p className="text-sm text-foreground font-medium">Paid account setup</p>
                <p className="text-xs text-muted-foreground mt-1">All new accounts require a subscription. After you confirm your email, we’ll send you to secure checkout.</p>
              </div>
            )}

            {showPlanSelection || requiresPlanFirst ? (
              <div className="space-y-4">
                <SubscriptionPlanPicker
                  title="Choose Your Plan"
                  description="Select Pro, Team, or Enterprise with monthly or annual billing before creating your account."
                  onSelectPlan={handleSelectPlan}
                  loadingPlanId={planLoading}
                />
                {!requiresPlanFirst && (
                  <Button variant="outline" className="w-full" onClick={() => setShowPlanSelection(false)} disabled={loading}>
                    Back to Account Details
                  </Button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" type="text" placeholder="John Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="churchRole">Role at Church</Label>
                  <Input
                    id="churchRole"
                    type="text"
                    placeholder="Lead Pastor, Worship Director, Ministry Assistant"
                    value={churchRole}
                    onChange={(e) => setChurchRole(e.target.value)}
                    className="h-12"
                    required
                  />
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
                    <p className="text-xs text-muted-foreground mt-1">
                      {isInviteCompletionMode
                        ? "Finish your name and password to activate your access."
                        : "You'll be added as a member of this organization."}
                    </p>
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

                <div className="rounded-xl border border-border/70 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">What happens next</p>
                      <p className="text-xs text-muted-foreground">
                        {inviteValid ? "Your access is almost ready." : "A short setup flow gets you into the dashboard."}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-primary">
                      {inviteValid ? "3 steps" : showPlanSelection ? "Plan step active" : "Account step active"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {signupSteps.map((step) => (
                      <div key={step.title} className="flex items-start gap-3">
                        {step.complete ? (
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{step.title}</p>
                          <p className="text-xs text-muted-foreground">{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button variant="hero" className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading
                    ? isInviteCompletionMode
                      ? "Finishing Setup..."
                      : "Creating Account..."
                    : isInviteCompletionMode
                    ? "Finish Account Setup"
                    : inviteValid
                    ? "Sign Up"
                    : preselectedPlan
                    ? `Continue with ${preselectedPlan.label}`
                    : "Continue to Plan Selection"}
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
