// PARTNER API — the ONLY place the partner API touches existing SSP code:
// billing, the sermon parser, scripture lookup, slide generation, and export.
// Everything else under _shared/partner is self-contained. Each adapter lists
// what is still open in a TODO so it can be finished without reading the rest
// of the partner API.

import { defaultDeps, type PartnerDeps } from "./auth.ts";
import { describeError } from "./errors.ts";
import { completenessPayload, type CompletenessInputs } from "./completeness.ts";
import type { ThemeConfig } from "./schemas.ts";
import { formatScriptureReferenceForDisplay, generateSlidesFromPresentation, type FormData, type SlideData } from "./slides.ts";
import { createImageResolver } from "./export/images.ts";
import { buildPowerPointBytes } from "./export/pptx.ts";
import { buildProBundleBytes } from "./export/pro7.ts";
import { parseManuscriptWithClaude, type ParsedScriptureRef } from "../../parse-sermon-manuscript/claudeParser.ts";
import { extractRefsFromText, mergeRefs, parseRawReference } from "../../parse-sermon-manuscript/refExtractor.ts";
import { validateReferences, type ValidatedVerseBlock } from "../../parse-sermon-manuscript/scriptureValidator.ts";
import { buildSermon } from "../../parse-sermon-manuscript/sermonBuilder.ts";

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[PARTNER-API] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

export const EXPORT_BUCKET = "partner-exports";
export const EXPORT_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SUPPORTED_EXPORT_FORMATS = ["pro7", "pptx"] as const;
export type ExportFormat = "pro7" | "pptx" | "pdf";

// A queued/generating row older than this is reported as failed: the
// background task was evicted (edge function wall-clock limit) and will not finish.
const STALE_DECK_MS = 10 * 60 * 1000;
const STALE_EXPORT_MS = 15 * 60 * 1000;

const resolveAccountId = async (deps: PartnerDeps, userId: string): Promise<string> => {
  const { data, error } = await deps.db.rpc("get_user_account_id", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error(`No account is linked to user ${userId}`);
  return data as string;
};

// ── 1. Billing ──────────────────────────────────────────────────────────────

/**
 * Marks the user's account as partner-billed so Stripe is out of the loop:
 * check-subscription reports it as subscribed without a Stripe customer, and
 * create-checkout refuses to start a checkout for it. Existing Stripe ids are
 * never touched; an account with its own live subscription keeps its plan.
 *
 * TODO(partner-billing): confirm the policy for (a) seats whose user is a
 * member, not the owner, of a church account — today the flag is set on
 * whichever account get_user_account_id returns, which grants the whole church
 * account; and (b) the entitlement → plan_tier mapping (entitlement values are
 * written to accounts.plan_tier as-is, default "core").
 */
export const setPartnerBilling = async (
  userId: string,
  active: boolean,
  entitlement = "core",
  deps: PartnerDeps = defaultDeps(),
): Promise<void> => {
  const accountId = await resolveAccountId(deps, userId);
  const { data: account, error } = await deps.db
    .from("accounts")
    .select("id, stripe_subscription_id, subscription_status")
    .eq("id", accountId)
    .single();
  if (error) throw error;

  const hasOwnSubscription = Boolean(account.stripe_subscription_id) &&
    ["active", "trialing", "past_due"].includes(account.subscription_status);

  const update: Record<string, unknown> = active
    ? { partner_billing_active: true, partner_plan_tier: entitlement }
    : { partner_billing_active: false, partner_plan_tier: null };
  if (!hasOwnSubscription) {
    Object.assign(
      update,
      active
        ? { plan_tier: entitlement, subscription_status: "active", signup_status: "active" }
        : { plan_tier: "free", subscription_status: "inactive" },
    );
  }

  const { error: updateError } = await deps.db.from("accounts").update(update).eq("id", accountId);
  if (updateError) throw updateError;
  logStep("Partner billing updated", { account_id: accountId, active, has_own_subscription: hasOwnSubscription });
};

// ── 2. Deck generation ──────────────────────────────────────────────────────

export interface DeckOutline {
  title: string;
  scripture_ref?: string;
  service_date?: string;
  translation: string;
  big_idea?: string;
  points?: { heading: string; refs: string[]; body?: string }[];
  raw_text?: string;
  theme: ThemeConfig | null;
}

interface BuiltDeck {
  formData: FormData;
  /** Point blocks that count toward completeness (big idea and verse blocks excluded). */
  countedPointIds: { id: string; title: string }[];
  totalRefs: number;
  resolvedRefs: number;
  unresolvedVerses: string[];
}

const blockIds = () => {
  const base = Date.now();
  let seq = 0;
  return () => String(base + seq++);
};

const verseBlock = (id: string, verse: ValidatedVerseBlock) => ({
  id,
  type: "verse" as const,
  title: formatScriptureReferenceForDisplay(verse.reference),
  scriptures: [{
    reference: formatScriptureReferenceForDisplay(verse.reference),
    text: verse.text,
    ...(verse.verses ? { verses: verse.verses } : {}),
  }],
});

const refLabel = (ref: ParsedScriptureRef) => {
  const range = ref.end_verse && ref.end_verse !== ref.start_verse ? `${ref.start_verse}-${ref.end_verse}` : `${ref.start_verse}`;
  return `${ref.book} ${ref.chapter}:${range}`;
};

const lookupRefs = (refs: ParsedScriptureRef[], translation: string, userId: string) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return validateReferences({
    refs,
    translation,
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    // scripture-lookup checks ESV entitlement against this user's own account.
    authHeader: `Bearer ${serviceRoleKey}`,
    extraHeaders: { "x-ssp-on-behalf-of-user": userId },
  });
};

