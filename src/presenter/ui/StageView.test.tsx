import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { StageFrame } from "../core/stage";
import { StageView } from "./StageView";

const NOW = new Date("2026-10-11T14:05:00").getTime();

const frame = (over: Partial<StageFrame> = {}): StageFrame => ({
  template: "worship",
  itemLabel: "Doxology",
  current: { text: "Praise God\nfrom whom all blessings flow", caption: "Verse" },
  next: { text: "Praise him all creatures", caption: "Verse" },
  notes: null,
  timer: null,
  message: null,
  mainMode: "live",
  ...over,
});

describe("StageView", () => {
  it("worship: current lyrics with the next ones below, plus the clock", () => {
    render(<StageView frame={frame()} now={NOW} />);
    expect(screen.getByText(/Praise God/)).toBeInTheDocument();
    expect(screen.getByText("Praise him all creatures")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText(/2:05/)).toBeInTheDocument();
  });

  it("message: notes and a running countdown", () => {
    render(
      <StageView
        frame={frame({ template: "message", notes: "Tell the lighthouse story", timer: { durationMs: 1_800_000, startedAt: NOW - 60_000, elapsedBeforeMs: 0 } })}
        now={NOW}
      />,
    );
    expect(screen.getByText("Tell the lighthouse story")).toBeInTheDocument();
    expect(screen.getByText("29:00")).toBeInTheDocument();
    expect(screen.getByText("Time left")).toBeInTheDocument();
  });

  it("message without notes says so", () => {
    render(<StageView frame={frame({ template: "message" })} now={NOW} />);
    expect(screen.getByText("No notes for this slide.")).toBeInTheDocument();
  });

  it("video: a big countdown, and over time shows negative", () => {
    render(<StageView frame={frame({ template: "video", timer: { durationMs: 10_000, startedAt: NOW - 15_000, elapsedBeforeMs: 0 } })} now={NOW} />);
    expect(screen.getByText("-0:05")).toBeInTheDocument();
  });

  it("video without a countdown explains itself", () => {
    render(<StageView frame={frame({ template: "video" })} now={NOW} />);
    expect(screen.getByText("No countdown set for this item.")).toBeInTheDocument();
  });

  it("shows the stage message on any template, and the main screen state", () => {
    for (const template of ["worship", "message", "video", "simple"] as const) {
      const { unmount } = render(<StageView frame={frame({ template, message: "Wrap up", mainMode: "black" })} now={NOW} />);
      expect(screen.getByText("Wrap up")).toBeInTheDocument();
      expect(screen.getByText("Main screen: black")).toBeInTheDocument();
      unmount();
    }
  });

  it("blocks copying", () => {
    render(<StageView frame={frame()} now={NOW} />);
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    screen.getByLabelText("Stage display").dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);
    const menu = fireEvent.contextMenu(screen.getByLabelText("Stage display"));
    expect(menu).toBe(false);
  });
});
