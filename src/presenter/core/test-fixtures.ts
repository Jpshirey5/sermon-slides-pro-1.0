import type { PresenterSlide, ServiceBundle } from "./types";

export const T0 = new Date("2026-10-11T14:00:00.000Z").getTime();
const style = { background: "#000000", fontFamily: "Georgia", textColor: "#FFFFFF" };
const HOUR = 3_600_000;

export const scripture = (id: string, translation: string, over: Partial<PresenterSlide> = {}): PresenterSlide => ({
  id,
  kind: "scripture",
  text: `Text of ${id}`,
  reference: `John 3:16 (${translation})`,
  attribution: `${translation} notice`,
  translation_id: translation,
  fums_tokens: [`tok-${id}`],
  style,
  ...over,
});

/** logo, sermon (title + NIV scripture x2), empty item, KJV scripture, blank, credits */
const stage = (template: "worship" | "message" | "video" | "simple", timer_seconds: number | null = null) => ({ template, timer_seconds });

export function makeBundle(over: Partial<ServiceBundle> = {}): ServiceBundle {
  return {
    service: { id: "svc", title: "Sunday", service_date: "2026-10-11", logo_path: "logos/grace.png" },
    items: [
      { id: "logo", type: "logo", label: "Logo", expires_at: null, translation_ids: [], stage: stage("simple"), slides: [{ id: "logo", kind: "logo", style }] },
      {
        id: "sermon",
        type: "sermon",
        label: "Anchored",
        stage: stage("message", 1800),
        expires_at: new Date(T0 + 20 * 24 * HOUR).toISOString(),
        translation_ids: ["NIV"],
        slides: [
          { id: "title", kind: "title", title: "Anchored", style },
          scripture("niv-1", "NIV"),
          scripture("niv-2", "NIV"),
        ],
      },
      { id: "empty", type: "scripture", label: "Nothing", expires_at: null, translation_ids: [], stage: stage("simple"), slides: [] },
      {
        id: "reading",
        type: "scripture",
        label: "Reading",
        stage: stage("simple"),
        expires_at: new Date(T0 + 20 * 24 * HOUR).toISOString(),
        translation_ids: ["KJV"],
        slides: [scripture("kjv-1", "KJV")],
      },
      { id: "blank", type: "blank", label: "Blank", expires_at: null, translation_ids: [], stage: stage("simple"), slides: [{ id: "blank", kind: "blank", style }] },
      {
        id: "credits",
        type: "credits",
        label: "Scripture credits",
        stage: stage("simple"),
        expires_at: null,
        translation_ids: ["KJV", "NIV"],
        slides: [{
          id: "credits",
          kind: "credits",
          style,
          notices: [
            { translation_id: "KJV", name: "King James Version", notice: "KJV notice" },
            { translation_id: "NIV", name: "New International Version", notice: "NIV notice" },
          ],
        }],
      },
    ],
    translations: {},
    issued_at: new Date(T0).toISOString(),
    bundle_expires_at: new Date(T0 + 24 * HOUR).toISOString(),
    revocation_epoch: 1,
    ...over,
  };
}