const baseFormData = (outline: DeckOutline, date: string): Omit<FormData, "points"> => ({
  title: outline.title,
  series: null,
  date,
  translation: outline.translation,
  verseBreakdown: "verse-by-verse",
  proPresenterMode: false,
  slideStyle: "balanced",
  themeStyle: "clean",
});

const mainPassageRefs = (outline: DeckOutline): { refs: ParsedScriptureRef[]; unparseable: string[] } => {
  if (!outline.scripture_ref) return { refs: [], unparseable: [] };
  const refs = parseRawReference(outline.scripture_ref).map((ref) => ({ ...ref, point_index: null, placement: "intro" as const }));
  return refs.length ? { refs, unparseable: [] } : { refs: [], unparseable: [outline.scripture_ref] };
};

/** Structured points: no model call. Each ref string is parsed deterministically. */
const buildFromPoints = async (outline: DeckOutline, userId: string, date: string): Promise<BuiltDeck> => {
  const nextId = blockIds();
  const main = mainPassageRefs(outline);
  const unparseable = [...main.unparseable];
  const refs: ParsedScriptureRef[] = [...main.refs];

  outline.points!.forEach((point, pointIndex) => {
    for (const raw of point.refs) {
      const parsed = parseRawReference(raw);
      if (parsed.length === 0) unparseable.push(raw);
      refs.push(...parsed.map((ref) => ({ ...ref, point_index: pointIndex, subpoint_index: null })));
    }
  });

  const lookup = refs.length ? await lookupRefs(refs, outline.translation, userId) : { validated: [], failed: [] };
  const byPoint = new Map<number | null, ValidatedVerseBlock[]>();
  for (const verse of lookup.validated) {
    const key = verse.point_index;
    if (!byPoint.has(key)) byPoint.set(key, []);
    byPoint.get(key)!.push(verse);
  }

  const blocks: FormData["points"] = (byPoint.get(null) || []).map((verse) => verseBlock(nextId(), verse));
  if (outline.big_idea) blocks.push({ id: nextId(), type: "point", title: outline.big_idea, scriptures: [] });

  const countedPointIds: BuiltDeck["countedPointIds"] = [];
  outline.points!.forEach((point, pointIndex) => {
    const id = nextId();
    countedPointIds.push({ id, title: point.heading });
    blocks.push({ id, type: "point", title: point.heading, scriptures: [] });
    blocks.push(...(byPoint.get(pointIndex) || []).map((verse) => verseBlock(nextId(), verse)));
  });

  return {
    formData: { ...baseFormData(outline, date), points: blocks },
    countedPointIds,
    totalRefs: refs.length + unparseable.length,
    resolvedRefs: lookup.validated.length,
    unresolvedVerses: [...unparseable, ...lookup.failed.map(refLabel)],
  };
};

