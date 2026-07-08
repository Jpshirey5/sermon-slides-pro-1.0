// Shared usage + signup/churn aggregation (Supabase-only). Used by admin-api
// (overview_usage) and the monthly-report cron so dashboard and emailed numbers match.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { STRIPE_REPORTING_EXCLUDED_EMAILS } from "./revenue.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export type QuickBuildAccuracyRow = {
  promptVersion: string;
  uploads: { success: number; partial: number; failed: number };
  parses: number;
  finalized: number;
  avgPointsAdded: number;
  avgPointsRemoved: number;
  avgVerseMoves: number;
};

export type UsageMetrics = {
  totalPresentations: number;
  presentationsInWindow: number;
  buildModeSplit: { quickBuild: number; structuredBuilder: number; unknown: number };
  activeOrgs: number;
  exports: { started: number; succeeded: number };
  quickBuildUploads: { success: number; partial: number; failed: number };
  quickBuildAccuracy: QuickBuildAccuracyRow[];
  dailyPresentations: { date: string; presentations: number }[];
  notes: { exports: string };
};

export type SignupChurnMetrics = {
  newUsers: number;
  newOrgs: number;
  orgDeletions: number;
  totalUsers: number;
  totalAccounts: number;
  activeSubscribers: number;
};

/**
 * Resolves the account IDs owned by internal/test emails so usage metrics can exclude
 * them, mirroring the revenue exclusion logic. Returns an empty set on any lookup issue.
 */
export const getInternalAccountIds = async (supabaseAdmin: SupabaseAdmin): Promise<Set<string>> => {
  const accountIds = new Set<string>();
  const { data: owners } = await supabaseAdmin
    .from("account_members")
    .select("account_id, user_id, role")
    .eq("role", "owner");

  const ownerUserIds = Array.from(new Set((owners || []).map((o: any) => o.user_id).filter(Boolean)));
  if (ownerUserIds.length === 0) return accountIds;

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email").in("id", ownerUserIds);
  const internalUserIds = new Set(
    (profiles || [])
      .filter((p: any) => STRIPE_REPORTING_EXCLUDED_EMAILS.has(normalizeEmail(p.email)))
      .map((p: any) => p.id),
  );

  for (const owner of owners || []) {
    if (internalUserIds.has(owner.user_id) && owner.account_id) accountIds.add(owner.account_id);
  }
  return accountIds;
};

const inList = (ids: string[]) => `(${ids.map((id) => `"${id}"`).join(",")})`;

