import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  GripVertical,
  Loader2,
  Sparkles,
  Type,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPresentation, savePresentationWithSlides, type SermonPresentation } from "@/lib/presentations";
import { generateSlidesFromPresentation } from "@/lib/slide-generation";
import type { SlideData } from "@/lib/export-pptx";
import { logError, trackEvent } from "@/lib/monitoring";
import { useAuth } from "@/contexts/AuthContext";
import { readProductTourState, setProductTourStage } from "@/lib/product-tour";
import { toast } from "sonner";

interface ReviewBlock {
  id: string;
  type: "point" | "scripture";
  label: string;
  title: string;
  preview?: string;
  slides: SlideData[];
}

const stripTranslation = (value: string) => value.replace(/\s+\([^)]+\)$/, "");

const getScripturePassageKey = (slideId: string) => {
  const parts = slideId.split("-");
  const lastPart = parts[parts.length - 1];
  const secondLastPart = parts[parts.length - 2];

  if (parts.length >= 4 && /^\d+$/.test(lastPart || "") && /^\d+$/.test(secondLastPart || "")) {
    return parts.slice(0, -1).join("-");
  }

  return slideId;
};

const buildScriptureTitle = (slides: SlideData[]) => {
  const firstReference = stripTranslation(slides[0]?.content.reference || "Scripture passage");
  const lastReference = stripTranslation(slides[slides.length - 1]?.content.reference || firstReference);
  if (slides.length <= 1 || firstReference === lastReference) {
    return firstReference;
  }
  return `${firstReference} - ${lastReference}`;
};

const slideDisplayTitle = (slide: SlideData) => {
  if (slide.type === "scripture") {
    return slide.content.reference || "Scripture slide";
  }

  return slide.content.title || "Untitled slide";
};

const slidePreviewText = (slide: SlideData) => {
  if (slide.type === "scripture") {
    return slide.content.scripture || "";
  }

  return slide.content.subtitle || "";
};

const createReviewBlock = (slides: SlideData[]): ReviewBlock => {
  const firstSlide = slides[0];
  const isScripture = firstSlide.type === "scripture";
  const title = isScripture ? buildScriptureTitle(slides) : slideDisplayTitle(firstSlide);

  return {
    id: isScripture ? getScripturePassageKey(firstSlide.id) : firstSlide.id,
    type: isScripture ? "scripture" : "point",
    label: isScripture
      ? slides.length > 1
        ? `${slides.length} verse slides`
        : "Verse"
      : "Point",
    title,
    preview: slidePreviewText(firstSlide),
    slides,
  };
};

const buildReviewBlocks = (slides: SlideData[]) => {
  const blocks: ReviewBlock[] = [];
  let currentScriptureKey: string | null = null;
  let currentScriptureSlides: SlideData[] = [];

  const flushScripture = () => {
    if (currentScriptureSlides.length > 0) {
      blocks.push(createReviewBlock(currentScriptureSlides));
      currentScriptureSlides = [];
      currentScriptureKey = null;
    }
  };

  slides.forEach((slide) => {
    if (slide.type !== "scripture") {
      flushScripture();
      blocks.push(createReviewBlock([slide]));
      return;
    }

    const key = getScripturePassageKey(slide.id);
    if (currentScriptureKey && currentScriptureKey !== key) {
      flushScripture();
    }

    currentScriptureKey = key;
    currentScriptureSlides.push(slide);
  });

  flushScripture();
  return blocks;
};

