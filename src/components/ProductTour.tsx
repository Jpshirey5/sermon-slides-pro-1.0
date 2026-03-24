import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  completeProductTour,
  markCreateTourPrompt,
  markProductTourCompletion,
  readProductTourState,
  setProductTourStage,
  skipProductTour,
  type ProductTourStage,
} from "@/lib/product-tour";

export interface ProductTourStep {
  targetId?: string;
  title: string;
  description: string;
  nextLabel?: string;
  nextStage?: ProductTourStage;
  nextPath?: string;
}

interface ProductTourNavigationOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
}

interface ProductTourProps {
  userId: string;
  stage: ProductTourStage;
  steps: ProductTourStep[];
  onNavigate?: (path: string, options?: ProductTourNavigationOptions) => void;
  introTitle?: string;
  introDescription?: string;
  introStartLabel?: string;
}

const CARD_WIDTH = 320;
const PADDING = 16;
const DEFAULT_CARD_HEIGHT = 260;

const ProductTour = ({
  userId,
  stage,
  steps,
  onNavigate,
  introTitle,
  introDescription,
  introStartLabel,
}: ProductTourProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);

  useEffect(() => {
    const state = readProductTourState(userId);
    if (!state) {
      setActiveIndex(null);
      setShowIntro(false);
      return;
    }

    if (state.status === "pending" && state.stage === stage) {
      setShowIntro(Boolean(introTitle));
      setActiveIndex(null);
      return;
    }

    if (state.status === "active" && state.stage === stage) {
      setShowIntro(false);
      setActiveIndex(Math.min(state.stepIndex, steps.length - 1));
      return;
    }

    setShowIntro(false);
    setActiveIndex(null);
  }, [introTitle, stage, steps.length, userId]);

  const activeStep = activeIndex != null ? steps[activeIndex] : null;

  useEffect(() => {
    if (!activeStep?.targetId) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour-id="${activeStep.targetId}"]`);
      setTargetRect(element?.getBoundingClientRect() ?? null);
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    const timer = window.setInterval(updateRect, 250);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      window.clearInterval(timer);
    };
  }, [activeStep]);

  useEffect(() => {
    if (!activeStep?.targetId) return;

    const element = document.querySelector<HTMLElement>(`[data-tour-id="${activeStep.targetId}"]`);
    if (!element) return;

    const previousPosition = element.style.position;
    const previousZIndex = element.style.zIndex;
    const previousIsolation = element.style.isolation;

    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }
    element.style.zIndex = "500";
    element.style.isolation = "isolate";

    return () => {
      element.style.position = previousPosition;
      element.style.zIndex = previousZIndex;
      element.style.isolation = previousIsolation;
    };
  }, [activeStep]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const updateHeight = () => {
      setCardHeight(card.getBoundingClientRect().height || DEFAULT_CARD_HEIGHT);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(card);
    window.addEventListener("resize", updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [activeStep]);

  const cardPosition = useMemo(() => {
    if (!activeStep) return null;

    if (!targetRect) {
      return {
        left: `calc(50vw - ${CARD_WIDTH / 2}px)`,
        top: "calc(50vh - 120px)",
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const targetIsLarge = targetRect.width > 420 || targetRect.height > 180;
    const fitsBelow = targetRect.bottom + cardHeight + 25 < viewportHeight;
    const fitsRight = targetRect.right + CARD_WIDTH + PADDING < viewportWidth;
    const fitsLeft = targetRect.left - CARD_WIDTH - PADDING > 0;

    let left = targetRect.left;
    let top = fitsBelow ? targetRect.bottom + 16 : targetRect.top - cardHeight - 16;

    if (targetIsLarge && fitsBelow) {
      left = Math.min(
        Math.max(targetRect.left + (targetRect.width - CARD_WIDTH) / 2, PADDING),
        viewportWidth - CARD_WIDTH - PADDING
      );
      top = Math.min(targetRect.bottom + 16, viewportHeight - cardHeight - PADDING);
    } else if (fitsRight) {
      left = Math.min(targetRect.right + 12, viewportWidth - CARD_WIDTH - PADDING);
      top = Math.min(Math.max(targetRect.top, PADDING), viewportHeight - cardHeight - PADDING);
    } else if (fitsLeft) {
      left = Math.max(targetRect.left - CARD_WIDTH - 12, PADDING);
      top = Math.min(Math.max(targetRect.top, PADDING), viewportHeight - cardHeight - PADDING);
    } else {
      left = Math.min(Math.max(left, PADDING), viewportWidth - CARD_WIDTH - PADDING);
      top = Math.min(Math.max(top, PADDING), viewportHeight - cardHeight - PADDING);
    }

    return { left, top };
  }, [activeStep, cardHeight, targetRect]);

  const handleStart = () => {
    setProductTourStage(userId, stage, 0);
    setShowIntro(false);
    setActiveIndex(0);
  };

  const handleSkip = () => {
    skipProductTour(userId, stage);
    setShowIntro(false);
    setActiveIndex(null);
  };

  const handleNext = () => {
    if (activeIndex == null) return;

    const nextIndex = activeIndex + 1;
    const isLastStep = nextIndex >= steps.length;

    if (!isLastStep) {
      setProductTourStage(userId, stage, nextIndex);
      setActiveIndex(nextIndex);
      return;
    }

    if (activeStep.nextStage) {
      setProductTourStage(userId, activeStep.nextStage, 0);
      setActiveIndex(null);

      if (stage === "create" && activeStep.nextStage === "editor") {
        markCreateTourPrompt(userId);
      }

      if (activeStep.nextPath && onNavigate) {
        onNavigate(activeStep.nextPath, { replace: true });
      }
      return;
    }

    completeProductTour(userId);
    markProductTourCompletion(userId);
    setActiveIndex(null);

    if (activeStep.nextPath && onNavigate) {
      onNavigate(activeStep.nextPath, {
        replace: true,
        state: {
          productTourCompleted: true,
          productTourStage: stage,
        },
      });

      const currentPath = window.location.pathname;
      window.setTimeout(() => {
        if (window.location.pathname === currentPath) {
          window.location.assign(activeStep.nextPath!);
        }
      }, 150);
    }
  };

  if (showIntro) {
    return (
      <AlertDialog open={showIntro}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{introTitle}</AlertDialogTitle>
            <AlertDialogDescription>{introDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkip}>Skip Tour</AlertDialogCancel>
            <AlertDialogAction onClick={handleStart}>
              {introStartLabel || "Start Tour"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!activeStep || !cardPosition) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-slate-950/45" />
      {targetRect && (
        <div
          className="absolute z-[950] rounded-2xl border-2 border-primary shadow-[0_0_0_4px_rgba(255,255,255,0.85),0_0_28px_rgba(59,130,246,0.35)] transition-all"
          style={{
            left: targetRect.left - 6,
            top: targetRect.top - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      <div
        ref={cardRef}
        className="absolute z-[1000] w-80 rounded-2xl border border-border bg-white p-5 shadow-2xl"
        style={cardPosition}
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary mb-2">
          Guided Tour
        </p>
        <h3 className="font-serif text-xl font-semibold text-foreground mb-2">{activeStep.title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{activeStep.description}</p>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip
          </Button>
          <Button variant="hero" size="sm" onClick={handleNext}>
            {activeStep.nextLabel || (activeStep.nextStage ? "Continue" : activeIndex === steps.length - 1 ? "Finish" : "Next")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductTour;
