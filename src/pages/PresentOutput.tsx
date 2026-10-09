// The projector window. It holds no data and makes no requests: it shows the
// frames the operator sends over the channel, and tells the operator what is
// actually on screen (which is what FUMS reporting counts).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Maximize } from "lucide-react";
import { createBroadcastTransport, type PresenterTransport } from "@/presenter/core/transport";
import type { OutputFrame } from "@/presenter/core/types";
import { SlideView } from "@/presenter/ui/SlideView";
import { useFillsScreen } from "@/presenter/ui/useFillsScreen";
import { VideoPlayer } from "@/presenter/ui/VideoPlayer";
import type { VideoCommand } from "@/presenter/core/video";

const HIDE_CURSOR_AFTER_MS = 2500;

const PresentOutput = () => {
  const [params] = useSearchParams();
  const nonce = params.get("channel") ?? "";
  const [frame, setFrame] = useState<OutputFrame>({ kind: "black" });
  const [seq, setSeq] = useState(0);
  const [connected, setConnected] = useState(false);
  const fullscreen = useFillsScreen();
  const [cursorHidden, setCursorHidden] = useState(false);
  const transport = useRef<PresenterTransport | null>(null);
  // The playing video takes commands from the operator through this.
  const videoController = useRef<((command: VideoCommand) => void) | null>(null);

  useEffect(() => {
    document.title = "Sermon Slide Pro output";
    if (!nonce) return;
    let t: PresenterTransport;
    try {
      t = createBroadcastTransport(nonce);
    } catch {
      return;
    }
    transport.current = t;
    const off = t.onMessage((m) => {
      if (m.type === "video") {
        videoController.current?.(m.command);
      } else if (m.type === "frame") {
        setConnected(true);
        setFrame(m.frame);
        setSeq(m.seq);
      } else if (m.type === "end") {
        setFrame({ kind: "black" });
        setSeq(0);
      }
    });
    t.send({ type: "ready", role: "main" });
    return () => {
      off();
      t.close();
      transport.current = null;
    };
  }, [nonce]);

  // Confirm what is on screen after it has been painted.
  useLayoutEffect(() => {
    if (!seq) return;
    const id = requestAnimationFrame(() => {
      transport.current?.send({ type: "displayed", seq, slideId: frame.kind === "slide" ? frame.slide.id : null });
    });
    return () => cancelAnimationFrame(id);
  }, [seq, frame]);

  // Hide the mouse pointer on the projector when it is not moving.
  useEffect(() => {
    let timer = setTimeout(() => setCursorHidden(true), HIDE_CURSOR_AFTER_MS);
    const onMove = () => {
      setCursorHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorHidden(true), HIDE_CURSOR_AFTER_MS);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  // Block copy shortcuts and printing on the projector window as a whole.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && ["a", "c", "x", "p", "s"].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const block = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
    };
  }, []);

  const goFullscreen = () => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black select-none"
      style={{ cursor: cursorHidden ? "none" : "default" }}
      onDoubleClick={goFullscreen}
    >
      {/* Letterbox the 16:9 slide inside whatever shape the projector is. */}
      <div className="w-full max-h-full" style={{ maxWidth: "calc(100vh * 16 / 9)" }}>
        <SlideView
          frame={frame}
          logoUrl={null}
          fallbackTitle=""
          protectText
          renderVideo={(slide) => (
            <VideoPlayer
              slide={slide}
              src={slide.video?.src}
              mode="leader"
              registerController={(c) => {
                videoController.current = c;
              }}
              onStatus={(status) => transport.current?.send({ type: "videoState", status })}
            />
          )}
        />
      </div>

      {!fullscreen && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center" style={{ cursor: "default" }}>
          <div className="rounded-lg bg-white/10 px-5 py-3 text-center text-white backdrop-blur">
            {!nonce ? (
              <p className="text-sm">Open this window from the presenter's "Open projector" button.</p>
            ) : (
              <>
                <p className="text-sm mb-2 opacity-80">
                  {connected ? "Connected to the presenter." : "Waiting for the presenter..."} If this is not on the projector, drag it there first.
                </p>
                <button
                  type="button"
                  onClick={goFullscreen}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
                >
                  <Maximize className="h-4 w-4" />
                  Go full screen
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PresentOutput;
