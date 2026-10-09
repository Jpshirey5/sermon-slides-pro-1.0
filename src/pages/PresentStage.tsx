// The stage display window, for the pastor and worship team. Like the main
// screen window, it holds no data and makes no requests: it shows the stage
// frames the operator sends, and ticks the clock and countdown itself.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Maximize } from "lucide-react";
import type { StageFrame } from "@/presenter/core/stage";
import { createBroadcastTransport, type PresenterTransport } from "@/presenter/core/transport";
import { StageView } from "@/presenter/ui/StageView";
import { useFillsScreen } from "@/presenter/ui/useFillsScreen";

const EMPTY: StageFrame = {
  template: "simple",
  itemLabel: "",
  current: null,
  next: null,
  notes: null,
  timer: null,
  message: null,
  mainMode: "black",
};

const PresentStage = () => {
  const [params] = useSearchParams();
  const nonce = params.get("channel") ?? "";
  const [frame, setFrame] = useState<StageFrame>(EMPTY);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fullscreen = useFillsScreen();
  const transport = useRef<PresenterTransport | null>(null);

  useEffect(() => {
    document.title = "Sermon Slide Pro stage display";
    if (!nonce) return;
    let t: PresenterTransport;
    try {
      t = createBroadcastTransport(nonce);
    } catch {
      return;
    }
    transport.current = t;
    const off = t.onMessage((m) => {
      if (m.type === "stage") {
        setConnected(true);
        setFrame(m.frame);
      } else if (m.type === "end") {
        setFrame(EMPTY);
      }
    });
    t.send({ type: "ready", role: "stage" });
    return () => {
      off();
      t.close();
      transport.current = null;
    };
  }, [nonce]);

  // Clock and countdown tick locally.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && ["a", "c", "x", "p", "s"].includes(e.key.toLowerCase())) e.preventDefault();
    };
    document.addEventListener("copy", block);
    document.addEventListener("contextmenu", block);
    window.addEventListener("keydown", onKey);
    return () => {
        document.removeEventListener("copy", block);
      document.removeEventListener("contextmenu", block);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const goFullscreen = () => void document.documentElement.requestFullscreen?.().catch(() => undefined);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black select-none" onDoubleClick={goFullscreen}>
      <div className="w-full max-h-full" style={{ maxWidth: "calc(100vh * 16 / 9)" }}>
        <StageView frame={frame} now={now} />
      </div>
      {!fullscreen && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center">
          <div className="rounded-lg bg-white/10 px-5 py-3 text-center text-white backdrop-blur">
            {!nonce ? (
              <p className="text-sm">Open this window from the service's "Stage display" button.</p>
            ) : (
              <>
                <p className="mb-2 text-sm opacity-80">
                  {connected ? "Stage display connected." : "Waiting for the presenter..."} Drag this to the stage screen first.
                </p>
                <button
                  type="button"
                  onClick={goFullscreen}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
                >
                  <Maximize className="h-4 w-4" /> Go full screen
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PresentStage;
