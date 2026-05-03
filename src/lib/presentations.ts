// Presentation types and Supabase utilities
import { supabase } from "@/integrations/supabase/client";
import { ensureResolvedAccountAccess } from "@/lib/account-access";
import { deleteStoredBackground, isStorageBackground } from "@/lib/background-assets";
import { getPrimaryCampus } from "@/lib/campuses";
import { generateSlidesFromPresentation } from "@/lib/slide-generation";
import { calculateValueMetrics, type PresentationValueMetrics } from "@/lib/value-metrics";

export type SlideStyle = "minimal" | "balanced" | "speaker-friendly";
export type ThemeStyle = "clean" | "bold" | "scripture-focused";

export interface SermonPresentation {
  id: string;
  title: string;
  series?: string | null;
  presentationDate?: string | null;
  campusId?: string | null;
  campusName?: string | null;
  formerCampusName?: string | null;
  date: string;
  slides: number;
  lastModified: string;
  scripture_reference?: string;
  data?: {
    title: string;
    series?: string | null;
    date: string;
    translation: string;
    verseBreakdown?: string;
    proPresenterMode?: boolean;
    slideStyle?: SlideStyle;
    themeStyle?: ThemeStyle;
    points: Array<{
      id: string;
      type?: 'point' | 'verse';
      title: string;
      scriptures: Array<{
        reference: string;
        text?: string;
        verses?: { text: string; verse: number }[];
      }>;
    }>;
  };
}

export interface DashboardPresentation {
  id: string;
  title: string;
  series?: string | null;
  presentationDate: string;
  campusId?: string | null;
  campusName?: string | null;
  formerCampusName?: string | null;
  slides: number;
  isDraft?: boolean;
  valueMetrics?: PresentationValueMetrics;
  lastModified: string;
}

export interface DashboardPresentationsPage {
  items: DashboardPresentation[];
  hasMore: boolean;
}

export interface DashboardTimeSavedSummary {
  totalSeconds: number;
  weekSeconds: number;
}

export interface DashboardPresentationFilters {
  search?: string;
  presentationMonth?: string | null;
  sort?: "newest" | "oldest";
  campusFilter?: {
    type: "all" | "active" | "former";
    value?: string;
  } | null;
}

// The slides column stores a wrapper object with both form data and editor slides
interface SlidesWrapper {
  formData?: SermonPresentation['data'];
  editorSlides?: any[];
}

export interface EditorPresentationState {
  id: string;
  title: string;
  series?: string | null;
  campusId?: string | null;
  campusName?: string | null;
  formerCampusName?: string | null;
  formData?: SermonPresentation["data"];
  editorSlides: any[] | null;
  createdAt?: string;
  updatedAt?: string;
  presentationDate?: string | null;
  scriptureReference?: string;
}

interface GuestSermonRow {
  id: string;
  title: string;
  scripture_reference?: string | null;
  slides: any;
  created_at: string;
  updated_at: string;
}

const GUEST_SERMONS_STORAGE_KEY = "guest_sermons";
const serializeEditorSlides = (slides: any[] | null | undefined) => JSON.stringify(slides || []);
const DEFAULT_PRESENTATION_SORT: NonNullable<DashboardPresentationFilters["sort"]> = "newest";

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWrapped(slides: any): slides is SlidesWrapper {
  return slides && typeof slides === 'object' && !Array.isArray(slides) && ('formData' in slides || 'editorSlides' in slides);
}

function extractFormData(slides: any): SermonPresentation['data'] | undefined {
  if (isWrapped(slides)) return slides.formData;
  // Legacy: slides is the form data directly (has 'points')
  if (slides && typeof slides === 'object' && !Array.isArray(slides) && 'points' in slides) return slides as any;
  return undefined;
}

function extractSeries(slides: any): string | null {
  const formData = extractFormData(slides);
  return formData?.series?.trim() || null;
}

function resolvePresentationDate(
  slides: any,
  createdAt?: string | null,
  explicitPresentationDate?: string | null
): string {
  if (explicitPresentationDate) return explicitPresentationDate;
  const formData = extractFormData(slides);
  if (formData?.date) return formData.date;
  if (createdAt) return createdAt.split("T")[0];
  return new Date().toISOString().split("T")[0];
}

