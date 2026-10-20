import { describe, expect, it } from "vitest";
import { parseSongText } from "./song-import";

// Made-up lyrics in the layout of a SongSelect lyrics download.
const SONGSELECT = `Morning Light Is Rising

Verse 1
Morning light is rising
Over every hill

Chorus
Sing it out, sing it out
Let the whole earth sing

Verse 2
Evening falls in mercy
Still we lift our song

Chorus
Sing it out, sing it out
Let the whole earth sing

Bridge
Ever faithful
Ever true

CCLI Song # 1234567
Jane Writer | Sam Composer
© 2021 Example Songs (Admin. by Example Publishing)
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 7654321
`;

describe("parseSongText", () => {
  it("reads a SongSelect lyrics file: title, sections, repeats, and the footer details", () => {
    const song = parseSongText(SONGSELECT)!;
    expect(song.title).toBe("Morning Light Is Rising");
    expect(song.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2", "Bridge"]);
    expect(song.arrangement).toEqual([0, 1, 2, 1, 3]);
    expect(song.ccliSongNumber).toBe("1234567");
    expect(song.author).toBe("Jane Writer, Sam Composer");
    expect(song.copyright).toBe("2021 Example Songs (Admin. by Example Publishing)");
    expect(song.fromSongSelect).toBe(true);
    const all = song.sections.map((s) => s.lyrics).join("\n");
    expect(all).not.toMatch(/CCLI|SongSelect|©/);
  });

  it("reads a pasted song with bracketed and short labels, and keeps blank lines inside a section as slide breaks", () => {
    const song = parseSongText(`[Verse1]\nline one\nline two\n\nline three\n\nPRE-CHORUS:\nrising up\n\nC\nhere we go\n\nC\n`)!;
    expect(song.title).toBe("");
    expect(song.sections).toEqual([
      { label: "Verse 1", lyrics: "line one\nline two\n\nline three" },
      { label: "Pre-chorus", lyrics: "rising up" },
      { label: "Chorus", lyrics: "here we go" },
    ]);
    expect(song.arrangement).toEqual([0, 1, 2, 2]);
    expect(song.fromSongSelect).toBe(false);
  });

  it("a song with no labels becomes one section, a slide per stanza", () => {
    const song = parseSongText("first stanza\nmore\n\nsecond stanza\n")!;
    expect(song.sections).toEqual([{ label: "Lyrics", lyrics: "first stanza\nmore\n\nsecond stanza" }]);
    expect(song.arrangement).toEqual([]);
  });

  it("two different sections with the same label are both kept", () => {
    const song = parseSongText("Verse\nfirst words\n\nVerse\nother words\n")!;
    expect(song.sections.map((s) => s.label)).toEqual(["Verse", "Verse (2)"]);
    expect(song.arrangement).toEqual([]);
  });

  it("returns null when there are no lyrics", () => {
    expect(parseSongText("")).toBeNull();
    expect(parseSongText("Chorus\n\nCCLI Song # 1\n© 2020 X")).toBeNull();
  });
});
