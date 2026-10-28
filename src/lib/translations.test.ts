import { describe, expect, it } from "vitest";
import {
  TRANSLATION_OPTIONS,
  getAvailableTranslations,
  isTranslationAllowed,
} from "./translations";

describe("translation choices", () => {
  it("offers every translation, including ESV, to every church", () => {
    const codes = getAvailableTranslations(false).map((t) => t.code);
    expect(codes).toContain("ESV");
    expect(codes).toContain("KJV");
    expect(codes.length).toBe(TRANSLATION_OPTIONS.length);
  });

  it("includes ESV when the org is entitled", () => {
    const codes = getAvailableTranslations(true).map((t) => t.code);
    expect(codes).toContain("ESV");
    expect(codes.length).toBe(TRANSLATION_OPTIONS.length);
  });

  it("allows ESV whether or not the church had the old ESV access", () => {
    expect(isTranslationAllowed("ESV", false)).toBe(true);
    expect(isTranslationAllowed("esv", false)).toBe(true);
    expect(isTranslationAllowed("ESV", true)).toBe(true);
  });

  it("always allows unrestricted translations and empty values", () => {
    expect(isTranslationAllowed("KJV", false)).toBe(true);
    expect(isTranslationAllowed(null, false)).toBe(true);
    expect(isTranslationAllowed(undefined, false)).toBe(true);
  });
});
