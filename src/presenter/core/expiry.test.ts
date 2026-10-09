import { describe, expect, it } from "vitest";
import { isShowable, msUntilRefresh, pruneBundle } from "./expiry";
import { makeBundle, scripture, T0 } from "./test-fixtures";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const texts = (b: ReturnType<typeof makeBundle>) => b.items.flatMap((i) => i.slides).filter((s) => s.text).map((s) => s.id);

describe("pruneBundle: expiry", () => {
  it("leaves a fresh bundle untouched", () => {
    const bundle = makeBundle();
    const result = pruneBundle(bundle, { now: T0 + HOUR });
    expect(result.changed).toBe(false);
    expect(result.bundle).toBe(bundle);
  });

  it("drops all scripture once the bundle expires, keeping the pastor's own slides", () => {
    const result = pruneBundle(makeBundle(), { now: T0 + DAY });
    expect(result.changed).toBe(true);
    expect(texts(result.bundle)).toEqual([]);
    expect(result.dropped.map((d) => [d.itemId, d.reason])).toEqual([["sermon", "expired"], ["reading", "expired"]]);
    const sermon = result.bundle.items[1].slides;
    expect(sermon.map((s) => s.kind)).toEqual(["title", "missing", "missing"]);
    expect(sermon[0].title).toBe("Anchored");
    expect(sermon[1]).not.toHaveProperty("fums_tokens");
    expect(sermon[1].missing_reason).toBe("expired");
  });

  it("drops one item whose own expiry passed, even if the bundle has not", () => {
    const bundle = makeBundle();
    bundle.items[3].expires_at = new Date(T0 + HOUR).toISOString();
    const result = pruneBundle(bundle, { now: T0 + 2 * HOUR });
    expect(texts(result.bundle)).toEqual(["niv-1", "niv-2"]);
    expect(result.bundle.items[3].translation_ids).toEqual([]);
  });

  it("treats an unreadable expiry as expired", () => {
    const result = pruneBundle(makeBundle({ bundle_expires_at: "garbage" }), { now: T0 });
    expect(texts(result.bundle)).toEqual([]);
  });

  it("does not modify the original bundle", () => {
    const bundle = makeBundle();
    pruneBundle(bundle, { now: T0 + DAY });
    expect(texts(bundle)).toEqual(["niv-1", "niv-2", "kjv-1"]);
  });
});

describe("pruneBundle: revocation", () => {
  it("removes text in a revoked translation and keeps the others", () => {
    const result = pruneBundle(makeBundle(), { now: T0, unavailable: new Set(["NIV"]) });
    expect(texts(result.bundle)).toEqual(["kjv-1"]);
    expect(result.dropped).toEqual([{ itemId: "sermon", reason: "revoked" }]);
    expect(result.bundle.items[1].slides[1].missing_reason).toBe("revoked");
    expect(result.bundle.items[1].translation_ids).toEqual([]);
  });

  it("removes only the revoked translation's notice from the credits", () => {
    const result = pruneBundle(makeBundle(), { now: T0, unavailable: new Set(["NIV"]) });
    const credits = result.bundle.items.at(-1)!;
    expect(credits.slides[0].notices!.map((n) => n.translation_id)).toEqual(["KJV"]);
    expect(credits.translation_ids).toEqual(["KJV"]);
  });

  it("handles a mixed item: revoked slides go, others in the same item stay", () => {
    const bundle = makeBundle();
    bundle.items[1].slides.push(scripture("kjv-in-sermon", "KJV"));
    bundle.items[1].translation_ids = ["KJV", "NIV"];
    const result = pruneBundle(bundle, { now: T0, unavailable: new Set(["NIV"]) });
    expect(result.bundle.items[1].slides.map((s) => s.kind)).toEqual(["title", "missing", "missing", "scripture"]);
    expect(result.bundle.items[1].translation_ids).toEqual(["KJV"]);
  });

  it("reports revoked over expired when both apply", () => {
    const result = pruneBundle(makeBundle(), { now: T0 + DAY, unavailable: new Set(["NIV"]) });
    expect(result.dropped.find((d) => d.itemId === "sermon")!.reason).toBe("revoked");
    expect(result.dropped.find((d) => d.itemId === "reading")!.reason).toBe("expired");
  });
});

describe("isShowable and msUntilRefresh", () => {
  it("requires text and attribution on scripture, and an unexpired bundle", () => {
    const bundle = makeBundle();
    expect(isShowable(scripture("a", "NIV"), bundle, T0)).toBe(true);
    expect(isShowable(scripture("a", "NIV", { attribution: "  " }), bundle, T0)).toBe(false);
    expect(isShowable(scripture("a", "NIV", { text: "" }), bundle, T0)).toBe(false);
    expect(isShowable(scripture("a", "NIV"), bundle, T0 + DAY)).toBe(false);
    expect(isShowable(bundle.items[1].slides[0], bundle, T0 + DAY)).toBe(true);
  });

  it("schedules a refresh ten minutes before the bundle expires", () => {
    expect(msUntilRefresh(makeBundle(), T0)).toBe(DAY - 10 * 60_000);
    expect(msUntilRefresh(makeBundle(), T0 + DAY)).toBe(0);
    expect(msUntilRefresh(makeBundle({ bundle_expires_at: "x" }), T0)).toBe(0);
  });
});
