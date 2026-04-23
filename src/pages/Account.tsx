import { useCallback, useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, ArrowLeft, CreditCard, User, Crown, Users, Mail, Loader2, AlertTriangle, Building2, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TRANSLATION_OPTIONS, DEFAULT_TRANSLATION } from "@/lib/translations";
import SubscriptionPlanPicker from "@/components/SubscriptionPlanPicker";
import SubscriptionManagementPicker from "@/components/SubscriptionManagementPicker";
import { getPlanById, getPlanByPriceId, getPlanCapacityByTier, type SubscriptionPlanId } from "@/lib/subscriptionPlans";
import { getSiteUrl } from "@/lib/site-url";
import {
  listAccountCampuses,
  createCampus as createCampusRecord,
  renameCampus as renameCampusRecord,
  setPrimaryCampus as setPrimaryCampusRecord,
  deleteCampus as deleteCampusRecord,
  type Campus,
} from "@/lib/campuses";
import ProductTour, { type ProductTourStep } from "@/components/ProductTour";
import {
  formatDeletionDate,
  getActiveAccountDeletionRequest,
  isDeletionCancelable,
  type AccountDeletionRequest,
} from "@/lib/account-deletion";
import { formatBetaTrialCountdown } from "@/lib/beta";

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  church_role: string | null;
  default_translation: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  token: string;
  created_at: string;
  expires_at: string;
}

const getInviteCapacityMessage = (maxAdditionalUsers: number | null) => {
  if (maxAdditionalUsers === null) {
    return "Supports additional users.";
  }

  if (maxAdditionalUsers === 0) {
    return "This plan does not support additional users.";
  }

  return `Supports up to ${maxAdditionalUsers} additional users.`;
};

