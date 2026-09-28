// PARTNER API — request body schemas. Every partner-supplied field passes
// through one of these before it reaches the database; unknown top-level keys
// are stripped, and theme config is strict.

import { z } from "npm:zod@3.25.76";
import { PartnerError } from "./errors.ts";

// Mirrors src/lib/translations.ts TRANSLATION_OPTIONS.
export const TRANSLATIONS = [
  "KJV", "NKJV", "NIV", "CSB", "ESV", "WEB", "ASV", "AMP",
  "RVR1960", "NVI", "LSG", "LUT", "ALMEIDA",
] as const;

const externalId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/, "must be printable ASCII with no spaces");

const optionalText = (max: number) => z.string().trim().max(max).optional();

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex color like #1A2B3C");

const translation = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(TRANSLATIONS));

export const accountCreateSchema = z.object({
  external_user_id: externalId,
  email: z.string().trim().toLowerCase().email().max(254),
  name: optionalText(200),
  church_name: optionalText(200),
  role: optionalText(100),
  theme_id: externalId.optional(),
  send_welcome_email: z.boolean().optional().default(false),
});

export const themeConfigSchema = z
  .object({
    background: hexColor.optional(),
    text_color: hexColor.optional(),
    accent_color: hexColor.optional(),
    font_family: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9 \-]+$/, "must be a plain font family name").optional(),
    logo_url: z
      .string()
      .max(2048)
      .url()
      .refine((value) => value.startsWith("https://"), "must be an https URL")
      .optional(),
    default_translation: translation.optional(),
  })
  .strict();

export const themeCreateSchema = z.object({
  external_theme_id: externalId,
  church_name: z.string().trim().min(1).max(200),
  config: themeConfigSchema.default({}),
});

export const sessionCreateSchema = z.object({
  external_user_id: externalId,
  deck_id: z.string().uuid().optional(),
  return_url: z.string().max(2048).optional(),
});

const pointSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  refs: z.array(z.string().trim().min(3).max(100)).max(20).default([]),
  body: z.string().max(4000).optional(),
});

export const deckCreateSchema = z
  .object({
    external_user_id: externalId,
    title: z.string().trim().min(1).max(200),
    scripture_ref: z.string().trim().min(3).max(100).optional(),
    service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").optional(),
    translation: translation.optional(),
    theme_id: externalId.optional(),
    big_idea: z.string().trim().max(500).optional(),
    points: z.array(pointSchema).min(1).max(30).optional(),
    raw_text: z.string().trim().min(1).max(200_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.points && !value.raw_text) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["points"], message: "supply either points or raw_text" });
    }
    if (value.points && value.raw_text) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["raw_text"], message: "supply points or raw_text, not both" });
    }
  });

export const exportCreateSchema = z.object({
  formats: z
    .array(z.enum(["pro7", "pptx", "pdf"]))
    .min(1)
    .max(3)
    .refine((formats) => new Set(formats).size === formats.length, "must not repeat a format"),
});

export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type ThemeCreate = z.infer<typeof themeCreateSchema>;
export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type SessionCreate = z.infer<typeof sessionCreateSchema>;
export type DeckCreate = z.infer<typeof deckCreateSchema>;
export type ExportCreate = z.infer<typeof exportCreateSchema>;

/** Parse or throw validation_failed naming the first offending field. */
export const parseOrThrow = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.length ? issue.path.join(".") : "body";
  const message = issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined"
    ? "is required"
    : issue.code === z.ZodIssueCode.unrecognized_keys
    ? `unknown field(s): ${issue.keys.join(", ")}`
    : issue.message;
  throw new PartnerError("validation_failed", `${field}: ${message}`);
};
