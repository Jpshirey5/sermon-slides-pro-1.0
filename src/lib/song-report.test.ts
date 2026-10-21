import { describe, expect, it } from "vitest";
import { songReportCsv, type SongUse, summarizeSongUses } from "./songs";

const use = (over: Partial<SongUse>): SongUse => ({
  id: Math.random().toString(36),
  usedOn: "2026-10-04",
  title: "Morning Light",
  author: "Jane Writer",
  copyright: "2021 Example Songs",
  ccliSongNumber: "1234567",
  source: "licensed",
  serviceId: "s1",
  serviceTitle: "Sunday",
  ...over,
});

describe("CCLI report", () => {
  it("totals uses per song, newest date last used, licensed songs only in the report", () => {
    const { report, notReported } = summarizeSongUses([
      use({ usedOn: "2026-10-04" }),
      use({ usedOn: "2026-10-11", serviceId: "s2" }),
      use({ title: "Other Song", ccliSongNumber: "999", usedOn: "2026-10-11" }),
      use({ title: "Amazing Grace", ccliSongNumber: "", source: "public_domain" }),
    ]);
    expect(report.map((r) => [r.title, r.uses, r.lastUsed])).toEqual([
      ["Morning Light", 2, "2026-10-11"],
      ["Other Song", 1, "2026-10-11"],
    ]);
    expect(notReported.map((r) => r.title)).toEqual(["Amazing Grace"]);
  });

  it("the same CCLI number counts as one song even if the title was edited", () => {
    const { report } = summarizeSongUses([use({ title: "Morning Light" }), use({ title: "Morning Light (Live)" })]);
    expect(report).toHaveLength(1);
    expect(report[0].uses).toBe(2);
  });

  it("CSV has titles and numbers only, quoted safely", () => {
    const csv = songReportCsv([{ title: 'Say "Yes", Lord', author: "=cmd", copyright: "2021", ccliSongNumber: "1", uses: 3, lastUsed: "2026-10-11" }]);
    expect(csv).toBe('Title,CCLI Song Number,Authors,Copyright,Times Used,Last Used\n"Say ""Yes"", Lord",1,\'=cmd,2021,3,2026-10-11\n');
  });
});