function extractEditorSlides(slides: any): any[] | null {
  if (isWrapped(slides)) return slides.editorSlides || null;
  // Legacy: slides is a raw array of editor slides
  if (Array.isArray(slides)) return slides;
  return null;
}

function collectStorageBackgrounds(editorSlides: any[] | null): string[] {
  if (!editorSlides) return [];
  return Array.from(
    new Set(
      editorSlides
        .map((slide: any) => slide?.backgroundImage)
        .filter((image: string | undefined): image is string => Boolean(image) && isStorageBackground(image))
    )
  );
}

function countSlides(slides: any): number {
  const editor = extractEditorSlides(slides);
  if (editor) return editor.length;
  return 0;
}

function readGuestSermons(): Record<string, GuestSermonRow> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GUEST_SERMONS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, GuestSermonRow>;
  } catch {
    return {};
  }
}

function writeGuestSermons(store: Record<string, GuestSermonRow>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_SERMONS_STORAGE_KEY, JSON.stringify(store));
}

function mapRowToPresentation(row: GuestSermonRow): SermonPresentation {
  return {
    id: row.id,
    title: row.title,
    series: extractSeries(row.slides),
    presentationDate: resolvePresentationDate(row.slides, row.created_at),
    date: resolvePresentationDate(row.slides, row.created_at),
    slides: countSlides(row.slides),
    lastModified: new Date(row.updated_at).toLocaleDateString(),
    scripture_reference: row.scripture_reference || undefined,
    data: extractFormData(row.slides),
  };
}

function mapRowToDashboardPresentation(
  row: Pick<GuestSermonRow, "id" | "title" | "slides" | "created_at" | "updated_at"> & {
    series?: string | null;
    presentation_date?: string | null;
    campus_id?: string | null;
    campus_name?: string | null;
    former_campus_name?: string | null;
  }
): DashboardPresentation {
  const slideCount = countSlides(row.slides);
  const formData = extractFormData(row.slides);
  const editorSlides = extractEditorSlides(row.slides);
  return {
    id: row.id,
    title: row.title,
    series: row.series || extractSeries(row.slides),
    presentationDate: resolvePresentationDate(row.slides, row.created_at, row.presentation_date || null),
    campusId: row.campus_id || null,
    campusName: row.campus_name || null,
    formerCampusName: row.former_campus_name || null,
    slides: slideCount,
    isDraft: slideCount === 0 && Boolean(formData),
    valueMetrics: slideCount > 0 ? calculateValueMetrics({ slideCount, slides: editorSlides, formData }) : undefined,
    lastModified: new Date(row.updated_at).toLocaleDateString(),
  };
}

async function getAccountPlanTier(accountId: string): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .select("plan_tier")
    .eq("id", accountId)
    .single();

  if (error) {
    throw error;
  }

  return data?.plan_tier || "free";
}

async function resolvePresentationCampusId(
  accountId: string,
  requestedCampusId?: string | null
): Promise<string | null> {
  const planTier = await getAccountPlanTier(accountId);

  if (planTier !== "enterprise") {
    return requestedCampusId || null;
  }

  if (requestedCampusId) {
    return requestedCampusId;
  }

  const primaryCampus = await getPrimaryCampus(accountId);
  return primaryCampus?.id || null;
}

