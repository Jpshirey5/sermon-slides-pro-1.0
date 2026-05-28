import { describe, expect, it } from "vitest";
import {
  TRANSLATION_OPTIONS,
  getAvailableTranslations,
  isTranslationAllowed,
} from "./translations";

describe("translation entitlement gating", () => {
  it("hides ESV when the org is not entitled", () => {
    const codes = getAvailableTranslations(false).map((t) => t.code);
    expect(codes).not.toContain("ESV");
    expect(codes).toContain("KJV");
    expect(codes.length).toBe(TRANSLATION_OPTIONS.length - 1);
  });

  it("includes ESV when the org is entitled", () => {
    const codes = getAvailableTranslations(true).map((t) => t.code);
    expect(codes).toContain("ESV");
    expect(codes.length).toBe(TRANSLATION_OPTIONS.length);
  });

  it("treats ESV as disallowed for non-entitled orgs, case-insensitively", () => {
    expect(isTranslationAllowed("ESV", false)).toBe(false);
    expect(isTranslationAllowed("esv", false)).toBe(false);
    expect(isTranslationAllowed("ESV", true)).toBe(true);
  });

  it("always allows unrestricted translations and empty values", () => {
    expect(isTranslationAllowed("KJV", false)).toBe(true);
    expect(isTranslationAllowed(null, false)).toBe(true);
    expect(isTranslationAllowed(undefined, false)).toBe(true);
  });
});
