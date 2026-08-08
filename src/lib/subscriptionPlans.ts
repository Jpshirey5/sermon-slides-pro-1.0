export type PlanTier = "free" | "core" | "team";
type PaidPlanTier = Exclude<PlanTier, "free">;
export type BillingInterval = "monthly" | "annual";
export type SubscriptionPlanId =
  | "core_monthly"
  | "core_annual"
  | "team_monthly"
  | "team_annual";

export interface SubscriptionPlanConfig {
  id: SubscriptionPlanId;
  tier: PaidPlanTier;
  planName: "Core" | "Team";
  interval: BillingInterval;
  label: string;
  badgeLabel: string;
  priceId: string;
  displayPrice: string;
  intervalLabel: string;
  audience: string;
  description: string;
  savingsCopy?: string;
  maxAdditionalUsers: number | null;
  enforceInviteCapacity: boolean;
}

export interface PlanFamilyConfig {
  tier: PaidPlanTier;
  planName: "Core" | "Team";
  audience: string;
  description: string;
  inviteCapacityLabel: string;
  monthly: SubscriptionPlanConfig;
  annual: SubscriptionPlanConfig;
}

const getPublicPriceId = (envKey: keyof ImportMetaEnv, fallback = "") =>
  (import.meta.env[envKey] || fallback || "").trim();

const PLAN_CAPACITY: Record<PaidPlanTier, number | null> = {
  core: 2, // matches old "team" tier's capacity (3 total users)
  team: 9, // matches old "enterprise" tier's capacity (10 total users)
};

const PLAN_DETAILS: Record<PaidPlanTier, { planName: "Core" | "Team"; audience: string; description: string }> = {
  core: {
    planName: "Core",
    audience: "For Small Church Teams",
    description: "Shared workflow for up to 3 total users",
  },
  team: {
    planName: "Team",
    audience: "For Growing Churches and Larger Teams",
    description: "Built for up to 10 total users",
  },
};

const createPlan = (
  tier: PaidPlanTier,
  interval: BillingInterval,
  displayPrice: string,
  priceId: string
): SubscriptionPlanConfig => {
  const detail = PLAN_DETAILS[tier];
  const intervalLabel = interval === "monthly" ? "/month" : "/year";
  const intervalTitle = interval === "monthly" ? "Monthly" : "Annual";
  const maxAdditionalUsers = PLAN_CAPACITY[tier];

  return {
    id: `${tier}_${interval}` as SubscriptionPlanId,
    tier,
    planName: detail.planName,
    interval,
    label: `${detail.planName} ${intervalTitle}`,
    badgeLabel: `${detail.planName} ${intervalTitle}`,
    priceId,
    displayPrice,
    intervalLabel,
    audience: detail.audience,
    description: detail.description,
    savingsCopy: interval === "annual" ? "Save two months with annual billing" : undefined,
    maxAdditionalUsers,
    enforceInviteCapacity: maxAdditionalUsers !== null,
  };
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanConfig> = {
  core_monthly: createPlan(
    "core",
    "monthly",
    "$19",
    getPublicPriceId("VITE_STRIPE_PRICE_CORE_MONTHLY", "")
  ),
  core_annual: createPlan(
    "core",
    "annual",
    "$190",
    getPublicPriceId("VITE_STRIPE_PRICE_CORE_ANNUAL", "")
  ),
  team_monthly: createPlan(
    "team",
    "monthly",
    "$49",
    getPublicPriceId("VITE_STRIPE_PRICE_TEAM_MONTHLY", "")
  ),
  team_annual: createPlan(
    "team",
    "annual",
    "$490",
    getPublicPriceId("VITE_STRIPE_PRICE_TEAM_ANNUAL", "")
  ),
};

export const SUBSCRIPTION_PLAN_LIST = Object.values(SUBSCRIPTION_PLANS);

const PLAN_BY_ANY_PRICE_ID = new Map<string, SubscriptionPlanConfig>();

for (const plan of SUBSCRIPTION_PLAN_LIST) {
  if (plan.priceId) {
    PLAN_BY_ANY_PRICE_ID.set(plan.priceId, plan);
  }
}

export const PLAN_FAMILIES: PlanFamilyConfig[] = [
  {
    tier: "core",
    planName: "Core",
    audience: PLAN_DETAILS.core.audience,
    description: PLAN_DETAILS.core.description,
    inviteCapacityLabel: PLAN_DETAILS.core.description,
    monthly: SUBSCRIPTION_PLANS.core_monthly,
    annual: SUBSCRIPTION_PLANS.core_annual,
  },
  {
    tier: "team",
    planName: "Team",
    audience: PLAN_DETAILS.team.audience,
    description: PLAN_DETAILS.team.description,
    inviteCapacityLabel: PLAN_DETAILS.team.description,
    monthly: SUBSCRIPTION_PLANS.team_monthly,
    annual: SUBSCRIPTION_PLANS.team_annual,
  },
];

export const getPlanByPriceId = (priceId?: string | null): SubscriptionPlanConfig | null => {
  if (!priceId) return null;
  return PLAN_BY_ANY_PRICE_ID.get(priceId) || null;
};

export const getPlanById = (planId?: string | null): SubscriptionPlanConfig | null => {
  if (!planId) return null;
  return SUBSCRIPTION_PLANS[planId as SubscriptionPlanId] || null;
};

export const getPlanByTierAndInterval = (
  tier: PaidPlanTier,
  interval: BillingInterval
): SubscriptionPlanConfig => SUBSCRIPTION_PLANS[`${tier}_${interval}` as SubscriptionPlanId];

export const getPlanFamily = (tier: PaidPlanTier) =>
  PLAN_FAMILIES.find((family) => family.tier === tier) || null;

export const getPlanCapacityByTier = (tier?: string | null) => {
  if (!tier || !(tier in PLAN_CAPACITY)) {
    // Covers "free" and any unrecognized tier: no invite capacity.
    return {
      maxAdditionalUsers: 0,
      enforceInviteCapacity: true,
      isUnlimited: false,
    };
  }

  const maxAdditionalUsers = PLAN_CAPACITY[tier as PaidPlanTier];
  return {
    maxAdditionalUsers: maxAdditionalUsers ?? null,
    enforceInviteCapacity: maxAdditionalUsers !== null,
    isUnlimited: maxAdditionalUsers === null,
  };
};

export const getPlanCapacityByPriceId = (priceId?: string | null) => {
  const plan = getPlanByPriceId(priceId);
  return getPlanCapacityByTier(plan?.tier || "free");
};
