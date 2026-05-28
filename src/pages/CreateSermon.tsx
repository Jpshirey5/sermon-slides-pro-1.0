import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  BookOpen,
  ArrowLeft,
  Plus,
  Sparkles,
  Trash2,
  GripVertical,
  Wand2,
  Loader2,
  Book,
} from "lucide-react";
import { formatScriptureReferenceForDisplay, getFriendlyScriptureError, lookupScripture } from "@/lib/scripture-api";
import { savePresentation, type SermonPresentation, type SlideStyle, type ThemeStyle } from "@/lib/presentations";
import { useAuth } from "@/contexts/AuthContext";
import { getAvailableTranslations, isTranslationAllowed, DEFAULT_TRANSLATION } from "@/lib/translations";
import { logError, trackEvent } from "@/lib/monitoring";
import ProductTour, { type ProductTourStep } from "@/components/ProductTour";
import StructuredBuilderInfoModal from "@/components/StructuredBuilderInfoModal";
import { consumeCreateTourPrompt } from "@/lib/product-tour";
import { listAccountCampuses, type Campus } from "@/lib/campuses";

interface Scripture {
  reference: string;
  text?: string;
  verses?: { text: string; verse: number }[];
  isLoading?: boolean;
  error?: boolean;
  errorMessage?: string;
}

interface SermonPoint {
  id: string;
  type: 'point' | 'verse';
  title: string;
  scriptures: Scripture[];
}

