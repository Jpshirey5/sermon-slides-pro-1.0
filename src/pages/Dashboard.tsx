import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BookOpen,
  LifeBuoy,
  LogOut,
  Presentation,
  Plus,
  Calendar,
  Layers,
  Clock,
  User,
  Sparkles,
  Search,
  X,
  Download,
  RefreshCw,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";
import {
  getDashboardPresentationsPage,
  deletePresentation,
  duplicateMostRecentPresentationAsStartingPoint,
  getPresentation,
  type DashboardPresentation,
  type DashboardPresentationFilters,
} from "@/lib/presentations";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logError, trackEvent } from "@/lib/monitoring";
import ProductTour, { type ProductTourStep } from "@/components/ProductTour";
import {
  consumeProductTourCompletion,
  shouldDeferDashboardMessages,
  subscribeToDeferredDashboardMessages,
} from "@/lib/product-tour";
import { ExportOptionsModal } from "@/components/ExportOptionsModal";
import { exportPresentationsAsZip } from "@/lib/bulk-export";
import { getEnterpriseCampusFilterOptions, type CampusFilterOption } from "@/lib/campuses";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDeletionDate,
  getActiveAccountDeletionRequest,
  isDeletionCancelable,
  type AccountDeletionRequest,
} from "@/lib/account-deletion";
import { formatBetaTrialCountdown } from "@/lib/beta";
import { formatEstimatedMinutes } from "@/lib/value-metrics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const DASHBOARD_PAGE_SIZE = 12;
const DASHBOARD_SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
] as const;

