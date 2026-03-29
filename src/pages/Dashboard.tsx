import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  LogOut,
  Presentation,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Clock,
  User,
  CreditCard,
  Sparkles,
} from "lucide-react";
import {
  getPresentations,
  deletePresentation,
  type SermonPresentation,
} from "@/lib/presentations";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logError, trackEvent } from "@/lib/monitoring";
import ProductTour, { type ProductTourStep } from "@/components/ProductTour";
import { consumeProductTourCompletion } from "@/lib/product-tour";

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, signOut, checkSubscription } = useAuth();
  const [presentations, setPresentations] = useState<SermonPresentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTourCompletionPrompt, setShowTourCompletionPrompt] = useState(false);

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

  const loadPresentations = async () => {
    setLoading(true);
    try {
      const data = await getPresentations();
      setPresentations(data);
      trackEvent("presentations_loaded", { count: data.length });
    } catch (error) {
      logError(error, { scope: "dashboard_load_presentations" });
      toast.error("Failed to load presentations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresentations();
  }, []);

  const handleLogout = async () => {
    trackEvent("logout_clicked");
    await signOut();
    navigate("/");
  };

  const handleDeletePresentation = async (id: string) => {
    await deletePresentation(id);
    trackEvent("presentation_deleted");
    await loadPresentations();
    toast.success("Presentation deleted");
  };

  const displayName = profile?.full_name || user?.email || "User";
  const hasPresentations = presentations.length > 0;
  const dashboardTourSteps: ProductTourStep[] = [
    {
      targetId: "dashboard-account-button",
      title: "Manage your account here",
      description: "Use Account to review your plan, billing, and team settings without leaving the app.",
    },
    {
      targetId: "dashboard-create-button",
      title: "Start from the creator",
      description: "This button opens the guided creator where you add your title, points, and verses.",
    },
    {
      targetId: "dashboard-presentations-section",
      title: "Your saved presentations live here",
      description: "Any presentation you create will appear in this section so you can reopen and edit it later.",
      nextStage: "create",
      nextPath: "/dashboard/create",
      nextLabel: "Open Creator",
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
                        navigate("/dashboard/create", { replace: true });
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
                    ? "Jump back into the creator to build a new presentation with automatic scripture lookup and export-ready slides."
                    : "Create, edit, and export presentation slides from one place whenever you are ready."}
                </p>
                <div className="flex flex-col gap-3 w-full sm:w-auto sm:flex-row">
                  <Link to="/dashboard/create">
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
                  <Link to="/account">
                    <Button variant="outline" className="w-full">
                      <CreditCard className="w-4 h-4" />
                      View Plan & Account
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Presentations List */}
            <section data-tour-id="dashboard-presentations-section">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-semibold text-foreground">
                  My Presentations
                </h2>
                <Link to="/dashboard/create">
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4" />
                    New
                  </Button>
                </Link>
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
                  <Link to="/dashboard/create">
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
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {presentations.map((p) => (
                    <div key={p.id} className="rounded-xl border border-border/70 bg-white/75 backdrop-blur-sm p-5 hover:shadow-soft transition-shadow group">
                      <div className="cursor-pointer" onClick={() => navigate(`/editor/${p.id}`, { state: { from: "dashboard" } })}>
                        <h3 className="font-serif font-semibold text-foreground mb-1 group-hover:text-primary transition-colors truncate">
                          {p.title || "Untitled"}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {p.date}</span>
                          <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {p.slides} slides</span>
                        </div>
                        <p className="text-xs text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{p.lastModified}</p>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeletePresentation(p.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
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
          introDescription="Take a quick guided tour of the dashboard, creator, and editor so you can learn the full workflow from first presentation to export."
          introStartLabel="Start Guided Tour"
        />
      )}
    </>
  );
};

export default Dashboard;
