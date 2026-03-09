import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Please enter your email."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setSent(true);
        toast.success("Password reset email sent! Check your inbox.");
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
            <Link to="/login" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Login</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">Sermon Slide Pro</span>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
          <div className="rounded-2xl glass-panel p-8 shadow-elevated">
            <div className="text-center mb-8">
              <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Reset Password</h1>
              <p className="text-muted-foreground">Enter your email to receive a reset link</p>
            </div>

            {sent ? (
              <div className="text-center space-y-4">
                <p className="text-foreground">Check your email for the reset link.</p>
                <Link to="/login"><Button variant="outline">Back to Login</Button></Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@church.org" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required />
                </div>
                <Button variant="hero" className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default ForgotPassword;