async function loadCampusNamesById(accountId: string, campusIds: string[]): Promise<Map<string, string>> {
  if (campusIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("campuses")
    .select("id, name")
    .eq("account_id", accountId)
    .in("id", campusIds);

  if (error || !data) {
    return new Map();
  }

  return new Map(data.map((campus) => [campus.id, campus.name]));
}

function escapeSupabaseLikeQuery(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`).replace(/,/g, "\\,");
}

function applyGuestDashboardFilters(
  rows: GuestSermonRow[],
  filters: DashboardPresentationFilters
): DashboardPresentation[] {
  const normalizedSearch = filters.search?.trim().toLowerCase() || "";
  const presentationMonth = filters.presentationMonth || null;
  const sort = filters.sort || DEFAULT_PRESENTATION_SORT;

  const filtered = rows
    .map((row) => ({ row, presentation: mapRowToDashboardPresentation(row) }))
    .filter(({ presentation }) => {
      const matchesSearch =
        !normalizedSearch ||
        presentation.title.toLowerCase().includes(normalizedSearch) ||
        (presentation.series || "").toLowerCase().includes(normalizedSearch);
      const matchesMonth =
        !presentationMonth || presentation.presentationDate.startsWith(presentationMonth);
      return matchesSearch && matchesMonth;
    });

  filtered.sort((a, b) => {
    const presentationDateDiff =
      new Date(a.presentation.presentationDate).getTime() - new Date(b.presentation.presentationDate).getTime();
    if (presentationDateDiff !== 0) {
      return sort === "oldest" ? presentationDateDiff : -presentationDateDiff;
    }
    const lastModifiedDiff = new Date(a.row.updated_at).getTime() - new Date(b.row.updated_at).getTime();
    return sort === "oldest" ? lastModifiedDiff : -lastModifiedDiff;
  });

  return filtered.map(({ presentation }) => presentation);
}

function saveGuestPresentation(presentation: SermonPresentation): string {
  const store = readGuestSermons();
  const existing = store[presentation.id];
  const existingEditorSlides = existing ? extractEditorSlides(existing.slides) : null;
  const wrapper: SlidesWrapper = {
    formData: presentation.data,
    ...(existingEditorSlides ? { editorSlides: existingEditorSlides } : {}),
  };
  const now = new Date().toISOString();

  store[presentation.id] = {
    id: presentation.id,
    title: presentation.title,
    scripture_reference: presentation.scripture_reference || null,
    slides: wrapper as any,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  writeGuestSermons(store);
  return presentation.id;
}

interface PresentationAccessContext {
  userId: string | null;
  accountId: string | null;
  isAuthenticated: boolean;
}

async function getPresentationAccessContext(): Promise<PresentationAccessContext> {
  const access = await ensureResolvedAccountAccess();
  return {
    userId: access.userId,
    accountId: access.accountId,
    isAuthenticated: Boolean(access.userId && access.accountId),
  };
}

async function requireAccountScopedAccess(): Promise<{ userId: string; accountId: string }> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated || !access.userId || !access.accountId) {
    throw new Error("Missing authenticated account access");
  }
  return { userId: access.userId, accountId: access.accountId };
}

export async function getDashboardPresentationsPage(
  options: { limit: number; offset: number } & DashboardPresentationFilters
): Promise<DashboardPresentationsPage> {
  const {
    limit,
    offset,
    search = "",
    presentationMonth = null,
    sort = DEFAULT_PRESENTATION_SORT,
    campusFilter = null,
  } = options;
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated || !access.accountId) {
    const guestPresentations = applyGuestDashboardFilters(Object.values(readGuestSermons()), {
      search,
      presentationMonth,
      sort,
    });
    return {
      items: guestPresentations.slice(offset, offset + limit),
      hasMore: offset + limit < guestPresentations.length,
    };
  }

  let query = supabase
    .from('sermons')
    .select('id, title, series, presentation_date, campus_id, former_campus_name, slides, created_at, updated_at')
    .eq('account_id', access.accountId)
    .order('presentation_date', { ascending: sort === "oldest" })
    .order('updated_at', { ascending: sort === "oldest" })
    .range(offset, offset + limit);

  if (search.trim()) {
    const escapedSearch = escapeSupabaseLikeQuery(search.trim());
    query = query.or(`title.ilike.%${escapedSearch}%,series.ilike.%${escapedSearch}%`);
  }

  if (presentationMonth) {
    const [year, month] = presentationMonth.split("-");
    if (year && month) {
      const monthStart = `${year}-${month}-01`;
      const monthEnd = new Date(Number(year), Number(month), 0).toISOString().split("T")[0];
      query = query.gte("presentation_date", monthStart).lte("presentation_date", monthEnd);
    }
  }

  if (campusFilter?.type === "active" && campusFilter.value) {
    query = query.eq("campus_id", campusFilter.value);
  }

  if (campusFilter?.type === "former" && campusFilter.value) {
    query = query.eq("former_campus_name", campusFilter.value);
  }

  const { data, error } = await query;

  if (error || !data) return { items: [], hasMore: false };

  const campusNamesById = await loadCampusNamesById(
    access.accountId,
    Array.from(new Set(data.map((row) => row.campus_id).filter((id): id is string => Boolean(id))))
  );

  const hasMore = data.length > limit;
  const items = data
    .slice(0, limit)
    .map((row) =>
      mapRowToDashboardPresentation({
        ...row,
        campus_name: row.campus_id ? campusNamesById.get(row.campus_id) || null : null,
      })
    );

  return { items, hasMore };
}

export async function getDashboardTimeSavedSummary(monthKey: string): Promise<DashboardTimeSavedSummary> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated || !access.accountId) {
    return { totalSeconds: 0, weekSeconds: 0 };
  }

  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    return { totalSeconds: 0, weekSeconds: 0 };
  }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const shouldCalculateWeek = monthKey === currentMonthKey;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - now.getDay());
  const weekStart = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, "0")}-${String(weekStartDate.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("sermons")
    .select("slides, presentation_date")
    .eq("account_id", access.accountId)
    .gte("presentation_date", monthStart)
    .lte("presentation_date", monthEnd);

  if (error || !data) {
    return { totalSeconds: 0, weekSeconds: 0 };
  }

  return data.reduce<DashboardTimeSavedSummary>(
    (summary, row) => {
      const editorSlides = extractEditorSlides(row.slides);
      if (!editorSlides || editorSlides.length === 0) return summary;

      const metrics = calculateValueMetrics({
        slideCount: editorSlides.length,
        slides: editorSlides,
        formData: extractFormData(row.slides),
      });

      summary.totalSeconds += metrics.estimatedTimeSavedSeconds;
      if (shouldCalculateWeek && row.presentation_date && row.presentation_date >= weekStart) {
        summary.weekSeconds += metrics.estimatedTimeSavedSeconds;
      }
      return summary;
    },
    { totalSeconds: 0, weekSeconds: 0 },
  );
}

export async function savePresentation(presentation: SermonPresentation): Promise<string | null> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated || !access.userId || !access.accountId) return saveGuestPresentation(presentation);
  const resolvedCampusId = await resolvePresentationCampusId(access.accountId, presentation.campusId);

  // Check if presentation already exists
  const { data: existing } = await supabase
    .from('sermons')
    .select('id, slides, campus_id, former_campus_name')
    .eq('id', presentation.id)
    .maybeSingle();

  // Build wrapper preserving existing editor slides
  const existingEditorSlides = existing ? extractEditorSlides(existing.slides) : null;
  const wrapper: SlidesWrapper = {
    formData: presentation.data,
    ...(existingEditorSlides ? { editorSlides: existingEditorSlides } : {}),
  };

  if (existing) {
    const { error } = await supabase
      .from('sermons')
      .update({
        title: presentation.title,
        series: presentation.series || null,
        presentation_date: presentation.presentationDate || presentation.date || null,
        campus_id: resolvedCampusId,
        former_campus_name:
          existing?.campus_id && resolvedCampusId && existing.campus_id !== resolvedCampusId
            ? null
            : existing?.former_campus_name || null,
        slides: wrapper as any,
        scripture_reference: presentation.scripture_reference || null,
      })
      .eq('id', presentation.id);
    
    if (error) {
      console.error('Failed to update sermon:', error);
      return null;
    }
    return presentation.id;
  } else {
    const { data, error } = await supabase
      .from('sermons')
      .insert({
        title: presentation.title,
        series: presentation.series || null,
        account_id: access.accountId,
        created_by_user_id: access.userId,
        presentation_date: presentation.presentationDate || presentation.date || null,
        campus_id: resolvedCampusId,
        former_campus_name: presentation.formerCampusName || null,
        slides: wrapper as any,
        scripture_reference: presentation.scripture_reference || null,
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Failed to save sermon:', error);
      return null;
    }
    return data.id;
  }
}

export async function savePresentationWithSlides(
  presentation: SermonPresentation,
  editorSlides: any[]
): Promise<string | null> {
  const wrapper: SlidesWrapper = {
    formData: presentation.data,
    editorSlides,
  };

  const access = await getPresentationAccessContext();

  if (!access.isAuthenticated) {
    const store = readGuestSermons();
    const existing = store[presentation.id];
    const now = new Date().toISOString();

    store[presentation.id] = {
      id: presentation.id,
      title: presentation.title,
      scripture_reference: presentation.scripture_reference || null,
      slides: wrapper as any,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    writeGuestSermons(store);
    return presentation.id;
  }

  const { data: existing } = await supabase
    .from("sermons")
    .select("id, campus_id, former_campus_name")
    .eq("id", presentation.id)
    .maybeSingle();

  const resolvedCampusId = await resolvePresentationCampusId(access.accountId!, presentation.campusId);

  if (existing) {
    const { error } = await supabase
      .from("sermons")
      .update({
        title: presentation.title,
        series: presentation.series || null,
        presentation_date: presentation.presentationDate || presentation.date || null,
        campus_id: resolvedCampusId,
        former_campus_name:
          existing.campus_id && resolvedCampusId && existing.campus_id !== resolvedCampusId
            ? null
            : existing.former_campus_name || null,
        slides: wrapper as any,
        scripture_reference: presentation.scripture_reference || null,
      })
      .eq("id", presentation.id);

    if (error) {
      console.error("Failed to update sermon with slides:", error);
      return null;
    }
    return presentation.id;
  }

  const { data, error } = await supabase
    .from("sermons")
    .insert({
      title: presentation.title,
      series: presentation.series || null,
      account_id: access.accountId,
      created_by_user_id: access.userId,
      presentation_date: presentation.presentationDate || presentation.date || null,
      campus_id: resolvedCampusId,
      former_campus_name: presentation.formerCampusName || null,
      slides: wrapper as any,
      scripture_reference: presentation.scripture_reference || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save sermon with slides:", error);
    return null;
  }
  return data.id;
}

export async function duplicateMostRecentPresentationAsStartingPoint(): Promise<string | null> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated || !access.accountId) return null;

  const { data, error } = await supabase
    .from("sermons")
    .select("id, title, series, campus_id, former_campus_name, presentation_date, scripture_reference, slides, created_at, updated_at")
    .eq("account_id", access.accountId)
    .order("presentation_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error || !data) return null;

  const source = data.find((row) => countSlides(row.slides) > 0 && extractFormData(row.slides));
  const formData = source ? extractFormData(source.slides) : undefined;
  if (!source || !formData) return null;

  const today = getLocalDateKey();
  const newId = crypto.randomUUID();
  const nextFormData: SermonPresentation["data"] = {
    ...formData,
    date: today,
  };

  const presentation: SermonPresentation = {
    id: newId,
    title: source.title || formData.title || "Untitled Presentation",
    series: source.series || formData.series || null,
    campusId: source.campus_id || null,
    formerCampusName: source.former_campus_name || null,
    presentationDate: today,
    date: today,
    slides: 0,
    lastModified: "Just now",
    scripture_reference: source.scripture_reference || undefined,
    data: nextFormData,
  };

  const generatedSlides = generateSlidesFromPresentation(presentation);
  return savePresentationWithSlides(
    {
      ...presentation,
      slides: generatedSlides.length,
    },
    generatedSlides,
  );
}

export async function deletePresentation(id: string): Promise<void> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated) {
    const store = readGuestSermons();
    delete store[id];
    writeGuestSermons(store);
    return;
  }

  const { data: existing } = await supabase
    .from('sermons')
    .select('slides')
    .eq('id', id)
    .maybeSingle();

  const backgroundRefs = collectStorageBackgrounds(existing ? extractEditorSlides(existing.slides) : null);

  const { error } = await supabase
    .from('sermons')
    .delete()
    .eq('id', id);
  
  if (error) console.error('Failed to delete sermon:', error);
  if (!error) {
    backgroundRefs.forEach((image) => {
      void deleteStoredBackground(image);
    });
  }
}

export async function getPresentation(id: string): Promise<SermonPresentation | undefined> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated) {
    const guestRow = readGuestSermons()[id];
    return guestRow ? mapRowToPresentation(guestRow) : undefined;
  }

  const { data, error } = await supabase
    .from('sermons')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    const guestRow = readGuestSermons()[id];
    return guestRow ? mapRowToPresentation(guestRow) : undefined;
  }

  return {
    id: data.id,
    title: data.title,
    series: data.series || extractSeries(data.slides),
    presentationDate: resolvePresentationDate(data.slides, data.created_at, data.presentation_date),
    campusId: data.campus_id || null,
    formerCampusName: data.former_campus_name || null,
    date: resolvePresentationDate(data.slides, data.created_at, data.presentation_date),
    slides: countSlides(data.slides),
    lastModified: new Date(data.updated_at).toLocaleDateString(),
    scripture_reference: data.scripture_reference || undefined,
    data: extractFormData(data.slides),
  };
}

export async function getEditorPresentationState(id: string): Promise<EditorPresentationState | undefined> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated) {
    const guestRow = readGuestSermons()[id];
    if (!guestRow) return undefined;

    return {
      id: guestRow.id,
      title: guestRow.title,
      series: extractSeries(guestRow.slides),
      campusId: null,
      campusName: null,
      formerCampusName: null,
      formData: extractFormData(guestRow.slides),
      editorSlides: extractEditorSlides(guestRow.slides),
      createdAt: guestRow.created_at,
      updatedAt: guestRow.updated_at,
      presentationDate: resolvePresentationDate(guestRow.slides, guestRow.created_at),
      scriptureReference: guestRow.scripture_reference || undefined,
    };
  }

  const { data, error } = await supabase
    .from("sermons")
    .select("id, account_id, title, series, campus_id, former_campus_name, presentation_date, scripture_reference, slides, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    const guestRow = readGuestSermons()[id];
    if (!guestRow) return undefined;

    return {
      id: guestRow.id,
      title: guestRow.title,
      series: extractSeries(guestRow.slides),
      campusId: null,
      campusName: null,
      formerCampusName: null,
      formData: extractFormData(guestRow.slides),
      editorSlides: extractEditorSlides(guestRow.slides),
      createdAt: guestRow.created_at,
      updatedAt: guestRow.updated_at,
      presentationDate: resolvePresentationDate(guestRow.slides, guestRow.created_at),
      scriptureReference: guestRow.scripture_reference || undefined,
    };
  }

  const campusNamesById = await loadCampusNamesById(
    data.account_id || "",
    data.campus_id ? [data.campus_id] : []
  );

  return {
    id: data.id,
    title: data.title,
    series: data.series || extractSeries(data.slides),
    campusId: data.campus_id || null,
    campusName: data.campus_id ? campusNamesById.get(data.campus_id) || null : null,
    formerCampusName: data.former_campus_name || null,
    formData: extractFormData(data.slides),
    editorSlides: extractEditorSlides(data.slides),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    presentationDate: resolvePresentationDate(data.slides, data.created_at, data.presentation_date),
    scriptureReference: data.scripture_reference || undefined,
  };
}

// Save editor slides (the visual slide array) to the sermons table, preserving form data
export async function saveEditorSlides(sermonId: string, slides: any[]): Promise<void> {
  const nextSerializedSlides = serializeEditorSlides(slides);
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated) {
    const store = readGuestSermons();
    const existing = store[sermonId];
    if (!existing) return;
    const existingEditorSlides = extractEditorSlides(existing.slides);
    if (serializeEditorSlides(existingEditorSlides) === nextSerializedSlides) {
      return;
    }
    const existingFormData = extractFormData(existing.slides);
    store[sermonId] = {
      ...existing,
      slides: {
        ...(existingFormData ? { formData: existingFormData } : {}),
        editorSlides: slides,
      } as any,
      updated_at: new Date().toISOString(),
    };
    writeGuestSermons(store);
    return;
  }

  await requireAccountScopedAccess();

  // First read existing to preserve formData
  const { data: existing } = await supabase
    .from('sermons')
    .select('slides')
    .eq('id', sermonId)
    .maybeSingle();

  const existingEditorSlides = existing ? extractEditorSlides(existing.slides) : null;
  if (serializeEditorSlides(existingEditorSlides) === nextSerializedSlides) {
    return;
  }

  const existingFormData = existing ? extractFormData(existing.slides) : undefined;

  const wrapper: SlidesWrapper = {
    ...(existingFormData ? { formData: existingFormData } : {}),
    editorSlides: slides,
  };

  const { error } = await supabase
    .from('sermons')
    .update({ slides: wrapper as any })
    .eq('id', sermonId);

  if (error) console.error('Failed to save editor slides:', error);
}

// Get editor slides from the sermons table
export async function getEditorSlides(sermonId: string): Promise<any[] | null> {
  const access = await getPresentationAccessContext();
  if (!access.isAuthenticated) {
    const existing = readGuestSermons()[sermonId];
    if (!existing) return null;
    return extractEditorSlides(existing.slides);
  }

  const { data, error } = await supabase
    .from('sermons')
    .select('slides')
    .eq('id', sermonId)
    .maybeSingle();

  if (error || !data) {
    const existing = readGuestSermons()[sermonId];
    if (!existing) return null;
    return extractEditorSlides(existing.slides);
  }
  return extractEditorSlides(data.slides);
}
