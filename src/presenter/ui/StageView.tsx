import type { CSSProperties, SyntheticEvent } from "react";
import { MessageSquare } from "lucide-react";
import { formatClock, formatCountdown, type StageFrame, type StageText, timerRemainingMs } from "../core/stage";

interface StageViewProps {
  frame: StageFrame;
  /** Current time, so clock and countdown tick. */
  now: number;
  className?: string;
}

const block = (e: SyntheticEvent) => e.preventDefault();

/** Countdown color: calm, then amber in the last minute, red once over. */
function countdownColor(ms: number): string {
  if (ms < 0) return "#F87171";
  if (ms <= 60_000) return "#FBBF24";
  return "#F5F5F4";
}

function Words({ text, size, muted = false }: { text: StageText | null; size: string; muted?: boolean }) {
  if (!text) return <p className="text-neutral-600" style={{ fontSize: "2cqw" }}>Nothing next</p>;
  return (
    <div className={muted ? "text-neutral-400" : "text-neutral-50"}>
      <p className="whitespace-pre-line font-medium" style={{ fontSize: size, lineHeight: 1.25 }}>{text.text}</p>
      {text.caption && <p className="mt-[0.8cqw] text-amber-200/80" style={{ fontSize: "1.8cqw" }}>{text.caption}</p>}
    </div>
  );
}

function Countdown({ frame, now, size }: { frame: StageFrame; now: number; size: string }) {
  if (!frame.timer) return null;
  const ms = timerRemainingMs(frame.timer, now);
  return (
    <div className="text-right">
      <p className="tabular-nums font-semibold" style={{ fontSize: size, lineHeight: 1, color: countdownColor(ms) }}>{formatCountdown(ms)}</p>
      <p className="text-neutral-500" style={{ fontSize: "1.4cqw" }}>{frame.timer.startedAt === null ? "Countdown paused" : ms < 0 ? "Over time" : "Time left"}</p>
    </div>
  );
}

/**
 * The stage display, in one of four templates. Our own layout: a top bar
 * with the item and the clock, an optional message banner, and the body.
 */
export function StageView({ frame, now, className = "" }: StageViewProps) {
  const container = { containerType: "inline-size", WebkitUserSelect: "none" } as CSSProperties;
  const label = (text: string) => <p className="mb-[0.6cqw] uppercase tracking-wider text-neutral-500" style={{ fontSize: "1.3cqw" }}>{text}</p>;

  return (
    <div
      className={`relative flex aspect-video w-full select-none flex-col overflow-hidden bg-neutral-950 ${className}`}
      style={container}
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      onDragStart={block}
      aria-label="Stage display"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-[2.5cqw] py-[1.2cqw]">
        <p className="truncate text-neutral-300" style={{ fontSize: "1.8cqw" }}>
          {frame.itemLabel}
          {frame.mainMode !== "live" && (
            <span className="ml-[1.5cqw] rounded bg-neutral-800 px-[0.8cqw] py-[0.2cqw] text-amber-300" style={{ fontSize: "1.4cqw" }}>
              Main screen: {frame.mainMode === "black" ? "cleared" : "logo"}
            </span>
          )}
        </p>
        <p className="tabular-nums text-neutral-100" style={{ fontSize: "2.4cqw" }}>{formatClock(now)}</p>
      </div>

      {frame.message && (
        <div className="flex items-center gap-[1cqw] bg-amber-400 px-[2.5cqw] py-[1cqw] text-neutral-950">
          <MessageSquare style={{ width: "2.4cqw", height: "2.4cqw" }} aria-hidden />
          <p className="font-semibold" style={{ fontSize: "2.6cqw", lineHeight: 1.2 }}>{frame.message}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 px-[2.5cqw] py-[2cqw]">
        {frame.template === "worship" && (
          <div className="flex h-full flex-col justify-between gap-[2cqw]">
            <Words text={frame.current} size="5.2cqw" />
            <div className="border-t border-neutral-800 pt-[1.5cqw]">
              {label("Next")}
              <Words text={frame.next} size="3.2cqw" muted />
            </div>
          </div>
        )}

        {frame.template === "message" && (
          <div className="grid h-full grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-[2.5cqw]">
            <div className="flex min-h-0 flex-col gap-[1.5cqw]">
              <div>
                {label("Now")}
                <Words text={frame.current} size="3.4cqw" />
              </div>
              <div className="border-t border-neutral-800 pt-[1.2cqw]">
                {label("Next")}
                <Words text={frame.next} size="2.2cqw" muted />
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-[1.5cqw]">
              <Countdown frame={frame} now={now} size="7cqw" />
              <div className="min-h-0 flex-1 overflow-hidden rounded-[0.8cqw] bg-neutral-900 p-[1.5cqw]">
                {label("Notes")}
                <p className="whitespace-pre-line text-neutral-200" style={{ fontSize: "2.2cqw", lineHeight: 1.35 }}>
                  {frame.notes || "No notes for this slide."}
                </p>
              </div>
            </div>
          </div>
        )}

        {frame.template === "video" && (
          <div className="flex h-full flex-col items-center justify-center gap-[1.5cqw] text-center">
            {frame.timer ? (
              <p className="tabular-nums font-semibold" style={{ fontSize: "16cqw", lineHeight: 1, color: countdownColor(timerRemainingMs(frame.timer, now)) }}>
                {formatCountdown(timerRemainingMs(frame.timer, now))}
              </p>
            ) : (
              <p className="text-neutral-500" style={{ fontSize: "3cqw" }}>No countdown set for this item.</p>
            )}
            <p className="text-neutral-400" style={{ fontSize: "2.2cqw" }}>{frame.timer ? (frame.timer.startedAt === null ? "Countdown paused" : "Time left") : ""}</p>
          </div>
        )}

        {frame.template === "simple" && (
          <div className="flex h-full flex-col justify-between gap-[2cqw]">
            <div>
              {label("Now")}
              <Words text={frame.current} size="4cqw" />
            </div>
            <div className="border-t border-neutral-800 pt-[1.5cqw]">
              {label("Next")}
              <Words text={frame.next} size="2.8cqw" muted />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
