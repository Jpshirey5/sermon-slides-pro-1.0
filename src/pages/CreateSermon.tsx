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
  Trash2,
  GripVertical,
  Wand2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Book,
} from "lucide-react";
import { lookupScripture } from "@/lib/scripture-api";
import { savePresentation } from "@/lib/presentations";
import { useAuth } from "@/contexts/AuthContext";
import { TRANSLATION_OPTIONS, DEFAULT_TRANSLATION } from "@/lib/translations";

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
  const { profile } = useAuth();
  const isFromDashboard = location.pathname.startsWith("/dashboard");
  const editData = (location.state as any)?.editData;
  const editId = (location.state as any)?.editId;
  const [title, setTitle] = useState(editData?.title || "");
  const [globalTranslation, setGlobalTranslation] = useState(editData?.translation || DEFAULT_TRANSLATION);
  const [verseBreakdown, setVerseBreakdown] = useState(editData?.verseBreakdown || "verse-by-verse");
  const [points, setPoints] = useState<SermonPoint[]>(
    editData?.points
      ? editData.points.map((p: any) => ({
          id: p.id,
          type: p.type || 'point',
          title: p.title,
          scriptures: p.scriptures.map((s: any) => ({
            reference: s.reference,
            text: s.text,
            verses: s.verses,
          })),
        }))
      : [{ id: "1", type: "point", title: "", scriptures: [] }]
  );
  const [expandedPoints, setExpandedPoints] = useState<string[]>(
    editData?.points ? editData.points.map((p: any) => p.id) : ["1"]
  );
  
  // Track pending lookups with debounce
  const lookupTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const lookupVersions = useRef<Record<string, number>>({});
  const appliedDefaultRef = useRef(false);

  const clearLookupTimeout = useCallback((key: string) => {
    if (lookupTimeouts.current[key]) {
      clearTimeout(lookupTimeouts.current[key]);
      delete lookupTimeouts.current[key];
    }
  }, []);

  useEffect(() => {
    if (editData?.translation) return;
    if (appliedDefaultRef.current) return;
    if (!profile?.default_translation) return;
    setGlobalTranslation(profile.default_translation);
    appliedDefaultRef.current = true;
  }, [profile?.default_translation, editData?.translation]);

  const addPoint = () => {
    const newId = String(Date.now());
    setPoints([...points, { id: newId, type: "point", title: "", scriptures: [] }]);
    setExpandedPoints([...expandedPoints, newId]);
  };

  const addVerse = () => {
    const newId = String(Date.now());
    setPoints([...points, { id: newId, type: "verse", title: "", scriptures: [{ reference: "" }] }]);
    setExpandedPoints([...expandedPoints, newId]);
  };

  const removePoint = (id: string) => {
    if (points.length > 1) {
      setPoints(points.filter((p) => p.id !== id));
      setExpandedPoints(expandedPoints.filter((e) => e !== id));
    }
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
                          errorMessage: result.errorMessage || 'Could not find scripture'
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
                        errorMessage: 'Could not find scripture. Please check the reference.'
                      } : s
                    ),
                  }
                : p
            )
          );
        }
      } catch (error) {
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
                      errorMessage: 'Network error. Please try again.'
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

  const toggleExpanded = (id: string) => {
    setExpandedPoints((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use editId if re-editing, otherwise generate new ID
    const presentationId = editId || crypto.randomUUID();
    
    // Calculate slide count
    let slideCount = 1; // Title slide
    points.forEach(point => {
      if (point.type === 'verse') {
        point.scriptures.forEach(s => {
          if (s.reference && s.text) {
            slideCount++;
          }
        });
      } else if (point.title) {
        slideCount++; // Point slide
        point.scriptures.forEach(s => {
          if (s.reference && s.text) {
            slideCount++;
          }
        });
      }
    });
    
    // Save presentation data to Supabase
    const savedId = await savePresentation({
      id: presentationId,
      title: title,
      date: new Date().toISOString().split('T')[0],
      slides: slideCount,
      lastModified: 'Just now',
      data: {
        title,
        date: new Date().toISOString().split('T')[0],
        verseBreakdown,
        translation: globalTranslation,
        points: points.map(p => ({
          id: p.id,
          type: p.type,
          title: p.title,
          scriptures: p.scriptures.map(s => ({
            reference: s.reference,
            text: s.text,
            verses: s.verses,
          })),
        })),
      },
    });
    
    if (savedId) {
      navigate(`/editor/${savedId}`);
    } else {
      const { toast } = await import("sonner");
      toast.error("Failed to save presentation. Please try again.");
    }
  };

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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Sermon Slide Pro
              </span>
            </div>

            {/* Generate */}
            <Button
              variant="hero"
              onClick={handleSubmit}
              disabled={!title || points.every((p) => p.type === 'point' ? !p.title : !p.scriptures.some(s => s.reference.trim()))}
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">Generate Slides</span>
            </Button>
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
            Enter your sermon details and we'll generate beautiful slides for
            you.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info */}
            <div className="p-6 rounded-2xl glass-panel space-y-6">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Sermon Details
              </h2>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Sermon Title</Label>
                  <Input
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
                  <Label htmlFor="translation" className="flex items-center gap-2">
                    <Book className="w-4 h-4" />
                    Bible Translation
                  </Label>
                  <Select
                    value={globalTranslation}
                    onValueChange={handleTranslationChange}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSLATION_OPTIONS.map((t) => (
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

              {/* Verse Breakdown */}
              <div className="space-y-3">
                <Label>Verse Breakdown</Label>
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
                      Full Verses
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Sermon Points */}
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Sermon Points
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
                            <button
                              type="button"
                              onClick={() => toggleExpanded(point.id)}
                              className="p-2 text-muted-foreground hover:text-foreground"
                            >
                              {expandedPoints.includes(point.id) ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                            {points.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePoint(point.id)}
                                className="p-2 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>

                          {/* Scriptures */}
                          {expandedPoints.includes(point.id) && (
                            <div className="pl-4 border-l-2 border-border space-y-4">
                              <p className="text-sm text-muted-foreground">
                                Supporting Scriptures (optional) — verses auto-populate using {globalTranslation}
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

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => addScripture(point.id)}
                              >
                                <Plus className="w-4 h-4" />
                                Add Scripture
                              </Button>
                            </div>
                          )}
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
                            {points.length > 1 && (
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
                  Add Sermon Point
                </Button>
                <Button type="button" variant="outline" onClick={addVerse} className="flex-1 max-w-xs">
                  <Book className="w-4 h-4" />
                  Add Verse
                </Button>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-4 pt-4">
              <Link to="/dashboard">
                <Button type="button" variant="outline" size="lg">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="hero"
                size="lg"
                disabled={!title || points.every((p) => p.type === 'point' ? !p.title : !p.scriptures.some(s => s.reference.trim()))}
              >
                <Wand2 className="w-5 h-5" />
                Generate Slides
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
};

export default CreateSermon;
