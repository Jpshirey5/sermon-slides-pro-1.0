import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const parseFunctionError = async (err: any): Promise<string> => {
  if (!err) return "Could not complete account deletion. Please try again.";

  if (typeof err.message === "string" && err.message !== "Edge Function returned a non-2xx status code") {
    return err.message;
  }

  const ctx = (err as any).context;
  if (ctx) {
    try {
      const data = await ctx.json();
      if (data?.error && typeof data.error === "string") return data.error;
    } catch {
      // Ignore JSON parsing errors
    }
    try {
      const text = await ctx.text();
      if (text) return text;
    } catch {
      // Ignore text parsing errors
    }
  }

  return "Could not complete account deletion. Please try again.";
};

const reasons = [
  "Too expensive",
  "Missing features I need",
  "Found another tool",
  "Technical issues / bugs",
  "Not using it enough",
  "Other",
];

const ExitSurvey = () => {
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [additionalThoughts, setAdditionalThoughts] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!reason) {
      toast.error("Please select a reason for leaving.");
      return;
    }

    if (!additionalThoughts.trim()) {
      toast.error("Please share additional thoughts before continuing.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired. Please log in again.");
        navigate("/login", { replace: true });
        return;
      }

      const { error } = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          reason,
          additional_feedback: additionalThoughts.trim(),
        },
      });

      if (error) {
        toast.error(await parseFunctionError(error));
        return;
      }

      toast.success("Account deletion completed.");
      await supabase.auth.signOut();
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(await parseFunctionError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/account" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Account</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="rounded-2xl glass-panel p-6 border border-red-400/35">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Exit Survey</h1>
            <p className="text-muted-foreground mb-6">
              This survey is required to complete account deletion.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>Why are you leaving? *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="additionalThoughts">Additional thoughts *</Label>
                <Textarea
                  id="additionalThoughts"
                  value={additionalThoughts}
                  onChange={(e) => setAdditionalThoughts(e.target.value)}
                  placeholder="Tell us what we could improve..."
                  className="min-h-[140px]"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <Link to="/account">
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" variant="destructive" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Completing Deletion...
                    </>
                  ) : (
                    "Submit Survey & Delete Account"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default ExitSurvey;
