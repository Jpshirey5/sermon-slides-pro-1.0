import type { CSSProperties, ReactNode, SyntheticEvent } from "react";
import { AlertTriangle, Film } from "lucide-react";
import type { OutputFrame, PresenterSlide } from "../core/types";

/** Background images resolved to URLs by the operator, keyed by the slide's stored image ref. */
export type ResolvedImages = Readonly<Record<string, string>>;

interface SlideViewProps {
  frame: OutputFrame;
  images?: ResolvedImages;
  /** URL for the logo screen, if the church has one. */
  logoUrl?: string | null;
  /** Title shown on the logo screen when there is no logo. */
  fallbackTitle?: string;
  /**
   * Licensed text protection: no selection, copy, cut, drag, or context menu.
   * On for the projector and for operator previews.
   */
  protectText?: boolean;
  /** Operator only: show a notice on missing slides instead of black. */
  showMissing?: boolean;
  /** Playable video URLs by storage path (thumbnails show the first frame). */
  videos?: Readonly<Record<string, string>>;
  /** Replaces the default still video, for the windows that actually play it. */
  renderVideo?: (slide: PresenterSlide) => ReactNode;
  className?: string;
}

const block = (e: SyntheticEvent) => e.preventDefault();

const MISSING_TEXT: Record<string, string> = {
  revoked: "This translation is no longer available, so this slide will show black.",
  suspended: "This translation is paused right now, so this slide will show black.",
  expired: "This scripture needs to be refreshed. Reconnect to the internet to load it again.",
  not_entitled: "Your church does not have access to this translation.",
  no_source: "This translation is not available in Sermon Slide Pro yet.",
  missing_copyright: "We could not load this translation's copyright notice, so it cannot be shown.",
  unreadable_reference: "We could not read this reference. Fix it in the editor.",
  sermon_deleted: "This sermon was deleted.",
  song_deleted: "This song was deleted from your library.",
  video_deleted: "This video was deleted from your library.",
  not_found: "We could not find this passage.",
};

export function missingText(reason?: string): string {
  return (reason && MISSING_TEXT[reason]) || "This slide cannot be shown.";
}

/** Shrink long passages so they fit; sizes are in container-width units. */
function scriptureSize(text: string): string {
  const n = text.length;
  if (n < 120) return "4.4cqw";
  if (n < 220) return "3.8cqw";
  if (n < 360) return "3.2cqw";
  if (n < 520) return "2.7cqw";
  return "2.3cqw";
}

/** Lyrics get larger type than scripture; fewer, shorter lines. */
function lyricsSize(text: string): string {
  const lines = text.split("\n").length;
  const longest = Math.max(...text.split("\n").map((l) => l.length), 0);
  if (lines <= 2 && longest < 32) return "5.6cqw";
  if (lines <= 4 && longest < 40) return "4.6cqw";
  return "3.6cqw";
}

function backgroundStyle(slide: PresenterSlide, images: ResolvedImages): { style: CSSProperties; hasImage: boolean } {
  const ref = slide.style.backgroundImage;
  const url = ref ? images[ref] ?? (/^(data:|https:|blob:|ssp:)/.test(ref) ? ref : undefined) : undefined;
  if (url) {
    return {
      hasImage: true,
      // A graphic is shown whole on black; a background fills the slide.
      style: {
        backgroundImage: `url("${url.replace(/"/g, "%22")}")`,
        backgroundSize: slide.kind === "graphic" ? "contain" : "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: slide.kind === "graphic" ? "#000" : undefined,
      },
    };
  }
  return { hasImage: false, style: { background: slide.style.background || "#000" } };
}

