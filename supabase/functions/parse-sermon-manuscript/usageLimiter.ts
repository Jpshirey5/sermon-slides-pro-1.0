// QUICK BUILD ADDITION — monthly upload limit per tier, shared across the account.

const TIER_LIMITS: Record<string, number> = {
  free: 0,
  core: 25,
  team: 150,
};

// Floor for the handful of pre-restructure accounts tagged
// accounts.is_legacy_grandfathered in the Step 1 migration: these accounts
// get whichever is higher, their legacy limit (keyed by
// accounts.legacy_uncapped_tier -- their ORIGINAL pre-rename tier: pro/team/
// enterprise) or TIER_LIMITS for their current (renamed) plan_tier. They
// never end up capped lower than their original limit.
const LEGACY_TIER_LIMITS: Record<string, number> = {
  pro: 5,
  team: 15,
  enterprise: Number.POSITIVE_INFINITY,
};

export interface LimitResult {
  allowed: boolean;
  tier: string;
  used: number;
  limit: number;
}

export interface GrandfatherInfo {
  isLegacyGrandfathered?: boolean;
  legacyUncappedTier?: string | null;
}

export async function checkMonthlyLimit(
  supabaseAdmin: any,
  accountId: string,
  tier: string,
  grandfather?: GrandfatherInfo,
): Promise<LimitResult> {
  const normalizedTier = (tier || "").toLowerCase();
  const newTierLimit = TIER_LIMITS[normalizedTier] ?? 0;
  // Grandfathered accounts get whichever is higher: their original legacy
  // limit or the new tier's current limit. This is a floor, not a fixed
  // override -- it prevents a grandfathered account from ending up worse off
  // than a brand-new signup on the same new tier (e.g. old Team's legacy
  // limit of 15 is lower than new Core's 25, so that account should get 25).
  // Infinity (old Enterprise) always wins outright via Math.max.
  const limit = grandfather?.isLegacyGrandfathered
    ? Math.max(LEGACY_TIER_LIMITS[(grandfather.legacyUncappedTier || "").toLowerCase()] ?? newTierLimit, newTierLimit)
    : newTierLimit;

  if (!Number.isFinite(limit)) {
    return { allowed: true, tier: normalizedTier, used: 0, limit };
  }

  if (limit <= 0) {
    // Free tier (and any unrecognized tier) has no allowance at all --
    // no need to query usage, this account is always blocked.
    return { allowed: false, tier: normalizedTier, used: 0, limit: 0 };
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("quick_build_usage")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "success")
    .gte("uploaded_at", monthStart.toISOString());

  if (error) {
    throw new Error(`Could not check usage limit: ${error.message}`);
  }

  const used = count || 0;
  return { allowed: used < limit, tier: normalizedTier, used, limit };
}
