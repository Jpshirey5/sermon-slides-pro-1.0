import type { SermonPresentation } from "@/lib/presentations";

export interface PresentationValueMetrics {
  estimatedTimeSavedSeconds: number;
  estimatedMinutesSaved: number;
  slideCount: number;
  pointSlideCount: number;
  scriptureSlideCount: number;
  scripturePassageCount: number;
}

export const POINT_SLIDE_TIME_SAVED_SECONDS = 30;
export const VERSE_SLIDE_TIME_SAVED_SECONDS = 90;

type SlideLike = {
  type?: string;
};

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
  slideCount?: number;
  slides?: SlideLike[] | null;
  formData?: SermonPresentation["data"] | null;
}): PresentationValueMetrics {
  const slideCount = Math.max(0, params.slides?.length ?? params.slideCount ?? 0);
  const scripturePassageCount = countScripturePassages(params.formData);
  const pointSlideCount = params.slides
    ? params.slides.filter((slide) => slide.type === "point").length
    : Math.max(0, slideCount - scripturePassageCount - 1);
  const scriptureSlideCount = params.slides
    ? params.slides.filter((slide) => slide.type === "scripture").length
    : scripturePassageCount;
  const estimatedTimeSavedSeconds =
    pointSlideCount * POINT_SLIDE_TIME_SAVED_SECONDS +
    scriptureSlideCount * VERSE_SLIDE_TIME_SAVED_SECONDS;

  return {
    estimatedTimeSavedSeconds,
    estimatedMinutesSaved: estimatedTimeSavedSeconds / 60,
    slideCount,
    pointSlideCount,
    scriptureSlideCount,
    scripturePassageCount,
  };
}

export function formatTimeSaved(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (minutes === 0) return hourLabel;
  return `${hourLabel} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function formatEstimatedMinutes(minutes: number): string {
  return formatTimeSaved(minutes * 60);
}