/** raw_text: the existing Quick Build parser (Claude on Bedrock) plus the regex backstop. */
const buildFromRawText = async (outline: DeckOutline, userId: string, date: string): Promise<BuiltDeck> => {
  const text = outline.raw_text!;
  const parsed = await parseManuscriptWithClaude({ kind: "text", text });
  const main = mainPassageRefs(outline);
  const refs = [
    ...main.refs,
    ...mergeRefs(
      parsed.data.scripture_references,
      extractRefsFromText(text).map((ref) => ({ ...ref, placement: "conclusion" as const })),
    ),
  ];

  const lookup = refs.length ? await lookupRefs(refs, outline.translation, userId) : { validated: [], failed: [] };
  const built = buildSermon({ parsed: parsed.data, validatedVerses: lookup.validated, translation: outline.translation });
  const blocks = built.formData.points as FormData["points"];
  const countedPointIds = blocks
    .filter((block) => block.type === "point")
    .map((block) => ({ id: block.id, title: block.title }));

  if (outline.big_idea) {
    const firstPoint = blocks.findIndex((block) => block.type === "point");
    blocks.splice(firstPoint < 0 ? blocks.length : firstPoint, 0, {
      id: `${Date.now()}-big-idea`,
      type: "point",
      title: outline.big_idea,
      scriptures: [],
    });
  }

  return {
    formData: { ...baseFormData(outline, date), series: built.series, points: blocks },
    countedPointIds,
    totalRefs: refs.length + main.unparseable.length,
    resolvedRefs: lookup.validated.length,
    unresolvedVerses: [...main.unparseable, ...lookup.failed.map((ref) => ref.raw_text || refLabel(ref))],
  };
};

export const applyTheme = (slides: SlideData[], theme: ThemeConfig | null): SlideData[] =>
  theme
    ? slides.map((slide) => ({
      ...slide,
      ...(theme.background ? { background: theme.background } : {}),
      ...(theme.text_color ? { textColor: theme.text_color } : {}),
      ...(theme.font_family ? { fontFamily: theme.font_family } : {}),
    }))
    : slides;

const generateDeck = async (deckId: string, userId: string, outline: DeckOutline, deps: PartnerDeps) => {
  const startedAt = Date.now();
  await deps.db.from("sermons").update({ generation_status: "generating" }).eq("id", deckId);
  const source = outline.points ? "points" : "raw_text";
  try {
    const date = outline.service_date || new Date().toISOString().slice(0, 10);
    const built = outline.points
      ? await buildFromPoints(outline, userId, date)
      : await buildFromRawText(outline, userId, date);

    const slides = applyTheme(
      generateSlidesFromPresentation({ title: outline.title, date, data: built.formData }),
      outline.theme,
    );
    const slideIds = new Set(slides.map((slide) => slide.id));
    const pointsWithoutSlides = built.countedPointIds
      .filter((point) => !slideIds.has(`point-${point.id}`))
      .map((point) => point.title);

    const stats: CompletenessInputs & { source: string } = {
      source,
      total_points: built.countedPointIds.length,
      points_with_slides: built.countedPointIds.length - pointsWithoutSlides.length,
      total_refs: built.totalRefs,
      resolved_refs: built.resolvedRefs,
      unresolved_verses: [...new Set(built.unresolvedVerses)],
      points_without_slides: pointsWithoutSlides,
    };

    const { error } = await deps.db
      .from("sermons")
      .update({
        slides: { formData: built.formData, editorSlides: slides },
        generation_status: "ready",
        generation_error: null,
        generation_stats: stats,
      })
      .eq("id", deckId);
    if (error) throw error;
    logStep("Deck generated", { deck_id: deckId, source, slides: slides.length, duration_ms: Date.now() - startedAt });
  } catch (error) {
    const message = describeError(error);
    console.error(`[PARTNER-API] Deck generation failed - ${JSON.stringify({ deck_id: deckId, source, error: message })}`);
    const partnerMessage = /Parser|Claude|JSON|Bedrock/i.test(message)
      ? "We couldn't parse raw_text into a sermon outline. Retry, or submit structured points."
      : "Deck generation failed. Submit the deck again.";
    await deps.db
      .from("sermons")
      .update({ generation_status: "failed", generation_error: partnerMessage })
      .eq("id", deckId);
  }
};

/**
 * Inserts the deck (a public.sermons row owned by the pastor's account) and
 * runs generation in the background. Structured points skip the model
 * entirely; raw_text goes through the Quick Build parser.
 *
 * TODO(partner-generation): (a) partner raw_text parses are not written to
 * quick_build_usage/quick_build_parses, so they do not count against the
 * pastor's monthly Quick Build cap and are not in the learning loop — decide
 * whether they should; (b) point `body` text is accepted but not rendered (the
 * slide model has no body field); (c) theme accent_color and logo_url are
 * stored but not rendered.
 */
