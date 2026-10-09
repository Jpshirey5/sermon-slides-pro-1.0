import { Pause, Play, Repeat, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PresenterSlide } from "@/presenter/core/types";
import { estimatedTime, formatVideoTime, type VideoCommand, type VideoStatus } from "@/presenter/core/video";

interface VideoControlsProps {
  slide: PresenterSlide;
  status: VideoStatus | null;
  now: number;
  onCommand: (command: VideoCommand) => void;
  /** No main screen window open: the preview is playing. */
  rehearsing: boolean;
}

const END_LABEL = { hold: "Holds on the last frame when done", clear: "Clears the screen when done", next: "Goes to the next item when done" } as const;

/** Play, pause, scrub, volume, and loop for the video on the main screen. */
export function VideoControls({ slide, status, now, onCommand, rehearsing }: VideoControlsProps) {
  const live = status && status.slideId === slide.id ? status : null;
  const duration = live?.duration ?? slide.video?.duration_seconds ?? null;
  const time = live ? estimatedTime(live, now) : 0;
  const remaining = duration !== null ? Math.max(0, duration - time) : null;
  const playing = Boolean(live && !live.paused && !live.ended);
  const muted = live?.muted ?? false;
  const volume = live?.volume ?? 1;
  const loop = live?.loop ?? slide.video?.loop ?? false;
  const button = (active = false) => (active ? "bg-amber-400 text-neutral-950 hover:bg-amber-300" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700");

  return (
    <section aria-label="Video controls" className="rounded-md bg-neutral-900 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="mb-0 text-[11px] font-medium uppercase tracking-wider text-neutral-400">Video</p>
        <p className="truncate pl-2 text-xs text-neutral-500">{slide.title}</p>
      </div>

      {live?.blocked && (
        <p className="mb-2 rounded bg-amber-500/15 px-2 py-1.5 text-xs text-amber-300">
          The browser is waiting for a click on the main screen window before it plays with sound. Click that window once.
        </p>
      )}

      <input
        type="range"
        aria-label="Video position"
        className="w-full accent-amber-400"
        min={0}
        max={duration ?? 0}
        step={0.1}
        value={Math.min(time, duration ?? time)}
        disabled={duration === null}
        onChange={(e) => onCommand({ action: "seek", time: Number(e.target.value) })}
      />
      <div className="mb-2 flex justify-between text-xs tabular-nums text-neutral-400">
        <span>{formatVideoTime(time)}</span>
        <span>{remaining !== null ? `-${formatVideoTime(remaining)}` : "--:--"}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {playing ? (
          <Button size="sm" className={`h-8 ${button(true)}`} onClick={() => onCommand({ action: "pause" })} aria-label="Pause video"><Pause className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" className={`h-8 ${button()}`} onClick={() => onCommand({ action: "play" })} aria-label="Play video"><Play className="h-4 w-4" /></Button>
        )}
        <Button size="sm" className={`h-8 ${button()}`} onClick={() => onCommand({ action: "seek", time: 0 })} aria-label="Restart video"><RotateCcw className="h-4 w-4" /></Button>
        <Button size="sm" className={`h-8 ${button(loop)}`} onClick={() => onCommand({ action: "loop", loop: !loop })} aria-label={loop ? "Turn off loop" : "Loop video"} aria-pressed={loop}>
          <Repeat className="h-4 w-4" />
        </Button>
        <Button size="sm" className={`ml-auto h-8 ${button(muted)}`} onClick={() => onCommand({ action: "mute", muted: !muted })} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <input
          type="range"
          aria-label="Volume"
          className="w-24 accent-amber-400"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (muted && v > 0) onCommand({ action: "mute", muted: false });
            onCommand({ action: "volume", volume: v });
          }}
        />
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        {loop ? "Loops until you move on." : END_LABEL[slide.video?.end_action ?? "hold"]}
        {rehearsing ? " Playing in this preview until the main screen is open." : ""}
      </p>
    </section>
  );
}
