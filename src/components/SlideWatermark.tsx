// Watermark overlay for slide previews.
// "preview" — large, bold, tiled diagonal mark shown before payment that makes the
//   slide clearly unusable as an exported deck.
// "brand" — small, subtle brand mark in the bottom corner shown after a one-time
//   export is unlocked. Pro and higher subscriptions remove the watermark entirely,
//   so this component is simply not rendered for subscribers.

export type SlideWatermarkVariant = "preview" | "brand";
export type SlideWatermarkSize = "thumb" | "full";

interface SlideWatermarkProps {
  variant: SlideWatermarkVariant;
  size?: SlideWatermarkSize;
}

export function SlideWatermark({ variant, size = "full" }: SlideWatermarkProps) {
  if (variant === "brand") {
    return (
      <div className="pointer-events-none absolute bottom-1.5 right-2 z-20 select-none">
        <span
          className={`font-semibold uppercase tracking-wide text-white/55 ${
            size === "thumb" ? "text-[5px] tracking-normal" : "text-[9px] sm:text-[11px]"
          }`}
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
        >
          Sermon Slide Pro
        </span>
      </div>
    );
  }

  // Tiled diagonal "PREVIEW" mark. Repeated across the whole slide so it cannot be
  // cropped out or used as-is.
  const repeats = size === "thumb" ? 9 : 40;
  const textClass = size === "thumb" ? "text-[7px] tracking-[0.15em]" : "text-lg md:text-2xl tracking-[0.2em]";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden select-none">
      <div className="absolute -inset-1/4 flex flex-wrap content-center justify-center gap-x-4 gap-y-2 rotate-[-30deg] opacity-40">
        {Array.from({ length: repeats }).map((_, i) => (
          <span
            key={i}
            className={`whitespace-nowrap font-black uppercase text-white ${textClass}`}
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
          >
            Preview
          </span>
        ))}
      </div>
    </div>
  );
}
