// QUICK BUILD ADDITION — monthly per-user upload limit per tier.

const TIER_LIMITS: Record<string, number> = {
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

export async function checkMonthlyLimit(
  supabaseAdmin: any,
  userId: string,
  tier: string,
): Promise<LimitResult> {
  const normalizedTier = (tier || "").toLowerCase();
  const limit = TIER_LIMITS[normalizedTier] ?? 0;
  if (!Number.isFinite(limit)) {
    return { allowed: true, tier: normalizedTier, used: 0, limit };
  }
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("quick_build_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "success")
    .gte("uploaded_at", monthStart.toISOString());

  if (error) {
    throw new Error(`Could not check usage limit: ${error.message}`);
  }

  const used = count || 0;
  return { allowed: used < limit, tier: normalizedTier, used, limit };
}