export const createAndQueueDeck = async (
  userId: string,
  partnerId: string,
  externalUserId: string,
  outline: DeckOutline,
  deps: PartnerDeps = defaultDeps(),
): Promise<string> => {
  const accountId = await resolveAccountId(deps, userId);
  const date = outline.service_date || new Date().toISOString().slice(0, 10);
  const { data, error } = await deps.db
    .from("sermons")
    .insert({
      account_id: accountId,
      created_by_user_id: userId,
      title: outline.title,
      scripture_reference: outline.scripture_ref ?? null,
      presentation_date: date,
      slides: { formData: { ...baseFormData(outline, date), points: [] } },
      creation_mode: outline.points ? "structured_builder" : "quick_build",
      partner_id: partnerId,
      partner_external_user_id: externalUserId,
      generation_status: "queued",
    })
    .select("id")
    .single();
  if (error) throw error;

  deps.runInBackground(() => generateDeck(data.id, userId, outline, deps));
  return data.id as string;
};

// ── 3. Deck state ───────────────────────────────────────────────────────────

export type DeckStatus = "queued" | "generating" | "ready" | "failed";

export interface DeckState {
  status: DeckStatus;
  slide_count: number;
  total_points: number;
  points_with_slides: number;
  total_refs: number;
  resolved_refs: number;
  unresolved_verses: string[];
  points_without_slides: string[];
  approved_at: string | null;
  created_at: string;
  error_message: string | null;
}

export const readDeckState = async (deckId: string, deps: PartnerDeps = defaultDeps()): Promise<DeckState> => {
  const { data: row, error } = await deps.db
    .from("sermons")
    .select("generation_status, generation_error, generation_stats, slides, approved_at, created_at, updated_at")
    .eq("id", deckId)
    .single();
  if (error) throw error;

  let status = (row.generation_status || "ready") as DeckStatus;
  let errorMessage: string | null = row.generation_error ?? null;
  if ((status === "queued" || status === "generating") && Date.now() - new Date(row.updated_at).getTime() > STALE_DECK_MS) {
    status = "failed";
    errorMessage = "Deck generation timed out. Submit the deck again.";
    await deps.db
      .from("sermons")
      .update({ generation_status: status, generation_error: errorMessage })
      .eq("id", deckId)
      .in("generation_status", ["queued", "generating"]);
  }

  const stats = (row.generation_stats || {}) as Partial<CompletenessInputs>;
  const editorSlides = Array.isArray(row.slides?.editorSlides) ? row.slides.editorSlides : [];
  return {
    status,
    slide_count: status === "ready" ? editorSlides.length : 0,
    total_points: stats.total_points ?? 0,
    points_with_slides: stats.points_with_slides ?? 0,
    total_refs: stats.total_refs ?? 0,
    resolved_refs: stats.resolved_refs ?? 0,
    unresolved_verses: stats.unresolved_verses ?? [],
    points_without_slides: stats.points_without_slides ?? [],
    approved_at: row.approved_at ?? null,
    created_at: row.created_at,
    error_message: status === "failed" ? errorMessage : null,
  };
};

export const deckCompleteness = (state: DeckState) => completenessPayload(state);

// ── 4. Thumbnails ───────────────────────────────────────────────────────────

/**
 * TODO(partner-thumbnails): SSP has no server-side slide renderer — the editor
 * draws slides in the browser. Until one exists (e.g. rendering each slide to
 * PNG in the export worker and storing it next to the export files), this
 * returns an empty list for every deck, which the API contract allows.
 */
export const thumbnailUrls = async (_deckId: string, _deps: PartnerDeps = defaultDeps()): Promise<string[]> => {
  return [];
};

// ── 5. Exports ──────────────────────────────────────────────────────────────

interface StoredFile {
  format: ExportFormat;
  path: string;
  filename: string;
  bytes: number;
}