const Account = () => {
  const navigate = useNavigate();
  const { user, profile, subscription, refreshProfile, signOut, checkSubscription, accountId } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [churchRole, setChurchRole] = useState(profile?.church_role || "");
  const [defaultTranslation, setDefaultTranslation] = useState(profile?.default_translation || DEFAULT_TRANSLATION);
  const [dashboardCampusPreference, setDashboardCampusPreference] = useState(
    profile?.preferred_dashboard_campus_id || "all"
  );
  const [savingDefaultTranslation, setSavingDefaultTranslation] = useState(false);
  const [savingChurchRole, setSavingChurchRole] = useState(false);
  const [savingDashboardCampusPreference, setSavingDashboardCampusPreference] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [requiredPlanLoading, setRequiredPlanLoading] = useState<SubscriptionPlanId | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusesLoading, setCampusesLoading] = useState(false);
  const [newCampusName, setNewCampusName] = useState("");
  const [campusActionLoading, setCampusActionLoading] = useState<string | null>(null);
  const [editingCampusId, setEditingCampusId] = useState<string | null>(null);
  const [editingCampusName, setEditingCampusName] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [deleteFinalOpen, setDeleteFinalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [subscriptionModalStep, setSubscriptionModalStep] = useState<"actions" | "plans">("actions");
  const [planChangeLoading, setPlanChangeLoading] = useState<SubscriptionPlanId | null>(null);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [activeDeletionRequest, setActiveDeletionRequest] = useState<AccountDeletionRequest | null>(null);
  const [cancelingDeletionRequest, setCancelingDeletionRequest] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile?.full_name) setFullName(profile.full_name);
    setChurchRole(profile?.church_role || "");
    setDefaultTranslation(profile?.default_translation || DEFAULT_TRANSLATION);
    setDashboardCampusPreference(profile?.preferred_dashboard_campus_id || "all");
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

  const loadActiveDeletionRequest = useCallback(async () => {
    if (!accountId) {
      setActiveDeletionRequest(null);
      return;
    }

    try {
      setActiveDeletionRequest(await getActiveAccountDeletionRequest(accountId));
    } catch {
      setActiveDeletionRequest(null);
    }
  }, [accountId]);

  const loadTeam = async () => {
    if (!user) return;
    setTeamLoading(true);
    setTeamLoaded(false);
    
    const { data: members } = await supabase.rpc("get_account_members_for_user", { _user_id: user.id });
    
    if (members && members.length > 0) {
      // Check if current user is owner
      const currentMember = members.find((m: any) => m.user_id === user.id);
      setIsOwner(currentMember?.role === 'owner');

      // Fetch profiles for all members
      const userIds = members.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, church_role, default_translation")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setTeamMembers(members.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        full_name: profileMap.get(m.user_id)?.full_name || null,
        email: profileMap.get(m.user_id)?.email || null,
        church_role: profileMap.get(m.user_id)?.church_role || null,
        default_translation: profileMap.get(m.user_id)?.default_translation || null,
      })));
    } else {
      setIsOwner(false);
      setTeamMembers([]);
    }
    setTeamLoaded(true);
    setTeamLoading(false);
  };

  const handleSaveChurchRole = async () => {
    if (!user) return;
    setSavingChurchRole(true);
    const { error } = await supabase.rpc("update_my_church_role", {
      _church_role: churchRole.trim() || null,
    });

    if (error) {
      toast.error("Failed to update church role.");
    } else {
      toast.success("Church role updated!");
      await loadTeam();
      await refreshProfile();
    }

    setSavingChurchRole(false);
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

  const loadCampuses = async () => {
    if (!accountId) return;
    setCampusesLoading(true);
    try {
      const nextCampuses = await listAccountCampuses(accountId);
      setCampuses(nextCampuses);
    } catch {
      setCampuses([]);
      toast.error("Could not load campuses right now.");
    } finally {
      setCampusesLoading(false);
    }
  };

  const resendInvite = async (invite: PendingInvite) => {
    if (!isOwner) return;
    setResendingInviteId(invite.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-invite", {
        body: {
          email: invite.email,
          token: invite.token,
          org_name: orgName,
          invited_by_name: profile?.full_name || "A team member",
          site_url: getSiteUrl(),
        },
      });

      if (error) {
        toast.error("Could not resend invite. Please try again.");
      } else if (data?.success === false && data?.code === "active_user_exists") {
        toast.error(data.error || "This person already has an active account. Ask them to log in instead.");
      } else if (data?.success === true && data?.refreshedExistingAuthUser) {
        toast.success(`Invite refreshed and resent to ${invite.email}.`);
      } else {
        toast.success(`Invite resent to ${invite.email}.`);
      }
    } catch {
      toast.error("Could not resend invite. Please try again.");
    } finally {
      setResendingInviteId(null);
    }
  };

  const handleSaveDefaultTranslation = async () => {
    if (!user) return;
    if (isEnterprisePlan && !isOwner) {
      toast.error("Enterprise Bible translation is inherited from the organization owner.");
      return;
    }

    setSavingDefaultTranslation(true);
    const { error } = isEnterprisePlan && accountId
      ? await supabase.rpc("set_enterprise_account_default_translation", {
          _account_id: accountId,
          _translation: defaultTranslation,
        })
      : await supabase
          .from("profiles")
          .update({ default_translation: defaultTranslation })
          .eq("id", user.id);

    if (error) {
      toast.error("Failed to update default translation.");
    } else {
      toast.success(isEnterprisePlan ? "Enterprise default translation updated for the team!" : "Default translation updated!");
      await loadTeam();
      await refreshProfile();
    }
    setSavingDefaultTranslation(false);
  };

  const handleSaveDashboardCampusPreference = async () => {
    if (!user) return;
    setSavingDashboardCampusPreference(true);
    const preferredCampusId = dashboardCampusPreference === "all" ? null : dashboardCampusPreference;
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_dashboard_campus_id: preferredCampusId })
      .eq("id", user.id);

    if (error) {
      toast.error("Failed to update dashboard campus.");
    } else {
      toast.success("Dashboard campus updated!");
      await refreshProfile();
    }

    setSavingDashboardCampusPreference(false);
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

      if (!capacity.isUnlimited && (capacity.maxAdditionalUsers ?? 0) === 0) {
        toast.error("This plan does not support additional users.");
        setInviting(false);
        return;
      }

      if (!capacity.isUnlimited && inviteSlotsUsed >= (capacity.maxAdditionalUsers ?? 0)) {
        toast.error(getInviteCapacityMessage(capacity.maxAdditionalUsers));
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
          toast.error(error.details || "You have reached your plan's invite limit.");
        } else {
          toast.error("Failed to create invite.");
        }
        setInviting(false);
        return;
      }

      // Send invite email via edge function
      const { data: sendData, error: sendError } = await supabase.functions.invoke("send-invite", {
        body: {
          email: normalizedInviteEmail,
          token: invite.token,
          org_name: orgName,
          invited_by_name: profile?.full_name || "A team member",
          site_url: getSiteUrl(),
        },
      });

      if (sendError) {
        toast.error("Invite created but failed to send email. Please try again.");
      } else if (sendData?.success === false && sendData?.code === "active_user_exists") {
        await supabase
          .from("account_invites")
          .delete()
          .eq("account_id", accountId)
          .eq("token", invite.token);
        toast.error(sendData.error || "This person already has an active account. Ask them to log in instead.");
      } else if (sendData?.success === true && sendData?.refreshedExistingAuthUser) {
        toast.success(`Previous pending invite refreshed and sent to ${normalizedInviteEmail}!`);
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

  const handleRemoveTeamMember = async () => {
    if (!memberToRemove) return;

    setRemovingMemberId(memberToRemove.user_id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please log in again.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("remove-team-member", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          targetUserId: memberToRemove.user_id,
        },
      });

      if (error || data?.error) {
        toast.error(error?.message || data?.error || "Could not remove this team member.");
        return;
      }

      await loadTeam();
      setMemberToRemove(null);
      toast.success(
        data?.emailSent === false
          ? "Team member removed. Their account was deleted, but the removal email could not be sent."
          : "Team member removed and notified by email.",
      );
    } catch {
      toast.error("Could not remove this team member.");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleManageSubscription = async (options?: { action?: "cancel" | "change_plan"; targetPriceId?: string }) => {
    if (activeDeletionRequest) {
      toast.error("Cancel the organization deletion request before changing billing.");
      return;
    }

    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please log in again."); return; }
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: options?.action ? options : undefined,
      });
      if (error || !data?.url) {
        const message = error?.message || data?.error || "Could not open subscription portal.";
        toast.error(message);
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
      toast.success("Your subscription is already active.");
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

  const openSubscriptionModal = () => {
    setSubscriptionModalStep("actions");
    setSubscriptionModalOpen(true);
  };

  const closeSubscriptionModal = (open: boolean) => {
    setSubscriptionModalOpen(open);
    if (!open) {
      setSubscriptionModalStep("actions");
      setPlanChangeLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    setSubscriptionModalOpen(false);
    setSubscriptionModalStep("actions");
    setDeleteWarningOpen(true);
  };

  const handleCancelDeletionRequest = async () => {
    if (!activeDeletionRequest) return;

    setCancelingDeletionRequest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("cancel-account-deletion", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Could not cancel the deletion request.");
        return;
      }

      toast.success(
        data?.stripeRestoreError
          ? "Deletion request canceled. Please check billing because Stripe needs manual review."
          : "Deletion request canceled."
      );
      await loadActiveDeletionRequest();
      await checkSubscription();
    } catch {
      toast.error("Could not cancel the deletion request.");
    } finally {
      setCancelingDeletionRequest(false);
    }
  };

  const handleChangePlanSelection = async (planId: SubscriptionPlanId) => {
    const requestedPlan = getPlanById(planId);
    if (!requestedPlan) return;
    if (resolvedPlan?.id === requestedPlan.id) {
      toast.success("That plan is already active on your account.");
      setSubscriptionModalOpen(false);
      setSubscriptionModalStep("actions");
      return;
    }

    setPlanChangeLoading(planId);
    setSubscriptionModalOpen(false);

    try {
      await handleManageSubscription({
        action: "change_plan",
        targetPriceId: requestedPlan.priceId,
      });
    } finally {
      setPlanChangeLoading(null);
      setSubscriptionModalStep("actions");
    }
  };

  const handleContinueDeleteFlow = () => {
    setDeleteWarningOpen(false);
    setDeleteFinalOpen(true);
  };

  const handleGoToExitSurvey = () => {
    setDeleteFinalOpen(false);
    navigate("/exit-survey");
  };

  const handleSelectRequiredPlan = async (planId: SubscriptionPlanId) => {
    const requestedPlan = getPlanById(planId);
    if (!requestedPlan) return;
    setRequiredPlanLoading(planId);
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
  const resolvedPlan = getPlanByPriceId(subscription.price_id);
  const activePlanTier = subscription.plan_tier || resolvedPlan?.tier || "free";
  const capacity = getPlanCapacityByTier(activePlanTier);
  const inviteSlotsUsed = nonOwnerTeamCount + activePendingInviteCount;
  const inviteSlotsRemaining = capacity.isUnlimited
    ? null
    : Math.max(0, (capacity.maxAdditionalUsers ?? 0) - inviteSlotsUsed);
  const inviteLimitReached = capacity.isUnlimited ? false : (inviteSlotsRemaining ?? 0) === 0;
  const isCancelingSubscription = subscription.subscribed && subscription.cancel_at_period_end;
  const planLabel = subscription.subscribed
    ? resolvedPlan?.label || subscription.plan_label || "Pro"
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
  const isEnterprisePlan = activePlanTier === "enterprise";
  const isTeamOrEnterprisePlan = activePlanTier === "team" || isEnterprisePlan;
  const canCreateMoreCampuses = campuses.length < 5;
  const primaryCampus = campuses.find((campus) => campus.isPrimary) || null;
  const deletionCancelable = isDeletionCancelable(activeDeletionRequest);
  const betaCountdown = formatBetaTrialCountdown(subscription.beta_trial_days_remaining);
  const ownerTeamMember = teamMembers.find((member) => member.role === "owner") || null;
  const enterpriseOwnerDefaultTranslation =
    ownerTeamMember?.default_translation || null;
  const defaultTranslationInherited = isEnterprisePlan && teamLoaded && !isOwner;
  const inheritedDefaultTranslationLoading = isEnterprisePlan && !isOwner && (!teamLoaded || !ownerTeamMember);
  const profileDefaultTranslationLoading = !profile;
  const defaultTranslationLoading = profileDefaultTranslationLoading || inheritedDefaultTranslationLoading;
  const resolvedDefaultTranslation = defaultTranslationInherited
    ? enterpriseOwnerDefaultTranslation || DEFAULT_TRANSLATION
    : defaultTranslation;
  const defaultTranslationSelectValue = defaultTranslationLoading ? undefined : resolvedDefaultTranslation;
  const savedDefaultTranslation = profile?.default_translation || DEFAULT_TRANSLATION;

  useEffect(() => {
    if (defaultTranslationInherited) {
      setDefaultTranslation(enterpriseOwnerDefaultTranslation || DEFAULT_TRANSLATION);
    }
  }, [defaultTranslationInherited, enterpriseOwnerDefaultTranslation]);

  const accountTourSteps = useMemo<ProductTourStep[]>(() => {
    const steps: ProductTourStep[] = [
      {
        targetId: "account-profile-section",
        title: "Your profile and organization",
        description: "This card holds your organization, name, email, and workflow defaults.",
      },
      {
        targetId: "account-default-translation",
        title: "Default Bible translation",
        description: "New sermon forms start with this translation, so pastors do not need to choose it every time.",
      },
    ];

    if (isEnterprisePlan) {
      steps.push({
        targetId: "account-dashboard-campus",
        title: "Default dashboard campus view",
        description: "Choose which campus the dashboard opens to by default. You can still switch to other campuses anytime.",
      });
    }

    if (isOwner && isTeamOrEnterprisePlan) {
      steps.push({
        targetId: "account-team-invite",
        title: "Invite your team",
        description: "Owners can invite pastors, worship leaders, or staff into the organization.",
      });
    }

    if (isOwner && isEnterprisePlan) {
      steps.push({
        targetId: "account-campuses-management",
        title: "Manage campuses",
        description: "Enterprise owners can add, rename, set primary, and remove campuses, up to 5 total.",
      });
    }

    steps.push({
      title: "Ready to create",
      description: "Continue to the creator with your defaults in place.",
      nextStage: "create",
      nextPath: "/dashboard/create",
      nextLabel: "Open Creator",
    });

    return steps;
  }, [isEnterprisePlan, isOwner, isTeamOrEnterprisePlan]);

  const handleAccountTourStepChange = useCallback((step: ProductTourStep | null) => {
    if (!step?.targetId) return;

    const sectionsByTarget: Record<string, string[]> = {
      "account-profile-section": ["profile"],
      "account-default-translation": ["profile"],
      "account-dashboard-campus": ["profile"],
      "account-team-invite": ["team"],
      "account-campuses-management": ["campuses"],
    };
    const requiredSections = sectionsByTarget[step.targetId] || [];
    if (requiredSections.length === 0) return;

    setOpenSections((current) => Array.from(new Set([...current, ...requiredSections])));
  }, []);

  const handleCreateCampus = async () => {
    if (!accountId || !newCampusName.trim()) return;
    setCampusActionLoading("create");
    try {
      await createCampusRecord(accountId, newCampusName.trim());
      setNewCampusName("");
      await loadCampuses();
      toast.success("Campus created.");
    } catch (error: any) {
      toast.error(error?.message || "Could not create campus.");
    } finally {
      setCampusActionLoading(null);
    }
  };

  const handleSaveCampusRename = async (campusId: string) => {
    if (!editingCampusName.trim()) return;
    setCampusActionLoading(`rename:${campusId}`);
    try {
      await renameCampusRecord(campusId, editingCampusName.trim());
      setEditingCampusId(null);
      setEditingCampusName("");
      await loadCampuses();
      toast.success("Campus updated.");
    } catch (error: any) {
      toast.error(error?.message || "Could not update campus.");
    } finally {
      setCampusActionLoading(null);
    }
  };

  const handleSetPrimaryCampus = async (campusId: string) => {
    setCampusActionLoading(`primary:${campusId}`);
    try {
      await setPrimaryCampusRecord(campusId);
      await loadCampuses();
      toast.success("Primary campus updated.");
    } catch (error: any) {
      toast.error(error?.message || "Could not update the primary campus.");
    } finally {
      setCampusActionLoading(null);
    }
  };

  const handleDeleteCampus = async (campus: Campus) => {
    const confirmed = window.confirm(
      `Delete ${campus.name}? Its presentations will move to the primary campus and keep the former campus label for filtering.`
    );
    if (!confirmed) return;

    setCampusActionLoading(`delete:${campus.id}`);
    try {
      await deleteCampusRecord(campus.id);
      await loadCampuses();
      toast.success("Campus deleted.");
    } catch (error: any) {
      toast.error(error?.message || "Could not delete campus.");
    } finally {
      setCampusActionLoading(null);
    }
  };

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      checkSubscription();
      localStorage.removeItem("pending_pro_checkout");
      localStorage.removeItem("pending_pro_checkout_email");
      localStorage.removeItem("pending_pro_checkout_price_id");
      toast.success("Subscription activated!");
      const next = new URLSearchParams(searchParams.toString());
      next.delete("checkout");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, checkSubscription]);

  useEffect(() => {
    if (searchParams.get("subscription") === "updated") {
      checkSubscription();
      toast.success("Subscription updated!");
      const next = new URLSearchParams(searchParams.toString());
      next.delete("subscription");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, checkSubscription]);

  useEffect(() => {
    if (searchParams.get("emailChanged") === "1") {
      toast.success("Your email was updated successfully.");
      const next = new URLSearchParams(searchParams.toString());
      next.delete("emailChanged");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get("deletion") === "requested") {
      void loadActiveDeletionRequest();
      const next = new URLSearchParams(searchParams.toString());
      next.delete("deletion");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, loadActiveDeletionRequest]);

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
      toast.success("Your subscription is already active.");
      return;
    }

    localStorage.removeItem("pending_pro_checkout");
    handleUpgrade(false, requestedPriceId);
  }, [searchParams, setSearchParams, user, accountId, subscription.subscribed]);

  useEffect(() => {
    if (!accountId || !isEnterprisePlan) {
      setCampuses([]);
      return;
    }
    void loadCampuses();
  }, [accountId, isEnterprisePlan]);

  useEffect(() => {
    void loadActiveDeletionRequest();
  }, [loadActiveDeletionRequest]);

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

          {activeDeletionRequest && (
            <div className="mb-6 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="font-medium">Organization deletion is scheduled</p>
                  </div>
                  {deletionCancelable ? (
                    <p className="text-sm text-amber-900">
                      You can cancel this request until {formatDeletionDate(activeDeletionRequest.cancelableUntil)}.
                      After that, deletion is locked in. Your organization remains available until the end of the current billing term.
                    </p>
                  ) : (
                    <p className="text-sm text-amber-900">
                      The 7-day grace period has ended, so this deletion request is locked in. Your organization remains available until
                      {" "}{formatDeletionDate(activeDeletionRequest.scheduledDeleteAt)}, then it will be permanently deleted.
                    </p>
                  )}
                  <p className="text-xs text-amber-800">
                    Scheduled deletion date: {formatDeletionDate(activeDeletionRequest.scheduledDeleteAt)}
                  </p>
                </div>
                {isOwner && deletionCancelable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCancelDeletionRequest()}
                    disabled={cancelingDeletionRequest}
                    className="border-amber-400 bg-white/70"
                  >
                    {cancelingDeletionRequest ? "Canceling..." : "Cancel Deletion Request"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {subscription.is_beta_user && (
            <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Beta user</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Thank you for making Sermon Slide Pro a better platform. {betaCountdown}.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-6">
            <AccordionItem value="profile" className="rounded-2xl glass-panel border-none px-6" data-tour-id="account-profile-section">
              <AccordionTrigger className="py-6 font-normal no-underline hover:no-underline">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-serif text-xl font-semibold text-foreground">Profile</h2>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <div className="space-y-4">
                  {orgName && (
                    <div>
                      <Label className="text-muted-foreground text-sm">Organization</Label>
                      <p className="text-foreground">{orgName}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground text-sm">Full Name</Label>
                    <p className="text-foreground">{fullName || "Not set"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Email</Label>
                    <p className="text-foreground">{user?.email}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="churchRole">Role at Church</Label>
                    <div className="flex gap-2">
                      <Input
                        id="churchRole"
                        value={churchRole}
                        onChange={(event) => setChurchRole(event.target.value)}
                        placeholder="Lead Pastor, Worship Director, Ministry Assistant"
                        className="h-10"
                      />
                      <Button
                        onClick={handleSaveChurchRole}
                        disabled={savingChurchRole || churchRole.trim() === (profile?.church_role || "")}
                        size="sm"
                      >
                        {savingChurchRole ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This helps your organization know how you serve at the church.
                    </p>
                  </div>
                  <div className="space-y-2" data-tour-id="account-default-translation">
                    <Label htmlFor="defaultTranslation">Default Translation</Label>
                    <div className="flex gap-2">
                      <Select
                        value={defaultTranslationSelectValue}
                        onValueChange={setDefaultTranslation}
                        disabled={defaultTranslationInherited || defaultTranslationLoading}
                      >
                        <SelectTrigger id="defaultTranslation" className="h-10">
                          <SelectValue placeholder="Loading translation..." />
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
                        disabled={
                          defaultTranslationInherited ||
                          defaultTranslationLoading ||
                          savingDefaultTranslation ||
                          defaultTranslation === savedDefaultTranslation
                        }
                        size="sm"
                      >
                        {savingDefaultTranslation ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {defaultTranslationInherited
                        ? "Enterprise team members inherit this from the organization owner."
                        : inheritedDefaultTranslationLoading
                        ? "Loading your organization’s default translation..."
                        : isEnterprisePlan
                        ? "Enterprise team members will inherit this translation for new presentations."
                        : "New presentations will start with this translation by default."}
                    </p>
                  </div>
                  {isEnterprisePlan && (
                    <div className="space-y-2" data-tour-id="account-dashboard-campus">
                      <Label htmlFor="dashboardCampusPreference">Associated Campus</Label>
                      <div className="flex gap-2">
                        <Select value={dashboardCampusPreference} onValueChange={setDashboardCampusPreference}>
                          <SelectTrigger id="dashboardCampusPreference" className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Campuses</SelectItem>
                            {campuses.map((campus) => (
                              <SelectItem key={campus.id} value={campus.id}>
                                {campus.isPrimary ? `${campus.name} (Primary)` : campus.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleSaveDashboardCampusPreference}
                          disabled={
                            campusesLoading ||
                            savingDashboardCampusPreference ||
                            dashboardCampusPreference === (profile?.preferred_dashboard_campus_id || "all")
                          }
                          size="sm"
                        >
                          {savingDashboardCampusPreference ? "Saving..." : "Save"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Choose which campus the dashboard should open to by default. You can still switch campuses from the dashboard.
                      </p>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="team" className="rounded-2xl glass-panel border-none px-6">
              <AccordionTrigger className="py-6 font-normal no-underline hover:no-underline">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-serif text-xl font-semibold text-foreground">Team</h2>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                {teamLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading team...</span>
                  </div>
                ) : (
                  <div className="space-y-3 mb-6">
                    {teamMembers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-white/65 border border-border/70">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{member.full_name || "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                          {member.church_role && (
                            <p className="text-xs text-muted-foreground truncate">
                              Role: {member.church_role}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            member.role === 'owner' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                          }`}>
                            {member.role === 'owner' ? 'Owner' : 'Member'}
                          </span>
                          {isOwner && member.role !== "owner" && member.user_id !== user?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMemberToRemove(member)}
                              disabled={removingMemberId === member.user_id}
                            >
                              {removingMemberId === member.user_id ? "Removing..." : "Remove"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isOwner && (
                  <div className="pt-4 border-t border-border">
                    <Label className="text-sm font-medium text-foreground mb-2 block">Invite a team member</Label>
                    <div className="flex gap-2" data-tour-id="account-team-invite">
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
                        ? getInviteCapacityMessage(capacity.maxAdditionalUsers)
                        : getInviteCapacityMessage(capacity.maxAdditionalUsers)}
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
              </AccordionContent>
            </AccordionItem>

            {isEnterprisePlan && (
              <AccordionItem value="campuses" className="rounded-2xl glass-panel border-none px-6" data-tour-id="account-campuses-management">
                <AccordionTrigger className="py-6 font-normal no-underline hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <h2 className="font-serif text-xl font-semibold text-foreground">Campuses</h2>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-6">
                    Enterprise accounts can organize presentations across up to 5 campuses.
                  </p>

                  {campusesLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading campuses...</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {campuses.map((campus) => {
                        const isEditing = editingCampusId === campus.id;
                        const isOnlyPrimaryCampus = campus.isPrimary && campuses.length === 1;
                        return (
                          <div
                            key={campus.id}
                            className="rounded-lg border border-border/70 bg-white/65 p-3"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <div className="flex gap-2">
                                    <Input
                                      value={editingCampusName}
                                      onChange={(event) => setEditingCampusName(event.target.value)}
                                      className="h-10"
                                      maxLength={60}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => void handleSaveCampusRename(campus.id)}
                                      disabled={campusActionLoading === `rename:${campus.id}` || !editingCampusName.trim()}
                                    >
                                      {campusActionLoading === `rename:${campus.id}` ? "Saving..." : "Save"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingCampusId(null);
                                        setEditingCampusName("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-foreground truncate">{campus.name}</p>
                                      {campus.isPrimary && (
                                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                          Primary
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {campus.isPrimary
                                        ? "New Enterprise presentations default here unless another campus is selected."
                                        : primaryCampus
                                        ? `Deleting this campus moves its presentations to ${primaryCampus.name}.`
                                        : "Presentations in this campus stay filtered together on the dashboard."}
                                    </p>
                                  </>
                                )}
                              </div>

                              {isOwner && !isEditing && (
                                <div className="flex flex-wrap items-center gap-2">
                                  {!campus.isPrimary && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void handleSetPrimaryCampus(campus.id)}
                                      disabled={Boolean(campusActionLoading)}
                                    >
                                      <Check className="w-4 h-4 mr-1" />
                                      Make Primary
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingCampusId(campus.id);
                                      setEditingCampusName(campus.name);
                                    }}
                                    disabled={Boolean(campusActionLoading)}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleDeleteCampus(campus)}
                                    disabled={Boolean(campusActionLoading) || isOnlyPrimaryCampus}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isOwner && (
                    <div className="pt-4 border-t border-border mt-4 space-y-2">
                      <Label className="text-sm font-medium text-foreground block">Add a campus</Label>
                      <div className="flex gap-2">
                        <Input
                          value={newCampusName}
                          onChange={(event) => setNewCampusName(event.target.value)}
                          placeholder="e.g., Downtown Campus"
                          className="h-10"
                          disabled={!canCreateMoreCampuses}
                        />
                        <Button
                          onClick={() => void handleCreateCampus()}
                          disabled={!newCampusName.trim() || !canCreateMoreCampuses || campusActionLoading === "create"}
                          size="sm"
                        >
                          {campusActionLoading === "create" ? "Adding..." : "Add Campus"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {canCreateMoreCampuses
                          ? `${campuses.length} of 5 campuses used.`
                          : "You have reached the 5-campus limit for Enterprise."}
                      </p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="subscription" className="rounded-2xl glass-panel border-none px-6">
              <AccordionTrigger className="py-6 font-normal no-underline hover:no-underline">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-serif text-xl font-semibold text-foreground">Subscription</h2>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
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
                        {resolvedPlan ? resolvedPlan.displayPrice : "Pro"}
                      </span>
                    </div>
                  )}
                  {subscription.subscribed && (
                    <div>
                      <span className="text-muted-foreground">Interval: </span>
                      <span className="text-foreground">
                        {resolvedPlan
                          ? resolvedPlan.interval === "annual" ? "Annual" : "Monthly"
                          : "Unavailable"}
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
                  {activeDeletionRequest && (
                    <div className="rounded-xl border border-amber-300/50 bg-amber-50/60 p-4">
                      <p className="text-sm text-amber-900">
                        Billing changes are paused while organization deletion is scheduled. Cancel the deletion request during the 7-day grace period if you want to keep this account.
                      </p>
                    </div>
                  )}
                  <div className="pt-4 flex gap-3">
                    {isOwner ? (
                      activeDeletionRequest ? (
                        <Button variant="outline" disabled>
                          Deletion Scheduled
                        </Button>
                      ) : isCancelingSubscription ? (
                        <Button onClick={handleManageSubscription} disabled={portalLoading} variant="hero">
                          {portalLoading ? "Opening..." : "Resubscribe"}
                        </Button>
                      ) : subscription.subscribed ? (
                        <Button onClick={openSubscriptionModal} disabled={portalLoading} variant="outline">
                          {portalLoading ? "Opening..." : "Manage Subscription"}
                        </Button>
                      ) : (
                        <div className="w-full space-y-4">
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <p className="text-sm text-foreground font-medium">Subscription required</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Choose Pro, Team, or Enterprise with monthly or annual billing to activate your account and continue.
                            </p>
                          </div>
                          <SubscriptionPlanPicker
                            title="Choose Your Plan"
                            description="Select the plan and billing interval you want to use for this account."
                            onSelectPlan={handleSelectRequiredPlan}
                            loadingPlanId={requiredPlanLoading}
                          />
                        </div>
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground pt-2">
                        Only the account owner can change billing or manage the subscription for this organization.
                      </p>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </motion.div>
      </main>

      <Dialog open={!!memberToRemove} onOpenChange={(open) => !open && !removingMemberId && setMemberToRemove(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription className="pt-2 text-left">
              This will permanently delete this team member&apos;s login and remove their access to your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-foreground space-y-2">
            <p>
              <span className="font-medium">Team member:</span>{" "}
              {memberToRemove?.full_name || memberToRemove?.email || "Selected member"}
            </p>
            {memberToRemove?.email && (
              <p>
                <span className="font-medium">Email:</span> {memberToRemove.email}
              </p>
            )}
            <p>Only this member will lose access.</p>
            <p>Presentations they created will remain with your organization.</p>
            <p>An email will be sent to let them know they have been removed.</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberToRemove(null)}
              disabled={Boolean(removingMemberId)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveTeamMember}
              disabled={Boolean(removingMemberId)}
            >
              {removingMemberId ? "Removing..." : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteWarningOpen} onOpenChange={setDeleteWarningOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              {isOwner ? "Request Organization Deletion" : "Leave Organization"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-left">
              {isOwner
                ? "This starts a protected offboarding process for your organization."
                : "This permanently removes only your login and profile access."}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-foreground space-y-2">
            {isOwner ? (
              <>
                <p>You will have 7 days to cancel this deletion request.</p>
                <p>After 7 days, deletion is locked in. Your organization stays available until the end of the current billing term.</p>
                <p>At the scheduled deletion date, all team members, presentations, campuses, and organization data will be permanently removed.</p>
              </>
            ) : (
              <>
                <p>Your profile and login access will be deleted.</p>
                <p>Presentations you created will remain with your organization and stay available to the team.</p>
                <p>Your organization's subscription and the rest of the team will remain active.</p>
              </>
            )}
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
            <DialogTitle className="text-red-600">{isOwner ? "Final Step Before Exit Survey" : "Final Confirmation"}</DialogTitle>
            <DialogDescription className="pt-2 text-left">
              {isOwner
                ? "The exit survey creates the deletion request and sends support your feedback."
                : "You are about to delete your own login and leave this organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-foreground space-y-2">
            <p>You must complete a required exit survey to continue.</p>
            {isOwner ? (
              <p className="font-medium">
                Once submitted, you can cancel for 7 days. After that, deletion is final and completes at the end of the current billing term.
              </p>
            ) : (
              <p className="font-medium">Once submitted, your login and profile will be permanently deleted.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFinalOpen(false)}>Go Back</Button>
            <Button variant="destructive" onClick={handleGoToExitSurvey}>Continue to Exit Survey</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subscriptionModalOpen} onOpenChange={closeSubscriptionModal}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {subscriptionModalStep === "actions" ? (
            <>
              <DialogHeader>
                <DialogTitle>Manage Subscription</DialogTitle>
                <DialogDescription>
                  Choose whether you want to change your subscription or start organization offboarding.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSubscriptionModalStep("plans")}
                  className="rounded-2xl border border-border/70 bg-white/70 p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="font-medium text-foreground">Change Subscription</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Choose a different plan or billing option for your account.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={handleCancelSubscription}
                  className="rounded-2xl border border-border/70 bg-white/70 p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="font-medium text-foreground">Cancel Subscription</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Start the 7-day cancellation request. Your organization keeps access through the current billing term.
                  </p>
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => closeSubscriptionModal(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Choose a Different Plan</DialogTitle>
                <DialogDescription>
                  Select a new plan or billing interval. You'll see the billing details before you confirm.
                </DialogDescription>
              </DialogHeader>
              <SubscriptionManagementPicker
                title="Update Your Subscription"
                description="Pick the plan you want to move to. Your current plan is marked and cannot be reselected."
                currentPriceId={subscription.price_id}
                onSelectPlan={handleChangePlanSelection}
                loadingPlanId={planChangeLoading}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setSubscriptionModalStep("actions")}>
                  Back
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {user && (
        <ProductTour
          userId={user.id}
          stage="account"
          steps={accountTourSteps}
          onNavigate={navigate}
          onStepChange={handleAccountTourStepChange}
        />
      )}
    </div>
  );
};

export default Account;
