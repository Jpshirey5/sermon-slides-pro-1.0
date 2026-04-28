import type { SermonPresentation } from "@/lib/presentations";

export interface PresentationValueMetrics {
  estimatedMinutesSaved: number;
  slideCount: number;
  scripturePassageCount: number;
}

const BASE_TIME_SAVED_MINUTES = 20;
const MINUTES_PER_SLIDE = 1;
const MINUTES_PER_SCRIPTURE_PASSAGE = 3;

export function countScripturePassages(formData?: SermonPresentation["data"] | null): number {
  if (!formData?.points) return 0;

  return formData.points.reduce((total, point) => {
    const passageCount = point.scriptures.filter((scripture) =>
      Boolean(scripture.reference?.trim() || scripture.text?.trim())
    ).length;
    return total + passageCount;
  }, 0);
}

export function calculateValueMetrics(params: {
  slideCount: number;
  formData?: SermonPresentation["data"] | null;
}): PresentationValueMetrics {
  const slideCount = Math.max(0, params.slideCount || 0);
  const scripturePassageCount = countScripturePassages(params.formData);

  return {
    estimatedMinutesSaved:
      BASE_TIME_SAVED_MINUTES +
      slideCount * MINUTES_PER_SLIDE +
      scripturePassageCount * MINUTES_PER_SCRIPTURE_PASSAGE,
    slideCount,
    scripturePassageCount,
  };
}

export function formatEstimatedMinutes(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))} minutes`;
}
