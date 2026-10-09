import { useEffect, useRef } from "react";
import type { PresenterSlide } from "../core/types";
import { estimatedTime, type VideoCommand, type VideoStatus } from "../core/video";

interface VideoPlayerProps {
  slide: PresenterSlide;
  src: string | undefined;
  /**
   * leader: plays (with sound unless muted), takes commands, reports status.
   * follower: silent mirror of someone else's status (the operator preview
   * while the main screen window is the one playing).
   */
  mode: "leader" | "follower";
  /** Leader: start playing as soon as the video appears. */
  autoplay?: boolean;
  /** Leader: report status (to the operator). */
  onStatus?: (status: VideoStatus) => void;
  /** Leader: receive the command handler, so commands reach this element. */
  registerController?: (controller: ((command: VideoCommand) => void) | null) => void;
  /** Follower: the status to mirror. */
  follow?: VideoStatus | null;
  /** Leader in the operator preview: play without sound. */
  muted?: boolean;
}

const REPORT_EVERY_MS = 500;

export function VideoPlayer({ slide, src, mode, autoplay = true, onStatus, registerController, follow, muted = false }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const blocked = useRef(false);
  const lastReport = useRef(0);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const loop = slide.video?.loop ?? false;

  const report = (force = false) => {
    const v = ref.current;
    if (!v || mode !== "leader") return;
    const now = Date.now();
    if (!force && now - lastReport.current < REPORT_EVERY_MS) return;
    lastReport.current = now;
    onStatusRef.current?.({
      slideId: slide.id,
      currentTime: v.currentTime,
      duration: Number.isFinite(v.duration) ? v.duration : slide.video?.duration_seconds ?? null,
      paused: v.paused,
      ended: v.ended,
      volume: v.volume,
      muted: v.muted,
      loop: v.loop,
      blocked: blocked.current,
      at: now,
    });
  };

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.play().then(() => {
      blocked.current = false;
      report(true);
    }).catch(() => {
      // The browser wants a click in this window before playing with sound.
      blocked.current = true;
      report(true);
    });
  };

  // Leader: commands.
  useEffect(() => {
    if (mode !== "leader" || !registerController) return;
    registerController((command) => {
      const v = ref.current;
      if (!v) return;
      switch (command.action) {
        case "play":
          if (v.ended) v.currentTime = 0;
          play();
          break;
        case "pause":
          v.pause();
          break;
        case "seek":
          v.currentTime = Math.min(command.time, Number.isFinite(v.duration) ? v.duration : command.time);
          break;
        case "volume":
          v.volume = command.volume;
          break;
        case "mute":
          v.muted = command.muted;
          break;
        case "loop":
          v.loop = command.loop;
          break;
      }
      report(true);
    });
    return () => registerController(null);
  }, [mode, slide.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leader: start from the top when a new video comes on.
  useEffect(() => {
    const v = ref.current;
    if (!v || mode !== "leader" || !src) return;
    v.loop = loop;
    v.currentTime = 0;
    if (autoplay) play();
    else report(true);
  }, [slide.id, src, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // A click anywhere in the window counts as permission to play with sound.
  useEffect(() => {
    if (mode !== "leader") return;
    const retry = () => {
      if (blocked.current) play();
    };
    window.addEventListener("pointerdown", retry);
    return () => window.removeEventListener("pointerdown", retry);
  }, [mode, slide.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follower: stay in step with the status we're given.
  useEffect(() => {
    const v = ref.current;
    if (!v || mode !== "follower" || !follow || follow.slideId !== slide.id) return;
    const target = estimatedTime(follow, Date.now());
    if (Math.abs(v.currentTime - target) > (follow.paused ? 0.25 : 0.75)) v.currentTime = target;
    if (follow.paused || follow.ended) v.pause();
    else void v.play().catch(() => undefined);
  }, [mode, follow, slide.id]);

  if (!src) return null;
  return (
    <video
      ref={ref}
      src={src}
      className="h-full w-full object-contain"
      playsInline
      preload="auto"
      muted={mode === "follower" || muted}
      loop={loop}
      onTimeUpdate={() => report()}
      onPlay={() => report(true)}
      onPause={() => report(true)}
      onEnded={() => report(true)}
      onLoadedMetadata={() => report(true)}
      onVolumeChange={() => report(true)}
      disablePictureInPicture
      controls={false}
    />
  );
}
