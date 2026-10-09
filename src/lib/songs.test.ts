import { describe, expect, it } from "vitest";
import { emptySong, slideCount, validateSong } from "./songs";

describe("songs", () => {
  it("a blank line starts a new slide", () => {
    expect(slideCount("one\ntwo")).toBe(1);
    expect(slideCount("one\ntwo\n\nthree\n\n\n  \nfour")).toBe(3);
    expect(slideCount("a\r\n\r\nb")).toBe(2);
    expect(slideCount("   ")).toBe(0);
  });

  it("validation explains what's missing in plain language", () => {
    expect(validateSong(emptySong())).toEqual(["Add a title.", "Add lyrics to at least one section."]);
    const song = { ...emptySong(), title: "Doxology", ccliSongNumber: "12a" };
    song.sections[0].lyrics = "Praise God";
    expect(validateSong(song)).toEqual(["The CCLI song number should be digits only."]);
    song.ccliSongNumber = "123";
    song.sections[1].label = " ";
    expect(validateSong(song)).toEqual(["Give every section a name."]);
    song.sections[1].label = "Chorus";
    expect(validateSong(song)).toEqual([]);
  });

  it("new songs start with a verse and a chorus, each with its own id", () => {
    const s = emptySong();
    expect(s.sections.map((x) => x.label)).toEqual(["Verse 1", "Chorus"]);
    expect(new Set(s.sections.map((x) => x.id)).size).toBe(2);
  });
});
