import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, ArrowLeft, CreditCard, User, Crown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

const Account = () => {
  const { user, profile, subscription, refreshProfile, signOut, checkSubscription } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      checkSubscription();
      toast.success("Subscription activated! Welcome to Pro.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile]);

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName } as any)
      .eq("id", user.id);
    if (error) {
      toast.error("Failed to update name.");
    } else {
      toast.success("Name updated!");
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please log in again."); return; }

      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) {
        toast.error("Could not open subscription portal.");
      } else {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please log in again."); return; }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) {
        toast.error("Could not start checkout.");
      } else {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">SermonSlides</span>
            </div>
            <Button variant="ghost" onClick={signOut}>Log Out</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-8">Account</h1>

          {/* Profile Section */}
          <div className="rounded-2xl bg-card border border-border p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-serif text-xl font-semibold text-foreground">Profile</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-sm">Email</Label>
                <p className="text-foreground">{user?.email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="flex gap-2">
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-10" />
                  <Button onClick={handleSaveName} disabled={saving} size="sm">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Section */}
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-serif text-xl font-semibold text-foreground">Subscription</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Plan:</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  subscription.subscribed
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}>
                  {subscription.subscribed && <Crown className="w-3.5 h-3.5" />}
                  {subscription.subscribed ? "Pro Monthly ($30/mo)" : "Free"}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Status: </span>
                <span className={subscription.subscribed ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {subscription.subscribed ? "Active" : "Inactive"}
                </span>
              </div>

              {subscription.subscription_end && (
                <div>
                  <span className="text-muted-foreground">Renews: </span>
                  <span className="text-foreground">
                    {new Date(subscription.subscription_end).toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                {subscription.subscribed ? (
                  <Button onClick={handleManageSubscription} disabled={portalLoading} variant="outline">
                    {portalLoading ? "Opening..." : "Manage Subscription"}
                  </Button>
                ) : (
                  <Button onClick={handleUpgrade} disabled={checkoutLoading} variant="hero">
                    {checkoutLoading ? "Starting..." : "Upgrade to Pro — $30/mo"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Account;
