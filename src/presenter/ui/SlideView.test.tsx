import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PresenterSlide } from "../core/types";
import { lyricsFontSize, SlideView } from "./SlideView";

const lyrics = (text: string, style: Partial<PresenterSlide["style"]> = {}): PresenterSlide => ({
  id: text,
  kind: "lyrics",
  text,
  style: { background: "#000000", fontFamily: "Georgia", textColor: "#FFFFFF", ...style },
});

describe("SlideView text", () => {
  it("song slides use the song's one size, whatever their length", () => {
    expect(lyricsFontSize(lyrics("short", { fontSize: 4.6 }))).toBe("4.6cqw");
    expect(lyricsFontSize(lyrics("a much longer line\nand another\nand more\nand more\nand more", { fontSize: 4.6 }))).toBe("4.6cqw");
    expect(lyricsFontSize(lyrics("short"))).toBe("5.6cqw");
  });

  it("puts words in the upper third, center, or lower third", () => {
    render(
      <>
        <SlideView frame={{ kind: "slide", slide: lyrics("top words", { textPosition: "top" }) }} />
        <SlideView frame={{ kind: "slide", slide: lyrics("middle words") }} />
        <SlideView frame={{ kind: "slide", slide: { ...lyrics("low words", { textPosition: "bottom" }), credit: "Credit line." } }} />
        <SlideView frame={{ kind: "slide", slide: { id: "p", kind: "point", title: "A point", style: { background: "#000", fontFamily: "Georgia", textColor: "#fff", textPosition: "bottom" } } }} />
      </>,
    );
    expect(screen.getByText("top words").parentElement!.className).toContain("justify-start");
    expect(screen.getByText("middle words").parentElement!.className).toContain("justify-center");
    expect(screen.getByText("low words").parentElement!.className).toMatch(/justify-end.*pb-\[3cqw\]/);
    expect(screen.getByText("A point").parentElement!.parentElement!.className).toContain("items-end");
  });
});