const runExport = async (exportId: string, deps: PartnerDeps) => {
  await deps.db.from("partner_exports").update({ status: "generating", updated_at: new Date().toISOString() }).eq("id", exportId);
  try {
    const { data: job, error: jobError } = await deps.db
      .from("partner_exports")
      .select("id, partner_id, deck_id, formats")
      .eq("id", exportId)
      .single();
    if (jobError) throw jobError;
    const { data: deck, error: deckError } = await deps.db
      .from("sermons")
      .select("title, slides")
      .eq("id", job.deck_id)
      .single();
    if (deckError) throw deckError;

    const slides = (Array.isArray(deck.slides?.editorSlides) ? deck.slides.editorSlides : []) as SlideData[];
    if (slides.length === 0) throw new Error("Deck has no slides to export");

    const resolveImage = createImageResolver(deps.db);
    const files: StoredFile[] = [];
    for (const format of job.formats as ExportFormat[]) {
      const built = format === "pro7"
        ? await buildProBundleBytes(slides, deck.title, resolveImage)
        : format === "pptx"
        ? await buildPowerPointBytes(slides, deck.title, resolveImage)
        : null;
      if (!built) throw new Error(`Unsupported export format ${format}`);

      const extension = format === "pro7" ? "probundle" : "pptx";
      const path = `${job.partner_id}/${job.deck_id}/${exportId}/${format}.${extension}`;
      const { error: uploadError } = await deps.db.storage.from(EXPORT_BUCKET).upload(path, built.bytes, {
        contentType: format === "pro7" ? "application/zip" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        upsert: true,
      });
      if (uploadError) throw uploadError;
      files.push({ format, path, filename: built.filename, bytes: built.bytes.byteLength });
    }

    const { error } = await deps.db
      .from("partner_exports")
      .update({ status: "ready", files, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", exportId);
    if (error) throw error;
    logStep("Export generated", { export_id: exportId, formats: job.formats });
  } catch (error) {
    const message = describeError(error);
    console.error(`[PARTNER-API] Export failed - ${JSON.stringify({ export_id: exportId, error: message })}`);
    await deps.db
      .from("partner_exports")
      .update({ status: "failed", error_message: "Export failed. Request the export again.", updated_at: new Date().toISOString() })
      .eq("id", exportId);
  }
};

/**
 * Queues an export of the deck's CURRENT editor slides (so pastor edits made
 * after generation are included) through server-side ports of the browser
 * .pro7 and .pptx builders.
 *
 * TODO(partner-pdf): the PDF builder (src/lib/export-pdf.ts) is not ported;
 * POST /decks/{id}/exports rejects "pdf" with validation_failed until it is.
 */
export const createAndQueueExport = async (
  deckId: string,
  formats: ExportFormat[],
  deps: PartnerDeps = defaultDeps(),
): Promise<string> => {
  const { data: deck, error: deckError } = await deps.db.from("sermons").select("partner_id").eq("id", deckId).single();
  if (deckError) throw deckError;
  const { data, error } = await deps.db
    .from("partner_exports")
    .insert({ partner_id: deck.partner_id, deck_id: deckId, formats, status: "queued" })
    .select("id")
    .single();
  if (error) throw error;
  deps.runInBackground(() => runExport(data.id, deps));
  return data.id as string;
};

export interface ExportState {
  export_id: string;
  deck_id: string;
  status: DeckStatus;
  files: { format: ExportFormat; url: string; bytes: number; expires_at: string }[];
  error: string | null;
}

/** Signed URLs are minted on every read (7-day TTL) and never persisted. */
export const readExportState = async (exportId: string, deps: PartnerDeps = defaultDeps()): Promise<ExportState> => {
  const { data: job, error } = await deps.db
    .from("partner_exports")
    .select("id, deck_id, status, files, error_message, updated_at")
    .eq("id", exportId)
    .single();
  if (error) throw error;

  let status = job.status as DeckStatus;
  let errorMessage: string | null = job.error_message ?? null;
  if ((status === "queued" || status === "generating") && Date.now() - new Date(job.updated_at).getTime() > STALE_EXPORT_MS) {
    status = "failed";
    errorMessage = "Export timed out. Request the export again.";
    await deps.db
      .from("partner_exports")
      .update({ status, error_message: errorMessage, updated_at: new Date().toISOString() })
      .eq("id", exportId)
      .in("status", ["queued", "generating"]);
  }

  const files: ExportState["files"] = [];
  if (status === "ready") {
    const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000).toISOString();
    for (const file of (job.files || []) as StoredFile[]) {
      const { data: signed, error: signError } = await deps.db.storage
        .from(EXPORT_BUCKET)
        .createSignedUrl(file.path, EXPORT_URL_TTL_SECONDS, { download: file.filename });
      if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not sign export URL");
      files.push({ format: file.format, url: signed.signedUrl, bytes: file.bytes, expires_at: expiresAt });
    }
  }

  return {
    export_id: job.id,
    deck_id: job.deck_id,
    status,
    files,
    error: status === "failed" ? errorMessage : null,
  };
};