const parseCampusFilterValue = (
  value: string
): NonNullable<DashboardPresentationFilters["campusFilter"]> => {
  if (value.startsWith("active:")) {
    return { type: "active", value: value.replace("active:", "") };
  }

  if (value.startsWith("former:")) {
    return { type: "former", value: value.replace("former:", "") };
  }

  return { type: "all" };
};

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, subscription, signOut, checkSubscription, accountId } = useAuth();
  const [presentations, setPresentations] = useState<DashboardPresentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePresentations, setHasMorePresentations] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [presentationMonth, setPresentationMonth] = useState("");
  const [campusFilterValue, setCampusFilterValue] = useState("all");
  const [campusFilterOptions, setCampusFilterOptions] = useState<CampusFilterOption[]>([
    { value: "all", label: "All Campuses", type: "all" },
  ]);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPresentationIds, setSelectedPresentationIds] = useState<Set<string>>(new Set());
  const [showBulkExportModal, setShowBulkExportModal] = useState(false);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [isDuplicatingLastPresentation, setIsDuplicatingLastPresentation] = useState(false);
  const [showTourCompletionPrompt, setShowTourCompletionPrompt] = useState(false);
  const [activeDeletionRequest, setActiveDeletionRequest] = useState<AccountDeletionRequest | null>(null);
  const [isAccountOwner, setIsAccountOwner] = useState(false);
  const [cancelingDeletionRequest, setCancelingDeletionRequest] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [submittingSupportRequest, setSubmittingSupportRequest] = useState(false);
  const [supportOrgName, setSupportOrgName] = useState("");
  const [globalMessagesQueue, setGlobalMessagesQueue] = useState<any[]>([]);
  const [dismissingGlobalMessage, setDismissingGlobalMessage] = useState(false);
  const [deferGlobalMessages, setDeferGlobalMessages] = useState(false);
  const isEnterpriseAccount = subscription.plan_tier === "enterprise";
  const latestPresentationLoadIdRef = useRef(0);
  const activeGlobalMessage = globalMessagesQueue[0] || null;

  // Handle returning from Stripe checkout
  useEffect(() => {
    trackEvent("dashboard_viewed");
  }, []);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      trackEvent("checkout_completed");
      checkSubscription();
      setSearchParams({}, { replace: true });
    }
  }, [checkSubscription, searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) {
      setDeferGlobalMessages(false);
      return;
    }

    setDeferGlobalMessages(shouldDeferDashboardMessages(user.id));
    return subscribeToDeferredDashboardMessages(user.id, setDeferGlobalMessages);
  }, [user]);

  const loadDeletionRequestState = useCallback(async () => {
    if (!accountId || !user) {
      setActiveDeletionRequest(null);
      setIsAccountOwner(false);
      return;
    }

    try {
      const [request, { data: membership }] = await Promise.all([
        getActiveAccountDeletionRequest(accountId),
        supabase
          .from("account_members")
          .select("role")
          .eq("account_id", accountId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      setActiveDeletionRequest(request);
      setIsAccountOwner(membership?.role === "owner");
    } catch {
      setActiveDeletionRequest(null);
      setIsAccountOwner(false);
    }
  }, [accountId, user]);

  useEffect(() => {
    void loadDeletionRequestState();
  }, [loadDeletionRequestState]);

  const loadGlobalMessages = useCallback(async () => {
    if (!user || !accountId || deferGlobalMessages) {
      setGlobalMessagesQueue([]);
      return;
    }

    try {
      const { data: messages, error: messageError } = await supabase
        .from("global_messages")
        .select("*")
        .or(`audience_type.eq.all,audience_type.eq.beta,target_account_id.eq.${accountId}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (messageError) throw messageError;
      const messageIds = (messages || []).map((message) => message.id);
      const { data: views, error: viewsError } = messageIds.length
        ? await supabase
            .from("global_message_views")
            .select("message_id, viewed_on")
            .eq("user_id", user.id)
            .in("message_id", messageIds)
        : { data: [] as any[], error: null };

      if (viewsError) throw viewsError;

      const today = getLocalDateKey();
      const viewMap = new Map<string, Set<string>>();
      for (const view of views || []) {
        const existing = viewMap.get(view.message_id) || new Set<string>();
        existing.add(view.viewed_on);
        viewMap.set(view.message_id, existing);
      }

      const eligible = (messages || []).filter((message) => {
        const viewedDates = viewMap.get(message.id);
        if (!message.ends_at) {
          return !viewedDates || viewedDates.size === 0;
        }
        return !viewedDates?.has(today);
      });

      setGlobalMessagesQueue(eligible);
    } catch (error) {
      logError(error, { scope: "dashboard_load_global_messages" });
      setGlobalMessagesQueue([]);
    }
  }, [accountId, deferGlobalMessages, user]);

  useEffect(() => {
    void loadGlobalMessages();
  }, [loadGlobalMessages]);

  useEffect(() => {
    if (!accountId) {
      setSupportOrgName("");
      return;
    }

    let cancelled = false;

    const loadSupportOrgName = async () => {
      const { data } = await supabase
        .from("accounts")
        .select("name")
        .eq("id", accountId)
        .maybeSingle();

      if (!cancelled) {
        setSupportOrgName(data?.name || "");
      }
    };

    void loadSupportOrgName();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleCancelDeletionRequest = async () => {
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

      toast.success("Deletion request canceled.");
      await loadDeletionRequestState();
      await checkSubscription();
    } catch {
      toast.error("Could not cancel the deletion request.");
    } finally {
      setCancelingDeletionRequest(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!user) return;

    const completedFromState = Boolean((location.state as { productTourCompleted?: boolean } | null)?.productTourCompleted);
    const completedFromStorage = consumeProductTourCompletion(user.id);

    if (completedFromState || completedFromStorage) {
      setShowTourCompletionPrompt(true);
      trackEvent("product_tour_completed");
    }

    if (completedFromState) {
      navigate(`${location.pathname}${location.search}`, { replace: true });
    }
  }, [location.pathname, location.search, location.state, navigate, user]);

  const loadPresentationsPage = useCallback(async (offset: number, replace = false) => {
    const requestId = ++latestPresentationLoadIdRef.current;

    try {
      const data = await getDashboardPresentationsPage({
        limit: DASHBOARD_PAGE_SIZE,
        offset,
        search: debouncedSearch,
        presentationMonth: presentationMonth || null,
        campusFilter: parseCampusFilterValue(campusFilterValue),
        sort: sortOrder,
      });

      if (requestId !== latestPresentationLoadIdRef.current) {
        return;
      }

      setPresentations((prev) => replace ? data.items : [...prev, ...data.items]);
      setLoadedCount(offset + data.items.length);
      setHasMorePresentations(data.hasMore);
      trackEvent("presentations_loaded", {
        count: data.items.length,
        totalLoaded: offset + data.items.length,
        offset,
      });
    } catch (error) {
      logError(error, { scope: "dashboard_load_presentations" });
      toast.error("Failed to load presentations");
    }
  }, [campusFilterValue, debouncedSearch, presentationMonth, sortOrder]);

  const refreshDashboardPresentations = useCallback(async () => {
    setLoading(true);
    try {
      await loadPresentationsPage(0, true);
    } finally {
      setLoading(false);
    }
  }, [loadPresentationsPage]);

  useEffect(() => {
    void refreshDashboardPresentations();
  }, [refreshDashboardPresentations]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedPresentationIds(new Set());
  }, [campusFilterValue, debouncedSearch, presentationMonth, sortOrder]);

  useEffect(() => {
    if (!isEnterpriseAccount || !accountId) {
      setCampusFilterValue("all");
      setCampusFilterOptions([{ value: "all", label: "All Campuses", type: "all" }]);
      return;
    }

    let cancelled = false;

    const loadCampusFilters = async () => {
      try {
        const options = await getEnterpriseCampusFilterOptions(accountId);
        if (!cancelled) {
          setCampusFilterOptions(options);
          setCampusFilterValue((current) => {
            if (options.some((option) => option.value === current)) {
              return current;
            }
            return "all";
          });
        }
      } catch (error) {
        logError(error, { scope: "dashboard_load_campus_filters" });
        if (!cancelled) {
          setCampusFilterOptions([{ value: "all", label: "All Campuses", type: "all" }]);
          setCampusFilterValue("all");
        }
      }
    };

    void loadCampusFilters();

    return () => {
      cancelled = true;
    };
  }, [accountId, isEnterpriseAccount]);

  const defaultCampusFilterValue = useMemo(() => {
    if (!isEnterpriseAccount) {
      return "all";
    }

    const preferredCampusId = profile?.preferred_dashboard_campus_id;
    if (!preferredCampusId) {
      return "all";
    }

    const preferredValue = `active:${preferredCampusId}`;
    return campusFilterOptions.some((option) => option.value === preferredValue) ? preferredValue : "all";
  }, [campusFilterOptions, isEnterpriseAccount, profile?.preferred_dashboard_campus_id]);

  useEffect(() => {
    if (!isEnterpriseAccount) {
      return;
    }

    setCampusFilterValue((current) => {
      const isCurrentCampusValid = campusFilterOptions.some((option) => option.value === current);

      if (!isCurrentCampusValid || current === "all" || current === defaultCampusFilterValue) {
        return defaultCampusFilterValue;
      }

      return current;
    });
  }, [campusFilterOptions, defaultCampusFilterValue, isEnterpriseAccount]);

  const handleLogout = async () => {
    trackEvent("logout_clicked");
    await signOut();
    navigate("/");
  };

  const handleSubmitSupportRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = supportMessage.trim();

    if (!message) {
      toast.error("Please describe what you need help with.");
      return;
    }

    setSubmittingSupportRequest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again before submitting support.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("contact-support", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          supportTicket: true,
          message,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Could not submit your support request.");
        return;
      }

      setSupportMessage("");
      setShowSupportDialog(false);
      toast.success("Support request submitted. We'll follow up soon.");
      trackEvent("dashboard_support_request_submitted");
    } catch (error) {
      logError(error, { scope: "dashboard_submit_support_request" });
      toast.error("Could not submit your support request.");
    } finally {
      setSubmittingSupportRequest(false);
    }
  };

  const dismissGlobalMessage = async () => {
    if (!activeGlobalMessage || !user || !accountId) return;

    setDismissingGlobalMessage(true);
    try {
      await supabase
        .from("global_message_views")
        .upsert({
          message_id: activeGlobalMessage.id,
          user_id: user.id,
          account_id: accountId,
          viewed_on: getLocalDateKey(),
          dismissed_at: new Date().toISOString(),
        }, { onConflict: "message_id,user_id,viewed_on" });
    } catch (error) {
      logError(error, { scope: "dashboard_dismiss_global_message", messageId: activeGlobalMessage.id });
    } finally {
      setGlobalMessagesQueue((current) => current.slice(1));
      setDismissingGlobalMessage(false);
    }
  };

  const handleGlobalMessageCta = async () => {
    if (!activeGlobalMessage?.cta_url) return;
    const ctaUrl = String(activeGlobalMessage.cta_url);
    await dismissGlobalMessage();

    if (/^https?:\/\//i.test(ctaUrl)) {
      window.open(ctaUrl, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(ctaUrl.startsWith("/") ? ctaUrl : `/${ctaUrl}`);
  };

  const handleDeletePresentation = async (id: string) => {
    try {
      await deletePresentation(id);
      setPresentations((prev) => prev.filter((presentation) => presentation.id !== id));
      setLoadedCount((prev) => Math.max(0, prev - 1));
      trackEvent("presentation_deleted");
      toast.success("Presentation deleted");
    } catch (error) {
      logError(error, { scope: "dashboard_delete_presentation", presentationId: id });
      toast.error("Failed to delete presentation");
    }
  };

  const handleOpenPresentation = async (presentation: DashboardPresentation) => {
    if (selectionMode) {
      togglePresentationSelection(presentation.id);
      return;
    }

    if (!presentation.isDraft) {
      navigate(`/editor/${presentation.id}`, { state: { from: "dashboard" } });
      return;
    }

    try {
      const draft = await getPresentation(presentation.id);
      if (!draft?.data) {
        navigate(`/editor/${presentation.id}`, { state: { from: "dashboard" } });
        return;
      }

      navigate("/dashboard/create", {
        state: {
          editData: draft.data,
          editId: presentation.id,
          editCampusId: draft.campusId || null,
        },
      });
    } catch (error) {
      logError(error, { scope: "dashboard_open_draft", presentationId: presentation.id });
      toast.error("Could not open draft. Please try again.");
    }
  };

  const handleUseLastSermon = async () => {
    setIsDuplicatingLastPresentation(true);
    try {
      const newPresentationId = await duplicateMostRecentPresentationAsStartingPoint();

      if (!newPresentationId) {
        toast.error("No finished sermon deck found yet.", {
          description: "Create your first presentation, then you can use it as a starting point next week.",
        });
        navigate("/dashboard/create", { state: createPresentationState });
        return;
      }

      const copiedPresentation = await getPresentation(newPresentationId);
      if (!copiedPresentation?.data) {
        throw new Error("Copied presentation did not include form data");
      }

      trackEvent("weekly_shortcut_used");
      toast.success("Last sermon copied for this week.");
      navigate("/dashboard/create", {
        state: {
          editData: copiedPresentation.data,
          editId: newPresentationId,
          editCampusId: copiedPresentation.campusId || null,
        },
      });
    } catch (error) {
      logError(error, { scope: "dashboard_weekly_shortcut" });
      toast.error("Could not copy your last sermon. Please try again.");
    } finally {
      setIsDuplicatingLastPresentation(false);
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await loadPresentationsPage(loadedCount);
    } finally {
      setLoadingMore(false);
    }
  };

  const togglePresentationSelection = (presentationId: string) => {
    setSelectedPresentationIds((prev) => {
      const next = new Set(prev);
      if (next.has(presentationId)) {
        next.delete(presentationId);
      } else {
        next.add(presentationId);
      }
      return next;
    });
  };

  const handleOpenSelectionMode = () => {
    setSelectionMode(true);
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedPresentationIds(new Set());
    setShowBulkExportModal(false);
  };

  const handleSelectAllLoaded = () => {
    setSelectedPresentationIds(new Set(presentations.map((presentation) => presentation.id)));
  };

  const handleBulkExport = async (format: "pptx" | "probundle") => {
    setIsBulkExporting(true);
    try {
      const result = await exportPresentationsAsZip(Array.from(selectedPresentationIds), format);
      toast.success(`Exported ${result.exportedCount} presentation${result.exportedCount === 1 ? "" : "s"} to zip.`);
      if (result.failed.length > 0) {
        toast.error("Some presentations were skipped.", {
          description: result.failed.map((failure) => `${failure.title}: ${failure.reason}`).join(" "),
        });
      }
      setShowBulkExportModal(false);
      handleCancelSelection();
    } catch (error) {
      logError(error, { scope: "dashboard_bulk_export", format, selectedCount: selectedPresentationIds.size });
      toast.error("Bulk export failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsBulkExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    const selectedIds = Array.from(selectedPresentationIds);
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} presentation${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!confirmed) return;

    const failedIds = new Set<string>();

    await Promise.all(
      selectedIds.map(async (id) => {
        try {
          await deletePresentation(id);
        } catch (error) {
          failedIds.add(id);
          logError(error, { scope: "dashboard_bulk_delete_presentation", presentationId: id });
        }
      })
    );

    const deletedCount = selectedIds.length - failedIds.size;

    if (deletedCount > 0) {
      setPresentations((prev) => prev.filter((presentation) => !selectedIds.includes(presentation.id) || failedIds.has(presentation.id)));
      setLoadedCount((prev) => Math.max(0, prev - deletedCount));
      trackEvent("presentation_deleted", { count: deletedCount, source: "bulk" });
    }

    if (failedIds.size === 0) {
      toast.success(`${deletedCount} presentation${deletedCount === 1 ? "" : "s"} deleted`);
      handleCancelSelection();
      return;
    }

    setSelectedPresentationIds(failedIds);

    if (deletedCount > 0) {
      toast.error("Some presentations could not be deleted.", {
        description: `${failedIds.size} failed to delete.`,
      });
    } else {
      toast.error("Failed to delete selected presentations");
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setPresentationMonth("");
    setCampusFilterValue(defaultCampusFilterValue);
    setSortOrder("newest");
  };

  const displayName = profile?.full_name || user?.email || "User";
  const deletionCancelable = isDeletionCancelable(activeDeletionRequest);
  const betaCountdown = formatBetaTrialCountdown(subscription.beta_trial_days_remaining);
  const hasPresentations = presentations.length > 0;
  const hasActiveFilters = Boolean(
    searchInput.trim() ||
      presentationMonth ||
      campusFilterValue !== defaultCampusFilterValue ||
      sortOrder !== "newest"
  );
  const hasSelectedPresentations = selectedPresentationIds.size > 0;
  const selectedCampusFilter = parseCampusFilterValue(campusFilterValue);
  const createPresentationState =
    selectedCampusFilter.type === "active" && selectedCampusFilter.value
      ? { campusFilter: selectedCampusFilter }
      : undefined;
  const dashboardTourSteps: ProductTourStep[] = [
    {
      targetId: "dashboard-presentations-section",
      title: "Start from your dashboard",
      description: "Saved work, drafts, filters, and completed presentations live here so you can return to them anytime.",
    },
    {
      targetId: "dashboard-create-button",
      title: "Create from here",
      description: "This is the main path for starting a new sermon presentation from your title, points, and scripture.",
    },
    {
      targetId: "dashboard-account-button",
      title: "Set your defaults first",
      description: "Account settings help new presentations start with the right translation, team, and campus defaults.",
      nextStage: "account",
      nextPath: "/account",
      nextLabel: "Open Account",
    },
  ];

  return (
    <>
      <div className="app-shell">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/60 bg-white/65 backdrop-blur-md">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-serif text-lg font-semibold text-foreground">
                  Sermon Slide Pro
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowSupportDialog(true)}>
                  <LifeBuoy className="w-4 h-4" />
                  <span className="hidden sm:inline">Contact Support</span>
                </Button>
                <Link to="/account" data-tour-id="dashboard-account-button">
                  <Button variant="ghost" size="sm">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">Account</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Log Out</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-5xl">
          {/* Welcome */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
              Welcome back
            </h1>
            <p className="text-muted-foreground">{displayName}</p>
          </motion.div>

          {activeDeletionRequest && (
            <div className="mb-8 rounded-3xl border border-amber-300/60 bg-amber-50/75 px-6 py-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="font-medium">Organization deletion is scheduled</p>
                  </div>
                  {deletionCancelable ? (
                    <p className="text-sm text-amber-900">
                      This request can be canceled until {formatDeletionDate(activeDeletionRequest.cancelableUntil)}. After that, deletion is final and the account remains available through the current billing term.
                    </p>
                  ) : (
                    <p className="text-sm text-amber-900">
                      The 7-day grace period has ended. Your organization remains available until {formatDeletionDate(activeDeletionRequest.scheduledDeleteAt)}, then it will be permanently deleted.
                    </p>
                  )}
                </div>
                {isAccountOwner && deletionCancelable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCancelDeletionRequest()}
                    disabled={cancelingDeletionRequest}
                    className="border-amber-400 bg-white/70"
                  >
                    {cancelingDeletionRequest ? "Canceling..." : "Cancel Deletion"}
                  </Button>
                ) : (
                  <Link to="/account">
                    <Button variant="outline" size="sm" className="border-amber-400 bg-white/70">
                      View Account
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          {subscription.is_beta_user && (
            <div className="mb-8 rounded-3xl border border-primary/20 bg-primary/5 px-6 py-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Beta user</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Thank you for making Sermon Slide Pro a better platform. We appreciate your feedback and support.
                  </p>
                </div>
              </div>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {showTourCompletionPrompt && (
              <div className="max-w-3xl mx-auto mb-8 rounded-3xl border border-primary/20 bg-primary/5 px-6 py-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles className="h-4 w-4" />
                      <p className="text-sm font-semibold uppercase tracking-[0.18em]">Tour Complete</p>
                    </div>
                    <h2 className="font-serif text-2xl font-semibold text-foreground">
                      You're all set. Start creating your first presentation.
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      The guided tour is finished, and the dashboard is now yours to use normally.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowTourCompletionPrompt(false)}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="hero"
                      onClick={() => {
                        setShowTourCompletionPrompt(false);
                        navigate("/dashboard/create", { replace: true, state: createPresentationState });
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Begin Creating
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Sermon Slide Creator Card */}
            <div className="max-w-2xl mx-auto rounded-3xl glass-panel p-8 mb-14" data-tour-id="dashboard-create-button">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-5">
                  <Presentation className="w-6 h-6 text-primary-foreground" />
                </div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-2">
                  Ready to build your next presentation?
                </h2>
                <p className="text-muted-foreground text-sm mb-6 max-w-xl">
                  {hasPresentations
                    ? "Jump back into the creator to build a new deck before exporting to PowerPoint or ProPresenter."
                    : "Create the deck in minutes, then export it into your existing workflow."}
                </p>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Link to="/dashboard/create" state={createPresentationState}>
                    <Button
                      variant="hero"
                      className="w-full"
                      onClick={() => {
                        trackEvent("dashboard_primary_cta_clicked", { source: "hero_card" });
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Create New Presentation
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUseLastSermon}
                    disabled={isDuplicatingLastPresentation}
                  >
                    <Sparkles className="w-4 h-4" />
                    {isDuplicatingLastPresentation ? "Preparing..." : "Use Last Sermon As Starting Point"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Presentations List */}
            <section data-tour-id="dashboard-presentations-section">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-serif text-2xl font-semibold text-foreground">
                    My Presentations
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshDashboardPresentations()}
                      disabled={loading}
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    {presentations.length > 0 && (
                      <Button
                        variant={selectionMode ? "hero" : "outline"}
                        size="sm"
                        onClick={selectionMode ? handleCancelSelection : handleOpenSelectionMode}
                        aria-pressed={selectionMode}
                      >
                        <CheckSquare className="w-4 h-4" />
                        Select
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-white/70 p-4">
                  <div className={`grid gap-3 ${isEnterpriseAccount ? "md:grid-cols-[minmax(0,1.4fr)_minmax(180px,220px)_minmax(180px,220px)_minmax(180px,220px)_auto]" : "md:grid-cols-[minmax(0,1.5fr)_minmax(180px,220px)_minmax(180px,220px)_auto]"}`}>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder="Search by title or series"
                        className="pl-9"
                      />
                    </div>
                    <Input
                      type="month"
                      value={presentationMonth}
                      onChange={(event) => setPresentationMonth(event.target.value)}
                    />
                    {isEnterpriseAccount && (
                      <Select value={campusFilterValue} onValueChange={setCampusFilterValue}>
                        <SelectTrigger>
                          <SelectValue placeholder="Campus" />
                        </SelectTrigger>
                        <SelectContent>
                          {campusFilterOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Select
                      value={sortOrder}
                      onValueChange={(value) => setSortOrder(value as "newest" | "oldest")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DASHBOARD_SORT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasActiveFilters && (
                      <Button variant="ghost" onClick={clearFilters}>
                        <X className="w-4 h-4" />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {selectionMode && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-foreground">
                        {hasSelectedPresentations
                          ? `${selectedPresentationIds.size} presentation${selectedPresentationIds.size === 1 ? "" : "s"} selected`
                          : "Select presentations to bulk delete or export."}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleSelectAllLoaded}>
                          Select All Loaded
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleBulkDelete()}
                          disabled={!hasSelectedPresentations}
                        >
                          Delete Selected
                        </Button>
                        {subscription.subscribed && (
                        <Button
                          variant="hero"
                          size="sm"
                          onClick={() => setShowBulkExportModal(true)}
                          disabled={!hasSelectedPresentations}
                        >
                          <Download className="w-4 h-4" />
                          Export Selected
                        </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={handleCancelSelection}>
                          Cancel Selection
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="rounded-2xl border border-dashed border-border bg-white/60 p-12 text-center">
                  <p className="text-muted-foreground">Loading presentations...</p>
                </div>
              ) : presentations.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border bg-white/60 p-12 text-center">
                  <Presentation className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    No presentations yet
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    Create a presentation whenever you are ready. It will appear here once saved.
                  </p>
                  <Link to="/dashboard/create" state={createPresentationState}>
                    <Button
                      variant="hero"
                      onClick={() => {
                        trackEvent("dashboard_empty_state_cta_clicked");
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Create New Presentation
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {presentations.map((p) => (
                      <div key={p.id} className="rounded-xl border border-border/70 bg-white/75 backdrop-blur-sm p-4 hover:shadow-soft transition-shadow group">
                        <div
                          className="cursor-pointer"
                          onClick={() => void handleOpenPresentation(p)}
                        >
                          {p.series && (
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-0.5 truncate">
                              {p.series}
                            </p>
                          )}
                          {(p.campusName || p.formerCampusName) && (
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {p.campusName && (
                                <span className="text-[11px] font-medium text-primary">
                                  {p.campusName}
                                </span>
                              )}
                              {p.formerCampusName && (
                                <span className="text-[11px] text-muted-foreground">
                                  Formerly {p.formerCampusName}
                                </span>
                              )}
                            </div>
                          )}
                          {selectionMode && (
                            <div className="flex items-center gap-2 mb-2">
                              <Checkbox
                                checked={selectedPresentationIds.has(p.id)}
                                onCheckedChange={() => togglePresentationSelection(p.id)}
                                aria-label={`Select ${p.title}`}
                              />
                              <span className="text-xs text-muted-foreground">Select</span>
                            </div>
                          )}
                          <h3 className="font-serif font-semibold text-foreground mb-2 group-hover:text-primary transition-colors truncate">
                            {p.title || "Untitled"}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-2">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {p.presentationDate}</span>
                            {p.isDraft ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">Draft</span>
                            ) : (
                              <>
                                <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {p.slides} slides</span>
                                {p.valueMetrics && (
                                  <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {p.valueMetrics.scripturePassageCount} scriptures</span>
                                )}
                              </>
                            )}
                          </div>
                          {!p.isDraft && p.valueMetrics && (
                            <p className="mb-2 text-xs font-medium text-primary">
                              You saved an estimated {formatEstimatedMinutes(p.valueMetrics.estimatedMinutesSaved)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{p.lastModified}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasMorePresentations && (
                    <div className="mt-6 flex justify-center">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? "Loading..." : "Load More"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </motion.div>
        </main>
      </div>
      {user && (
        <ProductTour
          userId={user.id}
          stage="dashboard"
          steps={dashboardTourSteps}
          onNavigate={navigate}
          introTitle="Welcome to Sermon Slide Pro"
          introDescription="We'll walk through setting up your defaults, creating, reviewing, editing, and exporting your first presentation."
          introStartLabel="Start Guided Tour"
        />
      )}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit a Support Request</DialogTitle>
            <DialogDescription>
              Tell us what is going on. Your request will be linked to your organization so support can see the right account context.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitSupportRequest} className="space-y-5">
            <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/35 p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium text-foreground">{profile?.full_name || user?.email || "Signed-in user"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium text-foreground">{profile?.email || user?.email || "Unavailable"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="font-medium text-foreground">{supportOrgName || "Your organization"}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-message">How can we help?</Label>
              <Textarea
                id="support-message"
                rows={6}
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                placeholder="Share what happened, what you were trying to do, and any details that would help us troubleshoot."
                required
              />
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={submittingSupportRequest || !supportMessage.trim()}>
              {submittingSupportRequest ? "Submitting..." : "Submit Support Request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(activeGlobalMessage)}
        onOpenChange={(open) => {
          if (!open) void dismissGlobalMessage();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {activeGlobalMessage && (
            <>
              <DialogHeader>
                <DialogTitle>{activeGlobalMessage.title}</DialogTitle>
                <DialogDescription className="whitespace-pre-wrap pt-2 text-left leading-relaxed">
                  {activeGlobalMessage.body}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void dismissGlobalMessage()}
                  disabled={dismissingGlobalMessage}
                >
                  Close
                </Button>
                {activeGlobalMessage.cta_label && activeGlobalMessage.cta_url && (
                  <Button
                    type="button"
                    variant="hero"
                    onClick={() => void handleGlobalMessageCta()}
                    disabled={dismissingGlobalMessage}
                  >
                    {activeGlobalMessage.cta_label}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ExportOptionsModal
        isOpen={showBulkExportModal}
        onClose={() => setShowBulkExportModal(false)}
        onExport={handleBulkExport}
        isExporting={isBulkExporting}
        title="Export Selected Presentations"
        description="Choose one format for all selected presentations. They will be packaged into a single zip file."
        exportingLabel="Preparing zip export..."
      />
    </>
  );
};

export default Dashboard;
