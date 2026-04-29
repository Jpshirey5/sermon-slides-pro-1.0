import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, CheckCircle2, Loader2 } from "lucide-react";
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
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordRequirements from "@/components/auth/PasswordRequirements";
import { supabase } from "@/integrations/supabase/client";
import { isPasswordStrong } from "@/lib/password";
import { buildAppUrl } from "@/lib/site-url";
import { logError, trackEvent } from "@/lib/monitoring";
import { startProductTour } from "@/lib/product-tour";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"
];

type SignupValidation = {
  status: string;
  email: string;
  priceId: string;
  planTier: string;
  billingInterval: string | null;
  message?: string;
};

type Notice = {
  title: string;
  description: string;
  onContinue?: () => void;
};

const SignupComplete = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const sessionId = searchParams.get("session_id") || "";

  const [validation, setValidation] = useState<SignupValidation | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "conflict">("loading");
  const [errorMessage, setErrorMessage] = useState("This signup link is invalid or has expired.");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [churchRole, setChurchRole] = useState("");
  const [orgName, setOrgName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const showNotice = (title: string, description: string, onContinue?: () => void) => {
    setNotice({ title, description, onContinue });
  };

  const handleNoticeContinue = () => {
    const onContinue = notice?.onContinue;
    setNotice(null);
    onContinue?.();
  };

  useEffect(() => {
    let cancelled = false;

    const validateSignup = async () => {
      if (!token) {
        setStatus("error");
        setErrorMessage("This finish-account link is missing required details.");
        return;
      }

      try {
        trackEvent("paid_signup_complete_viewed");
        const { data, error } = await supabase.functions.invoke("create-signup-checkout", {
          body: { action: "validate", token, sessionId },
        });

        if (error || data?.error) {
          throw new Error(error?.message || data?.error || "Could not validate this signup link.");
        }

        if (cancelled) return;
        if (data?.status === "email_conflict") {
          setValidation(data);
          setStatus("conflict");
          return;
        }

        setValidation(data);
        setStatus("ready");
      } catch (error) {
        logError(error, { scope: "paid_signup_validate" });
        if (!cancelled) {
          setErrorMessage(error instanceof Error && error.message ? error.message : "This signup link is invalid or has expired.");
          setStatus("error");
        }
      }
    };

    void validateSignup();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  const validateForm = () => {
    const trimmedName = fullName.trim();
    const trimmedChurchRole = churchRole.trim();
    const trimmedOrgName = orgName.trim();
    const trimmedCity = city.trim();

    if (!trimmedName || !trimmedChurchRole || !trimmedOrgName || !trimmedCity || !state || !password || !confirmPassword) {
      showNotice("Missing details", "Please fill in all fields.");
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

    return { trimmedName, trimmedChurchRole, trimmedOrgName, trimmedCity };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validation?.email) return;
    const validated = validateForm();
    if (!validated) return;

    setLoading(true);
    try {
      trackEvent("paid_signup_account_submitted", {
        planTier: validation.planTier,
        billingInterval: validation.billingInterval || "unknown",
      });

      const { data, error } = await supabase.auth.signUp({
        email: validation.email,
        password,
        options: {
          emailRedirectTo: buildAppUrl("/auth/confirm"),
          data: {
            signup_intent: "paid_signup",
            paid_signup_token: token,
            signup_checkout_price_id: validation.priceId,
            full_name: validated.trimmedName,
            church_role: validated.trimmedChurchRole,
            org_name: validated.trimmedOrgName,
            org_city: validated.trimmedCity,
            org_state: state,
          },
        },
      });

      if (error) throw error;
      if (data.user?.id) startProductTour(data.user.id);

      trackEvent("paid_signup_account_created", {
        planTier: validation.planTier,
        billingInterval: validation.billingInterval || "unknown",
      });
      showNotice(
        "Confirm your email",
        "Your subscription is active. Confirm your email to finish signing in to Sermon Slide Pro.",
        () => navigate("/login"),
      );
    } catch (error) {
      logError(error, { scope: "paid_signup_account_create" });
      showNotice(
        "Could not create account",
        error instanceof Error && error.message ? error.message : "We couldn't finish creating your account. Please contact support.",
      );
    } finally {
      setLoading(false);
    }
  };

  const renderBody = () => {
    if (status === "loading") {
      return (
        <div className="rounded-2xl glass-panel p-8 text-center shadow-elevated">
          <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-primary" />
          <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">Preparing your account setup</h1>
          <p className="text-muted-foreground">We are confirming your payment and loading your account form.</p>
        </div>
      );
    }

    if (status === "error" || status === "conflict") {
      return (
        <div className="rounded-2xl glass-panel p-8 text-center shadow-elevated">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">
            {status === "conflict" ? "Account already exists" : "Signup link issue"}
          </h1>
          <p className="mb-6 text-muted-foreground">
            {status === "conflict"
              ? validation?.message || "This email is already connected to an account. Please log in or contact support."
              : errorMessage}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild variant="hero">
              <Link to="/login">Go to Log In</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Contact Support</Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl glass-panel p-6 shadow-elevated sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero">
            <CheckCircle2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">Finish Creating Your Account</h1>
          <p className="text-muted-foreground">Your subscription is active. Add your church details to finish setup.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">Checkout email</p>
            <p className="text-sm text-muted-foreground">{validation?.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">Your account login will use the email entered during Stripe checkout.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-12" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="churchRole">Role at Church</Label>
            <Input id="churchRole" value={churchRole} onChange={(event) => setChurchRole(event.target.value)} className="h-12" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization / Church Name</Label>
            <Input id="orgName" value={orgName} onChange={(event) => setOrgName(event.target.value)} className="h-12" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} className="h-12" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                <option value="">Select...</option>
                {US_STATES.map((stateName) => (
                  <option key={stateName} value={stateName}>{stateName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12" required />
            <PasswordRequirements password={password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <PasswordInput id="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12" required />
          </div>

          <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
          </Button>
        </form>
      </div>
    );
  };

  return (
    <div className="app-shell flex flex-col">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-90">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-hero">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">Sermon Slide Pro</span>
            </Link>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {renderBody()}
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

export default SignupComplete;