const CreateSermon = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, accountId, subscription, canUseEsv } = useAuth();
  const isFromDashboard = location.pathname.startsWith("/dashboard");
  const editData = (location.state as any)?.editData;
  const editId = (location.state as any)?.editId;
  const editCampusId = (location.state as any)?.editCampusId || editData?.campusId || "";
  const dashboardCampusFilter = (location.state as any)?.campusFilter || null;
  const isEnterpriseAccount = subscription.plan_tier === "enterprise";
  const [draftId] = useState(() => editId || crypto.randomUUID());
  const [title, setTitle] = useState(editData?.title || "");
  const [series, setSeries] = useState(editData?.series || "");
  const [presentationDate, setPresentationDate] = useState(
    editData?.date || new Date().toISOString().split("T")[0]
  );
  const [availableCampuses, setAvailableCampuses] = useState<Campus[]>([]);
  const [campusId, setCampusId] = useState(editCampusId);
  const [campusesLoading, setCampusesLoading] = useState(false);
  const [globalTranslation, setGlobalTranslation] = useState(editData?.translation || DEFAULT_TRANSLATION);
  const [verseBreakdown, setVerseBreakdown] = useState(editData?.verseBreakdown || "verse-by-verse");
  const [proPresenterMode, setProPresenterMode] = useState(Boolean(editData?.proPresenterMode));
  const [slideStyle, setSlideStyle] = useState<SlideStyle>(editData?.slideStyle || "balanced");
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>(editData?.themeStyle || "clean");
  const [showTourBuilderPrompt, setShowTourBuilderPrompt] = useState(false);
  const [showStructuredBuilderInfo, setShowStructuredBuilderInfo] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [points, setPoints] = useState<SermonPoint[]>(
    editData?.points
      ? editData.points.map((p: any) => ({
          id: p.id,
          type: p.type || 'point',
          title: p.title,
          scriptures: (p.type || 'point') === 'verse'
            ? p.scriptures.map((s: any) => ({
                reference: s.reference,
                text: s.text,
                verses: s.verses,
              }))
            : [],
        }))
      : []
  );

  useEffect(() => {
    if (!user || subscription.signup_status !== "pending_checkout") return;
    const params = new URLSearchParams();
    const pendingPriceId = localStorage.getItem("pending_pro_checkout_price_id");
    if (pendingPriceId) params.set("priceId", pendingPriceId);
    navigate(`/signup-incomplete${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
  }, [navigate, subscription.signup_status, user]);
  
  // Track pending lookups with debounce
  const lookupTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const lookupVersions = useRef<Record<string, number>>({});
  const appliedDefaultRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedDraftRef = useRef("");

  const clearLookupTimeout = useCallback((key: string) => {
    if (lookupTimeouts.current[key]) {
      clearTimeout(lookupTimeouts.current[key]);
      delete lookupTimeouts.current[key];
    }
  }, []);

  useEffect(() => {
    trackEvent("create_sermon_viewed", {
      fromDashboard: isFromDashboard,
      editingExisting: Boolean(editId),
    });
  }, [editId, isFromDashboard]);

  // Pay-per-export guests land here from the landing page. Explain that this is
  // the manual Structured Builder, and that AI Quick Build requires an account.
  useEffect(() => {
    if (isFromDashboard || user || editId) return;
    setShowStructuredBuilderInfo(true);
  }, [editId, isFromDashboard, user]);

  useEffect(() => {
    if (editData?.translation) return;
    if (appliedDefaultRef.current) return;
    if (!profile?.default_translation) return;
    if (!isTranslationAllowed(profile.default_translation, canUseEsv)) return;
    setGlobalTranslation(profile.default_translation);
    appliedDefaultRef.current = true;
  }, [profile?.default_translation, editData?.translation, canUseEsv]);

  // Never leave a restricted translation selected for users who aren't entitled
  // (e.g. opening a sermon previously created with ESV).
  useEffect(() => {
    if (!isTranslationAllowed(globalTranslation, canUseEsv)) {
      setGlobalTranslation(DEFAULT_TRANSLATION);
    }
  }, [globalTranslation, canUseEsv]);

  useEffect(() => {
    if (!user) return;

    const shouldShowPrompt = consumeCreateTourPrompt(user.id);
    if (shouldShowPrompt) {
      setShowTourBuilderPrompt(true);
      trackEvent("create_tour_prompt_shown");
    }
  }, [user]);

  useEffect(() => {
    if (!isEnterpriseAccount || !accountId) {
      setAvailableCampuses([]);
      setCampusId("");
      return;
    }

    let cancelled = false;

    const loadCampuses = async () => {
      setCampusesLoading(true);
      try {
        const campuses = await listAccountCampuses(accountId);
        if (cancelled) return;
        setAvailableCampuses(campuses);
        setCampusId((currentCampusId) => {
          const dashboardSelectedCampusId =
            dashboardCampusFilter?.type === "active" ? dashboardCampusFilter.value || "" : "";
          const preferredCampusId = editCampusId || dashboardSelectedCampusId || currentCampusId;

          if (preferredCampusId && campuses.some((campus) => campus.id === preferredCampusId)) {
            return preferredCampusId;
          }

          return campuses.find((campus) => campus.isPrimary)?.id || campuses[0]?.id || "";
        });
      } catch (error) {
        logError(error, { scope: "create_sermon_load_campuses" });
        if (!cancelled) {
          setAvailableCampuses([]);
        }
      } finally {
        if (!cancelled) {
          setCampusesLoading(false);
        }
      }
    };

    void loadCampuses();

    return () => {
      cancelled = true;
    };
  }, [accountId, dashboardCampusFilter?.type, dashboardCampusFilter?.value, editCampusId, isEnterpriseAccount]);

  const addPoint = () => {
    const newId = String(Date.now());
    setPoints([...points, { id: newId, type: "point", title: "", scriptures: [] }]);
  };

  const addVerse = () => {
    const newId = String(Date.now());
    setPoints([...points, { id: newId, type: "verse", title: "", scriptures: [{ reference: "" }] }]);
  };

  const removePoint = (id: string) => {
    setPoints(points.filter((p) => p.id !== id));
  };

  const updatePoint = (id: string, title: string) => {
    setPoints(points.map((p) => (p.id === id ? { ...p, title } : p)));
  };

  const addScripture = (pointId: string) => {
    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: [
                ...p.scriptures,
                { reference: "" },
              ],
            }
          : p
      )
    );
  };

  // Auto-lookup scripture when reference changes (debounced)
  const autoLookupScripture = useCallback(async (pointId: string, index: number, reference: string, translationOverride?: string) => {
    if (!reference.trim()) return;
    const translationToUse = translationOverride || globalTranslation;

    // Clear any existing timeout for this scripture
    const key = `${pointId}-${index}`;
    clearLookupTimeout(key);
    const lookupVersion = (lookupVersions.current[key] || 0) + 1;
    lookupVersions.current[key] = lookupVersion;

    // Set loading state
    setPoints(prev =>
      prev.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: p.scriptures.map((s, i) =>
                i === index ? { ...s, isLoading: true } : s
              ),
            }
          : p
      )
    );

    // Debounce the lookup by 800ms
    lookupTimeouts.current[key] = setTimeout(async () => {
      try {
        const result = await lookupScripture(reference, translationToUse);
        if (lookupVersions.current[key] !== lookupVersion) return;

        if (result) {
          if (result.error) {
            // Handle error from API
            setPoints(prev =>
              prev.map((p) =>
                p.id === pointId
                  ? {
                      ...p,
                      scriptures: p.scriptures.map((s, i) =>
                        i === index ? { 
                          ...s, 
                          text: undefined, 
                          isLoading: false,
                          error: true,
                          errorMessage: result.errorMessage || getFriendlyScriptureError()
                        } : s
                      ),
                    }
                  : p
              )
            );
          } else {
            // Success
            setPoints(prev =>
              prev.map((p) =>
                p.id === pointId
                  ? {
                      ...p,
                      scriptures: p.scriptures.map((s, i) =>
                        i === index ? { 
                          ...s, 
                          text: result.text,
                          verses: result.verses,
                          isLoading: false,
                          error: false,
                          errorMessage: undefined
                        } : s
                      ),
                    }
                  : p
              )
            );
          }
        } else {
          if (lookupVersions.current[key] !== lookupVersion) return;
          setPoints(prev =>
            prev.map((p) =>
              p.id === pointId
                ? {
                    ...p,
                    scriptures: p.scriptures.map((s, i) =>
                      i === index ? { 
                        ...s, 
                        isLoading: false,
                        error: true,
                        errorMessage: getFriendlyScriptureError()
                      } : s
                    ),
                  }
                : p
            )
          );
        }
      } catch (error) {
        logError(error, {
          scope: "scripture_lookup",
          pointId,
          index,
          translation: translationToUse,
        });
        if (lookupVersions.current[key] !== lookupVersion) return;
        setPoints(prev =>
          prev.map((p) =>
            p.id === pointId
              ? {
                  ...p,
                  scriptures: p.scriptures.map((s, i) =>
                    i === index ? { 
                      ...s, 
                      isLoading: false,
                      error: true,
                      errorMessage: getFriendlyScriptureError("network error")
                    } : s
                  ),
                }
              : p
          )
        );
      } finally {
        clearLookupTimeout(key);
      }
    }, 800);
  }, [clearLookupTimeout, globalTranslation]);

  const updateScripture = (
    pointId: string,
    index: number,
    reference: string
  ) => {
    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: p.scriptures.map((s, i) =>
                i === index ? { ...s, reference, text: undefined, verses: undefined, error: false, errorMessage: undefined } : s
              ),
            }
          : p
      )
    );

    // Trigger auto-lookup
    autoLookupScripture(pointId, index, reference);
  };

  const removeScripture = (pointId: string, index: number) => {
    // Clear any pending timeout
    const key = `${pointId}-${index}`;
    clearLookupTimeout(key);
    delete lookupVersions.current[key];

    setPoints(
      points.map((p) =>
        p.id === pointId
          ? {
              ...p,
              scriptures: p.scriptures.filter((_, i) => i !== index),
            }
          : p
      )
    );
  };

  // Re-lookup all scriptures when global translation changes
  const handleTranslationChange = (newTranslation: string) => {
    setGlobalTranslation(newTranslation);
    // Cancel stale pending lookups before re-querying in the new translation.
    Object.keys(lookupTimeouts.current).forEach((key) => clearLookupTimeout(key));

    points.forEach((point) => {
      point.scriptures.forEach((scripture, index) => {
        if (scripture.reference.trim()) {
          autoLookupScripture(point.id, index, scripture.reference, newTranslation);
        }
      });
    });
  };

  useEffect(() => {
    return () => {
      Object.keys(lookupTimeouts.current).forEach((key) => clearLookupTimeout(key));
    };
  }, [clearLookupTimeout]);

  const hasValidContent = points.some((point) =>
    point.type === "point"
      ? point.title.trim().length > 0
      : point.scriptures.some((scripture) => scripture.reference.trim().length > 0)
  );

  const hasMeaningfulDraftContent = Boolean(title.trim() || series.trim() || hasValidContent);

  const buildPresentationPayload = useCallback((): SermonPresentation => ({
    id: draftId,
    title: title.trim() || "Untitled Presentation",
    series: series.trim() || null,
    campusId: isEnterpriseAccount ? campusId || null : null,
    presentationDate,
    date: presentationDate,
    slides: 0,
    lastModified: "Just now",
    data: {
      title,
      series: series.trim() || null,
      date: presentationDate,
      verseBreakdown,
      translation: globalTranslation,
      proPresenterMode,
      slideStyle,
      themeStyle,
      points: points.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title,
        scriptures: p.type === "verse"
          ? p.scriptures.map((s) => ({
              reference: formatScriptureReferenceForDisplay(s.reference),
              text: s.text,
              verses: s.verses,
            }))
          : [],
      })),
    },
  }), [campusId, draftId, globalTranslation, isEnterpriseAccount, points, presentationDate, proPresenterMode, series, slideStyle, themeStyle, title, verseBreakdown]);

  useEffect(() => {
    if (saveStatus !== "saved") return;

    const serializedPayload = JSON.stringify(buildPresentationPayload());
    if (serializedPayload !== lastSavedDraftRef.current) {
      setSaveStatus("idle");
    }
  }, [buildPresentationPayload, saveStatus]);

  const handleSaveDraft = async () => {
    if (!hasMeaningfulDraftContent) {
      const { toast } = await import("sonner");
      toast.error("Add a title, series, point, or verse before saving.");
      return;
    }

    if (isEnterpriseAccount && !campusId) {
      const { toast } = await import("sonner");
      toast.error("Select a campus before saving.");
      return;
    }

    const presentationPayload = buildPresentationPayload();

    try {
      setSaveStatus("saving");
      const savedId = await savePresentation(presentationPayload);

      if (!savedId) {
        throw new Error("Manual draft save returned no id");
      }

      lastSavedDraftRef.current = JSON.stringify(presentationPayload);
      setSaveStatus("saved");
      trackEvent("sermon_draft_saved", {
        editingExisting: Boolean(editId),
        hasTitle: Boolean(title.trim()),
      });
      const { toast } = await import("sonner");
      toast.success("Draft saved.");
    } catch (error) {
      logError(error, { scope: "create_sermon_manual_save", sermonId: draftId });
      setSaveStatus("error");
      const { toast } = await import("sonner");
      toast.error("Could not save draft. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEnterpriseAccount && !campusId) {
      const { toast } = await import("sonner");
      toast.error("Select a campus before generating slides.");
      return;
    }
    setShowTourBuilderPrompt(false);
      trackEvent("sermon_generation_submitted", {
      editingExisting: Boolean(editId),
      pointCount: points.length,
      hasTitle: Boolean(title.trim()),
      verseBreakdown,
      translation: globalTranslation,
      proPresenterMode,
      slideStyle,
      themeStyle,
    });
    
    const presentationPayload = buildPresentationPayload();

    try {
      setSaveStatus("saving");
      const savedId = await savePresentation(presentationPayload);
      
      if (savedId) {
        lastSavedDraftRef.current = JSON.stringify(presentationPayload);
        setSaveStatus("saved");
        trackEvent("sermon_review_started", {
          editingExisting: Boolean(editId),
        });
        const reviewPath = isFromDashboard ? `/dashboard/create/review/${savedId}` : `/create/review/${savedId}`;
        navigate(reviewPath, { state: { fromDashboard: isFromDashboard } });
      } else {
        trackEvent("sermon_generation_failed", {
          editingExisting: Boolean(editId),
          reason: "save_presentation_returned_null",
        });
        const { toast } = await import("sonner");
        toast.error("Failed to save presentation. Please try again.");
      }
    } catch (error) {
      logError(error, {
        scope: "sermon_generation_submit",
        editingExisting: Boolean(editId),
      });
      setSaveStatus("error");
      const { toast } = await import("sonner");
      toast.error("Failed to save presentation. Please try again.");
    }
  };

  const createTourSteps: ProductTourStep[] = [
    {
      targetId: "create-sermon-title",
      title: "Sermon title",
      description: "Give this sermon a clear, recognizable title — it appears on the first slide and on your dashboard.",
    },
    {
      targetId: "create-sermon-series",
      title: "Sermon series",
      description: "Optional. If this sermon is part of a series, add the series name so it groups with related sermons.",
    },
    {
      targetId: "create-sermon-date",
      title: "Presentation date",
      description: "This is the date the sermon will actually be preached — used to sort upcoming sermons on your dashboard.",
    },
    ...(isEnterpriseAccount
      ? [{
          targetId: "create-sermon-campus",
          title: "Choose a campus",
          description: "Save this sermon to the campus that will be preaching it so it can be filtered on the dashboard later.",
        }]
      : []),
    {
      targetId: "create-sermon-translation",
      title: "Use your default translation",
      description: "This starts from your Account default but can be changed for this sermon.",
    },
    {
      targetId: "create-sermon-verse-breakdown",
      title: "Verse passage breakdown",
      description: "Choose whether multi-verse passages get one slide per verse, or stay grouped on a single slide.",
    },
    {
      targetId: "create-sermon-points",
      title: "Build the sermon flow",
      description: "Add points and scripture references. Verses autofill as references are entered.",
    },
    {
      targetId: "create-sermon-save",
      title: "Save a draft manually",
      description: "Use Save when you want to keep sermon form progress without creating slides yet. Nothing is saved automatically.",
    },
    {
      targetId: "create-sermon-generate",
      title: "Review before creating slides",
      description: "Generate moves to the review page and updates this same presentation when slides are finalized.",
      nextStage: "review",
      nextLabel: "Got it",
    },
  ];

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="border-b border-border/60 bg-white/65 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Back */}
            <Link
              to={isFromDashboard ? "/dashboard" : "/"}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">
                {isFromDashboard ? "Back to Dashboard" : "Back to Home"}
              </span>
            </Link>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Sermon Slide Pro
              </span>
            </Link>

            {/* Save / Generate */}
            <div className="flex items-center gap-2">
              <Button
                data-tour-id="create-sermon-save"
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={
                  saveStatus === "saving" ||
                  !hasMeaningfulDraftContent ||
                  (isEnterpriseAccount && (campusesLoading || !campusId))
                }
              >
                <span className="hidden sm:inline">Save as Draft</span>
                <span className="sm:hidden">Save</span>
              </Button>
              <Button
                variant="hero"
                onClick={handleSubmit}
                disabled={!title.trim() || !hasValidContent || (isEnterpriseAccount && (campusesLoading || !campusId))}
              >
                <Wand2 className="w-4 h-4" />
                <span className="hidden sm:inline">Review Slides</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Create New Presentation
          </h1>
          <p className="text-muted-foreground mb-8">
            Enter your sermon details and we'll generate presentation slides for
            you.
          </p>

          {showTourBuilderPrompt && (
            <div className="mb-8 rounded-3xl border border-primary/20 bg-primary/5 px-6 py-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-sm font-semibold uppercase tracking-[0.18em]">Next Step</p>
                  </div>
                  <h2 className="font-serif text-2xl font-semibold text-foreground">
                    You're ready. Try the creator and generate your slides.
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Fill in your sermon details, build the outline, and then generate slides to continue the tour in the editor.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowTourBuilderPrompt(false)}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="hero"
                    onClick={() => {
                      titleInputRef.current?.focus();
                      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    <Wand2 className="w-4 h-4" />
                    Open the Creator
                  </Button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info */}
            <div className="p-6 rounded-2xl glass-panel space-y-6">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Sermon Details
              </h2>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Presentation Title</Label>
                  <Input
                    ref={titleInputRef}
                    data-tour-id="create-sermon-title"
                    id="title"
                    type="text"
                    placeholder="e.g., The Power of Faith"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="series">Series</Label>
                  <Input
                    data-tour-id="create-sermon-series"
                    id="series"
                    type="text"
                    placeholder="e.g., Summer in Psalms"
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    className="h-12"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="presentationDate">Presentation Date</Label>
                  <Input
                    data-tour-id="create-sermon-date"
                    id="presentationDate"
                    type="date"
                    value={presentationDate}
                    onChange={(e) => setPresentationDate(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="translation">Bible Translation</Label>
                  <Select
                    value={globalTranslation}
                    onValueChange={handleTranslationChange}
                  >
                    <SelectTrigger className="h-12" data-tour-id="create-sermon-translation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableTranslations(canUseEsv).map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          <span className="font-medium">{t.code}</span>
                          <span className="text-muted-foreground ml-2">
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isEnterpriseAccount && (
                <div className="space-y-2">
                  <Label htmlFor="campus">Campus</Label>
                  <Select value={campusId} onValueChange={setCampusId} disabled={campusesLoading || availableCampuses.length === 0}>
                    <SelectTrigger id="campus" className="h-12" data-tour-id="create-sermon-campus">
                      <SelectValue placeholder={campusesLoading ? "Loading campuses..." : "Select a campus"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCampuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>
                          {campus.isPrimary ? `${campus.name} (Primary)` : campus.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Enterprise presentations are saved to a campus so they can be filtered on the dashboard.
                  </p>
                </div>
              )}

              {/* Verse Breakdown */}
              <div className="space-y-3" data-tour-id="create-sermon-verse-breakdown">
                <Label>Verse Passage Breakdown</Label>
                <RadioGroup
                  value={verseBreakdown}
                  onValueChange={setVerseBreakdown}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="verse-by-verse" id="verse-by-verse" />
                    <Label htmlFor="verse-by-verse" className="cursor-pointer font-normal">
                      Verse by Verse
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="full-verses" id="full-verses" />
                    <Label htmlFor="full-verses" className="cursor-pointer font-normal">
                      Full Passages
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  {verseBreakdown === "verse-by-verse"
                    ? "Each verse will be placed on its own slide (single verses or multiverse passages)."
                    : "Multiverse passages will be placed on the same slide."}
                </p>
              </div>
            </div>

            {/* Sermon Points */}
            <div className="space-y-4" data-tour-id="create-sermon-points">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Sermon Layout
              </h2>

              <Reorder.Group axis="y" values={points} onReorder={setPoints} className="space-y-4">
              {points.map((point, pointIndex) => (
                <Reorder.Item
                  key={point.id}
                  value={point}
                  className="p-6 rounded-2xl glass-panel"
                >
                {/* Point Header */}
                  <div className="flex items-start gap-4">
                    {point.type === 'point' ? (
                      <>
                        <div className="flex items-center gap-2 text-muted-foreground cursor-grab">
                          <GripVertical className="w-5 h-5" />
                          <span className="font-semibold text-foreground">
                            {points.filter((p, i) => i <= pointIndex && p.type === 'point').length}.
                          </span>
                        </div>

                        <div className="flex-1 space-y-4">
                          <div className="flex items-center gap-4">
                            <Input
                              type="text"
                              placeholder="Enter sermon point title..."
                              value={point.title}
                              onChange={(e) => updatePoint(point.id, e.target.value)}
                              className="h-12 flex-1"
                            />
                            {points.length > 0 && (
                              <button
                                type="button"
                                onClick={() => removePoint(point.id)}
                                className="p-2 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Verse-only layout */
                      <>
                        <div className="flex items-center gap-2 text-muted-foreground cursor-grab">
                          <GripVertical className="w-5 h-5" />
                          <span className="font-semibold text-foreground">Verse</span>
                        </div>

                        <div className="flex-1 space-y-4">
                          <div className="flex items-center justify-end">
                            {points.length > 0 && (
                              <button
                                type="button"
                                onClick={() => removePoint(point.id)}
                                className="p-2 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>

                          <div className="pl-4 border-l-2 border-border space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Scripture — verses auto-populate using {globalTranslation}
                            </p>

                            {point.scriptures.map((scripture, scriptureIndex) => (
                              <div
                                key={scriptureIndex}
                                className="space-y-2"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="relative flex-1">
                                    <Input
                                      type="text"
                                      placeholder="e.g., John 3:16"
                                      value={scripture.reference}
                                      onChange={(e) =>
                                        updateScripture(
                                          point.id,
                                          scriptureIndex,
                                          e.target.value
                                        )
                                      }
                                      className="pr-10"
                                    />
                                    {scripture.isLoading && (
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeScripture(point.id, scriptureIndex)
                                    }
                                    className="p-2 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                                {scripture.error && scripture.errorMessage && (
                                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                                    <p className="text-sm text-destructive">
                                      {scripture.errorMessage}
                                    </p>
                                  </div>
                                )}
                                {scripture.text && !scripture.error && (
                                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                    <p className="text-sm text-muted-foreground italic">
                                      "{scripture.text}"
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      — {scripture.reference} ({globalTranslation})
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}

                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </Reorder.Item>
              ))}
              </Reorder.Group>

              {/* Add Point Button at Bottom */}
              <div className="flex justify-center gap-4 pt-2">
                <Button type="button" variant="outline" onClick={addPoint} className="flex-1 max-w-xs">
                  <Plus className="w-4 h-4" />
                    Add Point
                </Button>
                <Button type="button" variant="outline" onClick={addVerse} className="flex-1 max-w-xs">
                  <Book className="w-4 h-4" />
                  Add Verse
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                data-tour-id="create-sermon-generate"
                type="submit"
                variant="hero"
                size="lg"
                disabled={!title.trim() || !hasValidContent || (isEnterpriseAccount && (campusesLoading || !campusId))}
              >
                <Wand2 className="w-5 h-5" />
                Review Slides
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
      {user && (
        <ProductTour
          userId={user.id}
          stage="create"
          steps={createTourSteps}
        />
      )}
      <StructuredBuilderInfoModal
        open={showStructuredBuilderInfo}
        onOpenChange={setShowStructuredBuilderInfo}
      />
    </div>
  );
};

export default CreateSermon;
