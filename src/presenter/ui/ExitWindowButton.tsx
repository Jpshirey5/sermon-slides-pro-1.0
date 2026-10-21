import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const SHOW_FOR_MS = 2500;

/**
 * A close button for the main screen and stage display windows. It appears in
 * the top right corner only while the mouse is moving over the window, so the
 * audience never sees it during a service.
 */
export function ExitWindowButton({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(false), SHOW_FOR_MS);
    };
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      window.clearTimeout(timer.current);
    };
  }, []);

  const close = async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => undefined);
    window.close();
  };

  const shown = visible || hovered;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void close()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={shown ? 0 : -1}
      className={`absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/30 transition-opacity duration-300 hover:bg-red-600 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ cursor: "pointer" }}
    >
      <X className="h-5 w-5" />
    </button>
  );
}
