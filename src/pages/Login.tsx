import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PasswordInput from "@/components/auth/PasswordInput";

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const signUpHref = `/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("reason") === "inactive") {
      toast.error("You were logged out after 30 minutes of inactivity.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        toast.error(error.message);
      } else {
        navigate(nextPath);
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

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

      <main className="flex-1 flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
          <div className="rounded-2xl glass-panel p-8 shadow-elevated">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-7 h-7 text-primary-foreground" />
              </div>
              <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Welcome Back</h1>
              <p className="text-muted-foreground">Sign in to access your dashboard</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@church.org" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput id="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" required />
              </div>

              <Button variant="hero" className="w-full" size="lg" type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Log In"}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <Link to={signUpHref} className="text-sm text-primary hover:underline block">
                Don't have an account? Sign up
              </Link>
              <Link to={`/forgot-password${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="text-sm text-muted-foreground hover:text-foreground block">
                Forgot password?
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Login;