export const computeUsageMetrics = async (options: {
  supabaseAdmin: SupabaseAdmin;
  startIso: string;
  endIso: string;
  excludedAccountIds?: Set<string>;
}): Promise<UsageMetrics> => {
  const { supabaseAdmin, startIso, endIso } = options;
  const excluded = Array.from(options.excludedAccountIds ?? new Set<string>());

  const applyExcluded = <T>(query: T): T => {
    if (excluded.length === 0) return query;
    return (query as any).not("account_id", "in", inList(excluded)) as T;
  };

  // Total presentations (all time) and presentations created within the window.
  const totalQuery = applyExcluded(
    supabaseAdmin.from("sermons").select("id", { count: "exact", head: true }),
  );
  const windowQuery = applyExcluded(
    supabaseAdmin
      .from("sermons")
      .select("account_id, created_at, creation_mode")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  );
  const exportsQuery = applyExcluded(
    supabaseAdmin
      .from("telemetry_events")
      .select("name")
      .in("name", ["export_started", "export_succeeded"])
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  );
  const quickBuildQuery = applyExcluded(
    supabaseAdmin
      .from("quick_build_usage")
      .select("status, prompt_version")
      .gte("uploaded_at", startIso)
      .lte("uploaded_at", endIso),
  );
  // Learning-loop parse rows: how much users corrected each parse, by prompt version.
  const parsesQuery = applyExcluded(
    supabaseAdmin
      .from("quick_build_parses")
      .select("prompt_version, structure_diff, finalized_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  );

  const [
    { count: totalPresentations },
    { data: windowRows },
    { data: exportRows },
    { data: quickBuildRows },
    { data: parseRows },
  ] = await Promise.all([totalQuery, windowQuery, exportsQuery, quickBuildQuery, parsesQuery]);

  const buildModeSplit = { quickBuild: 0, structuredBuilder: 0, unknown: 0 };
  const activeOrgIds = new Set<string>();
  const dailyMap = new Map<string, number>();

  for (const row of windowRows || []) {
    if (row.account_id) activeOrgIds.add(row.account_id);
    const day = dateKey(new Date(row.created_at));
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    if (row.creation_mode === "quick_build") buildModeSplit.quickBuild += 1;
    else if (row.creation_mode === "structured_builder") buildModeSplit.structuredBuilder += 1;
    else buildModeSplit.unknown += 1;
  }

  const exports = { started: 0, succeeded: 0 };
  for (const row of exportRows || []) {
    if (row.name === "export_started") exports.started += 1;
    else if (row.name === "export_succeeded") exports.succeeded += 1;
  }

  const quickBuildUploads = { success: 0, partial: 0, failed: 0 };
  const versionKey = (value: unknown) => clean(value) || "v1 (pre-tracking)";
  const accuracyByVersion = new Map<
    string,
    {
      uploads: { success: number; partial: number; failed: number };
      parses: number;
      finalized: number;
      pointsAdded: number;
      pointsRemoved: number;
      verseMoves: number;
    }
  >();
  const accuracyRow = (version: string) => {
    let row = accuracyByVersion.get(version);
    if (!row) {
      row = {
        uploads: { success: 0, partial: 0, failed: 0 },
        parses: 0,
        finalized: 0,
        pointsAdded: 0,
        pointsRemoved: 0,
        verseMoves: 0,
      };
      accuracyByVersion.set(version, row);
    }
    return row;
  };

  for (const row of (quickBuildRows || []) as any[]) {
    const uploads = accuracyRow(versionKey(row.prompt_version)).uploads;
    if (row.status === "success") {
      quickBuildUploads.success += 1;
      uploads.success += 1;
    } else if (row.status === "partial") {
      quickBuildUploads.partial += 1;
      uploads.partial += 1;
    } else if (row.status === "failed") {
      quickBuildUploads.failed += 1;
      uploads.failed += 1;
    }
  }

  for (const row of (parseRows || []) as any[]) {
    const acc = accuracyRow(versionKey(row.prompt_version));
    acc.parses += 1;
    if (!row.finalized_at) continue;
    acc.finalized += 1;
    const diff = (row.structure_diff || {}) as {
      points_added?: unknown[];
      points_removed?: unknown[];
      verses_moved?: unknown[];
    };
    acc.pointsAdded += Array.isArray(diff.points_added) ? diff.points_added.length : 0;
    acc.pointsRemoved += Array.isArray(diff.points_removed) ? diff.points_removed.length : 0;
    acc.verseMoves += Array.isArray(diff.verses_moved) ? diff.verses_moved.length : 0;
  }

  const round2 = (value: number) => Math.round(value * 100) / 100;
  const quickBuildAccuracy: QuickBuildAccuracyRow[] = Array.from(accuracyByVersion.entries())
    .map(([promptVersion, acc]) => ({
      promptVersion,
      uploads: acc.uploads,
      parses: acc.parses,
      finalized: acc.finalized,
      avgPointsAdded: acc.finalized ? round2(acc.pointsAdded / acc.finalized) : 0,
      avgPointsRemoved: acc.finalized ? round2(acc.pointsRemoved / acc.finalized) : 0,
      avgVerseMoves: acc.finalized ? round2(acc.verseMoves / acc.finalized) : 0,
    }))
    .sort((a, b) => a.promptVersion.localeCompare(b.promptVersion));

  const dailyPresentations = Array.from(dailyMap.entries())
    .map(([date, presentations]) => ({ date, presentations }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalPresentations: totalPresentations ?? 0,
    presentationsInWindow: (windowRows || []).length,
    buildModeSplit,
    activeOrgs: activeOrgIds.size,
    exports,
    quickBuildUploads,
    quickBuildAccuracy,
    dailyPresentations,
    notes: {
      exports:
        "Export counts come from telemetry_events, which has a 30-day retention; windows older than 30 days may undercount.",
    },
  };
};

export const computeSignupChurnMetrics = async (options: {
  supabaseAdmin: SupabaseAdmin;
  startIso: string;
  endIso: string;
}): Promise<SignupChurnMetrics> => {
  const { supabaseAdmin, startIso, endIso } = options;

  const [
    { count: newUsers },
    { count: newOrgs },
    { count: totalUsers },
    { count: totalAccounts },
    { count: activeSubscribers },
    { data: deletionRequests },
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabaseAdmin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .in("subscription_status", ["active", "trialing"])
      .neq("name", "Bell Shoals Church"),
    supabaseAdmin
      .from("account_deletion_requests" as any)
      .select("requested_at, completed_at")
      .or(`requested_at.gte.${startIso},completed_at.gte.${startIso}`),
  ]);

  const start = new Date(startIso);
  const end = new Date(endIso);
  let orgDeletions = 0;
  for (const row of deletionRequests || []) {
    const timestamp = row.completed_at || row.requested_at;
    if (!timestamp) continue;
    const date = new Date(timestamp);
    if (date < start || date > end) continue;
    orgDeletions += 1;
  }

  return {
    newUsers: newUsers ?? 0,
    newOrgs: newOrgs ?? 0,
    orgDeletions,
    totalUsers: totalUsers ?? 0,
    totalAccounts: totalAccounts ?? 0,
    activeSubscribers: activeSubscribers ?? 0,
  };
};
