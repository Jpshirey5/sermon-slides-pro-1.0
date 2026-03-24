import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, ArrowLeft, CreditCard, User, Crown, Users, Mail, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TRANSLATION_OPTIONS, DEFAULT_TRANSLATION } from "@/lib/translations";
import SubscriptionPlanPicker from "@/components/SubscriptionPlanPicker";
import { getPlanByInterval, getPlanByPriceId, type BillingInterval } from "@/lib/subscriptionPlans";

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  token: string;
  created_at: string;
  expires_at: string;
}

const MAX_TEAM_INVITES = 2;

const Account = () => {
  const navigate = useNavigate();
  const { user, profile, subscription, refreshProfile, signOut, checkSubscription, accountId } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [defaultTranslation, setDefaultTranslation] = useState(profile?.default_translation || DEFAULT_TRANSLATION);
  const [saving, setSaving] = useState(false);
  const [savingDefaultTranslation, setSavingDefaultTranslation] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [requiredPlanLoading, setRequiredPlanLoading] = useState<BillingInterval | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [deleteFinalOpen, setDeleteFinalOpen] = useState(false);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    setDefaultTranslation(profile?.default_translation || DEFAULT_TRANSLATION);
  }, [profile]);

  useEffect(() => {
    if (user && accountId) {
      loadTeam();
      loadOrgInfo();
      loadPendingInvites();
    }
  }, [user, accountId]);

  const loadOrgInfo = async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from("accounts")
      .select("name, city, state")
      .eq("id", accountId)
      .single();
    if (data) setOrgName(`${data.name}${data.city ? ` — ${data.city}, ${data.state}` : ''}`);
  };

  const loadTeam = async () => {
    if (!user) return;
    setTeamLoading(true);
    
    const { data: members } = await supabase.rpc("get_account_members_for_user", { _user_id: user.id });
    
    if (members && members.length > 0) {
      // Check if current user is owner
      const currentMember = members.find((m: any) => m.user_id === user.id);
      setIsOwner(currentMember?.role === 'owner');

      // Fetch profiles for all members
      const userIds = members.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setTeamMembers(members.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        full_name: profileMap.get(m.user_id)?.full_name || null,
        email: profileMap.get(m.user_id)?.email || null,
      })));
    }
    setTeamLoading(false);
  };

  const loadPendingInvites = async () => {
    if (!accountId) return;
    setPendingInvitesLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("account_invites")
      .select("id, email, token, created_at, expires_at")
      .eq("account_id", accountId)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });

    if (error) {
      setPendingInvites([]);
    } else {
      setPendingInvites((data || []) as PendingInvite[]);
    }
    setPendingInvitesLoading(false);
  };

  const resendInvite = async (invite: PendingInvite) => {
    if (!isOwner) return;
    setResendingInviteId(invite.id);
    try {
      const { error } = await supabase.functions.invoke("send-invite", {
        body: {
          email: invite.email,
          token: invite.token,
          org_name: orgName,
          invited_by_name: profile?.full_name || "A team member",
          site_url: window.location.origin,
        },
      });

      if (error) {
        toast.error("Could not resend invite. Please try again.");
      } else {
        toast.success(`Invite resent to ${invite.email}.`);
      }
    } catch {
      toast.error("Could not resend invite. Please try again.");
    } finally {
      setResendingInviteId(null);
    }
  };

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

  const handleSaveDefaultTranslation = async () => {
    if (!user) return;
    setSavingDefaultTranslation(true);
    const { error } = await supabase
      .from("profiles")
      .update({ default_translation: defaultTranslation })
      .eq("id", user.id);
    if (error) {
      toast.error("Failed to update default translation.");
    } else {
      toast.success("Default translation updated!");
      await refreshProfile();
    }
    setSavingDefaultTranslation(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail || !accountId || !user) return;
    const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedInviteEmail) {
      toast.error("Please enter a valid email.");
      return;
    }
    setInviting(true);
    try {
      const activePendingInviteCount = pendingInvites.filter(
        (invite) => new Date(invite.expires_at).getTime() > Date.now()
      ).length;
      const nonOwnerTeamCount = teamMembers.filter((member) => member.role !== "owner").length;
      const inviteSlotsUsed = nonOwnerTeamCount + activePendingInviteCount;

      if (inviteSlotsUsed >= MAX_TEAM_INVITES) {
        toast.error("You can invite up to 2 team members on this account.");
        setInviting(false);
        return;
      }

      // Check if user already exists in profiles
      const { data: existingProfiles } = await supabase
        .from("profiles")
        .select("id, email")
        .ilike("email", normalizedInviteEmail);

      if (existingProfiles && existingProfiles.length > 0) {
        toast.error("This email is already registered. They can log in and join directly.");
        setInviting(false);
        return;
      }

      // Check for existing pending invite
      const { data: existingInvites } = await supabase
        .from("account_invites")
        .select("id")
        .ilike("email", normalizedInviteEmail)
        .eq("account_id", accountId);

      if (existingInvites && existingInvites.length > 0) {
        toast.error("An invite has already been sent to this email.");
        setInviting(false);
        return;
      }

      // Insert invite
      const { data: invite, error } = await supabase
        .from("account_invites")
        .insert({
          account_id: accountId,
          invited_by: user.id,
          email: normalizedInviteEmail,
        } as any)
        .select("token")
        .single();

      if (error) {
        if (error.message?.includes("account invite limit reached")) {
          toast.error("You can invite up to 2 team members on this account.");
        } else {
          toast.error("Failed to create invite.");
        }
        setInviting(false);
        return;
      }

      // Send invite email via edge function
      const { error: sendError } = await supabase.functions.invoke("send-invite", {
        body: {
          email: normalizedInviteEmail,
          token: invite.token,
          org_name: orgName,
          invited_by_name: profile?.full_name || "A team member",
          site_url: window.location.origin,
        },
      });

      if (sendError) {
        toast.error("Invite created but failed to send email. Please try again.");
      } else {
        toast.success(`Invite sent to ${normalizedInviteEmail}!`);
      }

      setInviteEmail("");
      await loadPendingInvites();
    } catch {
      toast.error("An error occurred.");
    } finally {
      setInviting(false);
    }
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
        window.location.href = data.url;
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const handleUpgrade = async (openInNewTab: boolean = false, priceId?: string) => {
    if (subscription.subscribed) {
      toast.success("Your Pro subscription is already active.");
      return;
    }

    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please log in again."); return; }
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: priceId ? { priceId } : undefined,
      });
      if (error || !data?.url) {
        toast.error("Could not start checkout.");
      } else {
        if (openInNewTab) {
          window.open(data.url, "_blank");
        } else {
          window.location.href = data.url;
        }
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleStartDeleteFlow = () => {
    setDeleteWarningOpen(true);
  };

  const handleContinueDeleteFlow = () => {
    setDeleteWarningOpen(false);
    setDeleteFinalOpen(true);
  };

  const handleGoToExitSurvey = () => {
    setDeleteFinalOpen(false);
    navigate("/exit-survey");
  };

  const handleSelectRequiredPlan = async (interval: BillingInterval) => {
    const requestedPlan = getPlanByInterval(interval);
    if (!requestedPlan) return;
    setRequiredPlanLoading(interval);
    try {
      await handleUpgrade(false, requestedPlan.priceId);
    } finally {
      setRequiredPlanLoading(null);
    }
  };

  const formattedSubscriptionEnd = subscription.subscription_end
    ? new Date(subscription.subscription_end).toLocaleDateString()
    : null;
  const activePendingInviteCount = pendingInvites.filter(
    (invite) => new Date(invite.expires_at).getTime() > Date.now()
  ).length;
  const nonOwnerTeamCount = teamMembers.filter((member) => member.role !== "owner").length;
  const inviteSlotsUsed = nonOwnerTeamCount + activePendingInviteCount;
  const inviteSlotsRemaining = Math.max(0, MAX_TEAM_INVITES - inviteSlotsUsed);
  const inviteLimitReached = inviteSlotsRemaining === 0;
  const isCancelingSubscription = subscription.subscribed && subscription.cancel_at_period_end;
  const resolvedPlan = getPlanByPriceId(subscription.price_id) || getPlanByInterval(subscription.billing_interval);
  const planLabel = subscription.subscribed
    ? subscription.plan_label || resolvedPlan?.badgeLabel || "Pro"
    : "No active subscription";
  const statusLabel = isCancelingSubscription
    ? "Cancelled"
    : subscription.subscribed
    ? "Active"
    : "Inactive";
  const statusClassName = isCancelingSubscription
    ? "text-amber-600 font-medium"
    : subscription.subscribed
    ? "text-green-600 font-medium"
    : "text-muted-foreground";

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      checkSubscription();
      localStorage.removeItem("pending_pro_checkout");
      localStorage.removeItem("pending_pro_checkout_email");
      localStorage.removeItem("pending_pro_checkout_price_id");
      toast.success("Subscription activated! Welcome to Pro.");
      const next = new URLSearchParams(searchParams.toString());
      next.delete("checkout");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, checkSubscription]);

  useEffect(() => {
    const pendingProCheckout = localStorage.getItem("pending_pro_checkout") === "true";
    const shouldAutoStartCheckout = searchParams.get("startCheckout") === "pro" || pendingProCheckout;
    if (!shouldAutoStartCheckout || !user || !accountId) return;
    const requestedPriceId =
      searchParams.get("priceId") || localStorage.getItem("pending_pro_checkout_price_id") || undefined;

    const next = new URLSearchParams(searchParams.toString());
    next.delete("startCheckout");
    next.delete("priceId");
    setSearchParams(next, { replace: true });

    if (subscription.subscribed) {
      localStorage.removeItem("pending_pro_checkout");
      localStorage.removeItem("pending_pro_checkout_email");
      localStorage.removeItem("pending_pro_checkout_price_id");
      toast.success("Your Pro subscription is already active.");
      return;
    }

    localStorage.removeItem("pending_pro_checkout");
    handleUpgrade(false, requestedPriceId);
  }, [searchParams, setSearchParams, user, accountId, subscription.subscribed]);

  return (
    <div className="app-shell">
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">Sermon Slide Pro</span>
            </Link>
            <Button variant="ghost" onClick={handleLogout}>Log Out</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-8">Account</h1>

          {/* Organization */}
          {orgName && (
            <div className="rounded-2xl glass-panel p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-serif text-xl font-semibold text-foreground">Organization</h2>
              </div>
              <p className="text-foreground">{orgName}</p>
            </div>
          )}

          {/* Profile Section */}
          <div className="rounded-2xl glass-panel p-6 mb-6">
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
              <div className="space-y-2">
                <Label htmlFor="defaultTranslation">Default Translation</Label>
                <div className="flex gap-2">
                  <Select value={defaultTranslation} onValueChange={setDefaultTranslation}>
                    <SelectTrigger id="defaultTranslation" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSLATION_OPTIONS.map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          <span className="font-medium">{t.code}</span>
                          <span className="text-muted-foreground ml-2">{t.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSaveDefaultTranslation}
                    disabled={savingDefaultTranslation || defaultTranslation === (profile?.default_translation || DEFAULT_TRANSLATION)}
                    size="sm"
                  >
                    {savingDefaultTranslation ? "Saving..." : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  New presentations will start with this translation by default.
                </p>
              </div>
            </div>
          </div>

          {/* Team Section */}
          <div className="rounded-2xl glass-panel p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Users className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-serif text-xl font-semibold text-foreground">Team</h2>
            </div>

            {teamLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading team...</span>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {teamMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-white/65 border border-border/70">
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.full_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      member.role === 'owner' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {member.role === 'owner' ? 'Owner' : 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Invite form — owners only */}
            {isOwner && (
              <div className="pt-4 border-t border-border">
                <Label className="text-sm font-medium text-foreground mb-2 block">Invite a team member</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="colleague@church.org"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-10"
                    disabled={inviteLimitReached}
                  />
                  <Button onClick={handleInvite} disabled={inviting || !inviteEmail || inviteLimitReached} size="sm">
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    <span className="ml-1">Invite</span>
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {inviteLimitReached
                    ? "You have reached your 2-user invite limit."
                    : `${inviteSlotsUsed} of ${MAX_TEAM_INVITES} collaborative user slots used. ${inviteSlotsRemaining} remaining.`}
                </p>
              </div>
            )}

            {isOwner && (
              <div className="pt-4 border-t border-border mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium text-foreground block">Pending invites</Label>
                  <Button variant="ghost" size="sm" onClick={loadPendingInvites} disabled={pendingInvitesLoading}>
                    {pendingInvitesLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>

                {pendingInvites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No pending invites.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="flex items-center justify-between p-3 rounded-lg bg-white/65 border border-border/70">
                        <div>
                          <p className="text-sm font-medium text-foreground">{invite.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Sent {new Date(invite.created_at).toLocaleDateString()} · Expires {new Date(invite.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resendInvite(invite)}
                          disabled={resendingInviteId === invite.id}
                        >
                          {resendingInviteId === invite.id ? "Sending..." : "Resend"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subscription Section */}
          <div className="rounded-2xl glass-panel p-6">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-serif text-xl font-semibold text-foreground">Subscription</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Plan:</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  subscription.subscribed ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                }`}>
                  {subscription.subscribed && <Crown className="w-3.5 h-3.5" />}
                  {planLabel}
                </span>
              </div>
              {subscription.subscribed && (
                <div>
                  <span className="text-muted-foreground">Billing: </span>
                  <span className="text-foreground">
                    {resolvedPlan
                      ? `${resolvedPlan.displayPrice} ${resolvedPlan.id === "year" ? "yearly" : "monthly"}`
                      : "Pro"}
                  </span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Status: </span>
                <span className={statusClassName}>
                  {statusLabel}
                </span>
              </div>
              {subscription.subscribed && (
                <div>
                  <span className="text-muted-foreground">
                    {isCancelingSubscription ? "Ends on: " : "Renews on: "}
                  </span>
                  <span className="text-foreground">
                    {formattedSubscriptionEnd || "Unavailable"}
                  </span>
                </div>
              )}
              {isCancelingSubscription && formattedSubscriptionEnd && (
                <div className="rounded-xl border border-amber-300/50 bg-amber-50/60 p-4">
                  <p className="text-sm text-amber-900">
                    You still have access till this {formattedSubscriptionEnd}.
                  </p>
                </div>
              )}
              <div className="pt-4 flex gap-3">
                {isCancelingSubscription ? (
                  <Button onClick={handleManageSubscription} disabled={portalLoading} variant="hero">
                    {portalLoading ? "Opening..." : "Resubscribe"}
                  </Button>
                ) : subscription.subscribed ? (
                  <Button onClick={handleManageSubscription} disabled={portalLoading} variant="outline">
                    {portalLoading ? "Opening..." : "Manage Subscription"}
                  </Button>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm text-foreground font-medium">Subscription required</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Choose a monthly or yearly Pro plan to activate your account and continue.
                      </p>
                    </div>
                    <SubscriptionPlanPicker
                      title="Choose Your Plan"
                      description="Select the billing option you want to use for this account."
                      onSelectPlan={handleSelectRequiredPlan}
                      loadingInterval={requiredPlanLoading}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Account Deletion Section */}
          <div className="rounded-2xl glass-panel p-6 mt-6 border border-red-400/35">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="font-serif text-xl font-semibold text-foreground">Account</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Delete your account and permanently remove your data from the platform.
              {isOwner
                ? " As an owner, this will also remove all team members and presentations for your organization."
                : " This action permanently removes your own login and profile access."}
            </p>
            <Button variant="destructive" onClick={handleStartDeleteFlow}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </motion.div>
      </main>

      <Dialog open={deleteWarningOpen} onOpenChange={setDeleteWarningOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Warning: Permanent Account Deletion
            </DialogTitle>
            <DialogDescription className="pt-2 text-left">
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-foreground space-y-2">
            <p>Deleting your account will permanently remove your profile and access.</p>
            <p>All presentations tied to your account context will be deleted.</p>
            {isOwner && (
              <p className="font-medium text-red-700">
                Because you are an owner, all associated team members will be removed and lose access.
              </p>
            )}
            <p>Any active Stripe subscription for your account context will be canceled.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteWarningOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleContinueDeleteFlow}>I Understand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteFinalOpen} onOpenChange={setDeleteFinalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-red-600">Final Confirmation</DialogTitle>
            <DialogDescription className="pt-2 text-left">
              You are about to start the final deactivation process.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-foreground space-y-2">
            <p>You must complete a required exit survey to finish account deletion.</p>
            <p className="font-medium">Once submitted, your account and data will be permanently deleted.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFinalOpen(false)}>Go Back</Button>
            <Button variant="destructive" onClick={handleGoToExitSurvey}>Continue to Exit Survey</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Account;