const SermonReview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isDashboardFlow = location.pathname.startsWith("/dashboard");
  const [presentation, setPresentation] = useState<SermonPresentation | null>(null);
  const [titleSlide, setTitleSlide] = useState<SlideData | null>(null);
  const [contentBlocks, setContentBlocks] = useState<ReviewBlock[]>([]);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const draggedBlockIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const backToCreatorPath = isDashboardFlow ? "/dashboard/create" : "/create";

  useEffect(() => {
    let cancelled = false;

    const loadReview = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const loadedPresentation = await getPresentation(id);
        if (cancelled) return;

        if (!loadedPresentation?.data) {
          setPresentation(null);
          setTitleSlide(null);
          setContentBlocks([]);
          setSelectedBlockIds(new Set());
          setActiveBlockId(null);
          return;
        }

        const generatedSlides = generateSlidesFromPresentation(loadedPresentation);
        setPresentation({
          ...loadedPresentation,
          slides: generatedSlides.length,
        });
        setTitleSlide(generatedSlides[0] || null);
        setContentBlocks(buildReviewBlocks(generatedSlides.slice(1)));
        setSelectedBlockIds(new Set());
        setActiveBlockId(null);
        trackEvent("sermon_review_viewed", {
          sermonId: id,
          slideCount: generatedSlides.length,
        });
      } catch (error) {
        logError(error, { scope: "sermon_review_load", sermonId: id });
        toast.error("Could not load the sermon review.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReview();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const finalSlideCount = useMemo(
    () => (titleSlide ? 1 : 0) + contentBlocks.reduce((count, block) => count + block.slides.length, 0),
    [contentBlocks, titleSlide],
  );

  const handleSelectBlock = (blockId: string, event: React.MouseEvent) => {
    const clickedIndex = contentBlocks.findIndex((block) => block.id === blockId);
    if (clickedIndex < 0) return;

    if (event.shiftKey && activeBlockId) {
      const anchorIndex = contentBlocks.findIndex((block) => block.id === activeBlockId);
      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, clickedIndex);
        const end = Math.max(anchorIndex, clickedIndex);
        setSelectedBlockIds(new Set(contentBlocks.slice(start, end + 1).map((block) => block.id)));
        return;
      }
    }

    setActiveBlockId(blockId);
    setSelectedBlockIds(new Set([blockId]));
  };

  const handleReorderBlocks = (newOrder: ReviewBlock[]) => {
    const draggedBlockId = draggedBlockIdRef.current;

    if (draggedBlockId && selectedBlockIds.size > 1 && selectedBlockIds.has(draggedBlockId)) {
      const selectedBlocks = contentBlocks.filter((block) => selectedBlockIds.has(block.id));
      const draggedNewIndex = newOrder.findIndex((block) => block.id === draggedBlockId);
      const unselectedBlocks = newOrder.filter((block) => !selectedBlockIds.has(block.id));
      const insertBeforeBlock = draggedNewIndex >= 0 ? newOrder[draggedNewIndex] : null;
      const insertIndex = insertBeforeBlock
        ? unselectedBlocks.findIndex((block) => block.id === insertBeforeBlock.id)
        : -1;
      const finalOrder = [...unselectedBlocks];
      finalOrder.splice(insertIndex >= 0 ? insertIndex : unselectedBlocks.length, 0, ...selectedBlocks);
      setContentBlocks(finalOrder);
      return;
    }

    setContentBlocks(newOrder);
  };

  const handleDragStart = (blockId: string) => {
    draggedBlockIdRef.current = blockId;

    if (!selectedBlockIds.has(blockId)) {
      setActiveBlockId(blockId);
      setSelectedBlockIds(new Set([blockId]));
    }
  };

  const handleDragEnd = () => {
    draggedBlockIdRef.current = null;
  };

  const handleBackToCreator = () => {
    if (!presentation?.data || !id) {
      navigate(backToCreatorPath);
      return;
    }

    navigate(backToCreatorPath, {
      state: {
        editData: presentation.data,
        editId: id,
        editCampusId: presentation.campusId || null,
      },
    });
  };

  const handleCreateSlides = async () => {
    if (!presentation || !titleSlide || !id) {
      toast.error("Review data is missing. Return to the creator and try again.");
      return;
    }

    const finalSlides = [titleSlide, ...contentBlocks.flatMap((block) => block.slides)];
    setSaving(true);

    try {
      const savedId = await savePresentationWithSlides(
        {
          ...presentation,
          slides: finalSlides.length,
        },
        finalSlides,
      );

      if (!savedId) {
        throw new Error("Final slide save returned no id");
      }

      if (user) {
        const tourState = readProductTourState(user.id);
        if (tourState && (tourState.status === "pending" || tourState.status === "active") && tourState.stage === "create") {
          setProductTourStage(user.id, "editor", 0);
        }
      }

      trackEvent("sermon_generation_succeeded", {
        sermonId: savedId,
        slideCount: finalSlides.length,
        source: "review",
      });
      navigate(`/editor/${savedId}`);
    } catch (error) {
      logError(error, { scope: "sermon_review_create_slides", sermonId: id });
      toast.error("Could not create slides. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading review...
        </div>
      </div>
    );
  }

  if (!presentation?.data || !titleSlide) {
    return (
      <div className="app-shell flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl glass-panel p-8 text-center shadow-elevated">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="font-serif text-2xl font-bold text-foreground">Review unavailable</h1>
          <p className="mt-2 text-muted-foreground">
            We could not find saved sermon details for this presentation.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={handleBackToCreator}>
              Back to Creator
            </Button>
            <Button variant="hero" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-white/65 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Button variant="ghost" onClick={handleBackToCreator} className="gap-2">
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Back to Creator</span>
            </Button>

            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-hero">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                Sermon Slide Pro
              </span>
            </Link>

            <Button variant="hero" onClick={handleCreateSlides} disabled={saving || finalSlideCount === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{saving ? "Creating..." : "Create Slides"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <div>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold uppercase tracking-[0.18em]">Review before creating</p>
            </div>
            <h1 className="font-serif text-3xl font-bold text-foreground">
              Review slide order
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Drag the sermon point and verse slides into the order you want. Your title slide stays first.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Multi-verse passages stay grouped here so you can move the whole passage at once. They will still become individual verse slides when created.
            </p>
          </div>

          <section className="rounded-2xl glass-panel p-5 shadow-soft">
            <div className="flex items-start gap-4">
              <div className="mt-1 rounded-xl bg-primary/10 p-2 text-primary">
                <Type className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Locked title slide
                  </span>
                  <span className="text-xs text-muted-foreground">Slide 1</span>
                </div>
                <h2 className="truncate font-serif text-xl font-semibold text-foreground">
                  {slideDisplayTitle(titleSlide)}
                </h2>
                {slidePreviewText(titleSlide) && (
                  <p className="mt-1 text-sm text-muted-foreground">{slidePreviewText(titleSlide)}</p>
                )}
              </div>
            </div>
          </section>

          {selectedBlockIds.size > 1 && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
              {selectedBlockIds.size} blocks selected
            </div>
          )}

          <Reorder.Group axis="y" values={contentBlocks} onReorder={handleReorderBlocks} className="space-y-3">
            {contentBlocks.map((block, index) => (
              <Reorder.Item
                key={block.id}
                value={block}
                className={`rounded-2xl border p-5 shadow-sm backdrop-blur-sm transition-colors ${
                  selectedBlockIds.has(block.id)
                    ? activeBlockId === block.id
                      ? "border-primary bg-primary/10 shadow-elevated"
                      : "border-primary/60 bg-primary/5"
                    : "border-border/70 bg-white/80 hover:border-primary/40"
                }`}
                initial={false}
                layout
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 40,
                }}
                onDragStart={() => handleDragStart(block.id)}
                onDragEnd={handleDragEnd}
                dragListener
                whileDrag={{
                  scale: 1.02,
                  boxShadow: "0 15px 40px rgba(0,0,0,0.18)",
                  zIndex: 50,
                }}
              >
                <div className="flex items-start gap-4" onClick={(event) => handleSelectBlock(block.id, event)}>
                  <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <GripVertical className="h-5 w-5 cursor-grab" />
                    <span className="text-sm font-semibold">{index + 2}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {block.label}
                      </span>
                    </div>
                    <h3 className="font-serif text-lg font-semibold text-foreground">
                      {block.title}
                    </h3>
                    {block.preview && (
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {block.preview}
                      </p>
                    )}
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {finalSlideCount} slide{finalSlideCount === 1 ? "" : "s"} will be created from this order.
            </p>
            <Button variant="hero" size="lg" onClick={handleCreateSlides} disabled={saving || finalSlideCount === 0}>
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
              {saving ? "Creating Slides..." : "Create Slides"}
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default SermonReview;