function SlideBody({ slide }: { slide: PresenterSlide }) {
  const text: CSSProperties = {
    fontFamily: slide.style.fontFamily,
    color: slide.style.textColor,
    lineHeight: slide.style.lineSpacing ?? 1.4,
  };

  switch (slide.kind) {
    case "title":
      return (
        <div className="text-center" style={text}>
          <h1 className="font-bold" style={{ fontSize: "6.5cqw", lineHeight: 1.15 }}>{slide.title}</h1>
          {slide.subtitle && <p className="opacity-80 mt-[2cqw]" style={{ fontSize: "2.6cqw" }}>{slide.subtitle}</p>}
        </div>
      );
    case "point":
      return (
        <div className="text-center" style={text}>
          <h2 className="font-semibold" style={{ fontSize: "5.2cqw", lineHeight: 1.2 }}>{slide.title}</h2>
          {slide.subtitle && <p className="opacity-80 mt-[1.5cqw]" style={{ fontSize: "2.4cqw" }}>{slide.subtitle}</p>}
        </div>
      );
    case "scripture":
      return (
        <div className="flex h-full w-full flex-col items-center justify-center text-center" style={text}>
          <p style={{ fontSize: scriptureSize(slide.text ?? "") }}>{slide.text}</p>
          {slide.reference && <p className="mt-[2.4cqw] font-semibold opacity-90" style={{ fontSize: "2.2cqw" }}>{slide.reference}</p>}
          {/* Attribution is part of the slide. There is no way to hide it. */}
          <p className="absolute bottom-[2cqw] left-[4cqw] right-[4cqw] opacity-70" style={{ fontSize: "1.15cqw", lineHeight: 1.3 }}>
            {slide.attribution}
          </p>
        </div>
      );
    case "lyrics":
      return (
        <div className="flex h-full w-full flex-col items-center justify-center text-center" style={text}>
          <p className="whitespace-pre-line font-medium" style={{ fontSize: lyricsSize(slide.text ?? ""), lineHeight: 1.3 }}>{slide.text}</p>
          {/* CCLI credit line, on the first slide of a song. */}
          {slide.credit && (
            <p className="absolute bottom-[2cqw] left-[4cqw] right-[4cqw] opacity-70" style={{ fontSize: "1.15cqw", lineHeight: 1.3 }}>
              {slide.credit}
            </p>
          )}
        </div>
      );
    case "credits":
      return (
        <div className="w-full text-left" style={{ ...text, fontFamily: "Georgia, serif", color: "#FFFFFF" }}>
          <h2 className="font-semibold mb-[2cqw]" style={{ fontSize: "3cqw" }}>Scripture credits</h2>
          <ul className="space-y-[1.4cqw]">
            {(slide.notices ?? []).map((n) => (
              <li key={n.translation_id} style={{ fontSize: "1.5cqw", lineHeight: 1.4 }}>
                <span className="font-semibold">{n.name}.</span> {n.notice}
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

/**
 * One 16:9 slide, scaled to its container. Used by the projector window and
 * by every preview in the operator view, so both always look the same.
 */
export function SlideView({ frame, images = {}, videos = {}, renderVideo, logoUrl, fallbackTitle, protectText = true, showMissing = false, className = "" }: SlideViewProps) {
  const guards = protectText
    ? { onCopy: block, onCut: block, onContextMenu: block, onDragStart: block }
    : {};
  const base = `relative aspect-video w-full overflow-hidden bg-black ${protectText ? "select-none" : ""} ${className}`;
  const container: CSSProperties = {
    containerType: "inline-size",
    ...(protectText ? { WebkitUserSelect: "none", WebkitTouchCallout: "none" } : {}),
  } as CSSProperties;

  if (frame.kind === "black") return <div className={base} style={container} {...guards} aria-label="Black screen" />;

  if (frame.kind === "logo") {
    return (
      <div className={`${base} flex items-center justify-center`} style={container} {...guards} aria-label="Logo screen">
        {logoUrl ? (
          <img src={logoUrl} alt="" draggable={false} className="max-h-[60%] max-w-[60%] object-contain" />
        ) : (
          <p className="font-serif text-white/90" style={{ fontSize: "4cqw" }}>{fallbackTitle}</p>
        )}
      </div>
    );
  }

  const slide = frame.slide;
  if (slide.kind === "missing") {
    return (
      <div className={`${base} flex items-center justify-center`} style={container} {...guards}>
        {showMissing && (
          <div className="flex flex-col items-center gap-[1.5cqw] px-[8cqw] text-center text-amber-200">
            <AlertTriangle style={{ width: "4cqw", height: "4cqw" }} />
            <p style={{ fontSize: "2.4cqw" }}>{missingText(slide.missing_reason)}</p>
            {slide.reference && <p className="opacity-70" style={{ fontSize: "1.8cqw" }}>{slide.reference}</p>}
          </div>
        )}
      </div>
    );
  }

  if (slide.kind === "video") {
    const src = slide.video?.src ?? (slide.video ? videos[slide.video.storage_path] : undefined);
    return (
      <div className={`${base} flex items-center justify-center`} style={container} {...guards} aria-label={`Video: ${slide.title ?? ""}`}>
        {renderVideo ? (
          renderVideo(slide)
        ) : src ? (
          // A still of the opening frame for thumbnails and previews.
          <video src={`${src}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-[1cqw] text-neutral-400">
            <Film style={{ width: "6cqw", height: "6cqw" }} aria-hidden />
            <p className="max-w-[80cqw] truncate" style={{ fontSize: "2.4cqw" }}>{slide.title}</p>
          </div>
        )}
      </div>
    );
  }

  const bg = backgroundStyle(slide, images);
  return (
    <div className={`${base} flex items-center justify-center`} style={{ ...container, ...bg.style }} {...guards}>
      {bg.hasImage && slide.kind !== "graphic" && <div className="absolute inset-0 bg-black/40" />}
      <div className="relative flex h-full w-full items-center justify-center px-[7cqw] py-[5cqw]">
        <SlideBody slide={slide} />
      </div>
    </div>
  );
}
