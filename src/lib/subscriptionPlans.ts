export type PlanTier = "pro" | "team" | "enterprise";
export type BillingInterval = "monthly" | "annual";
export type SubscriptionPlanId =
  | "pro_monthly"
  | "pro_annual"
  | "team_monthly"
  | "team_annual"
  | "enterprise_monthly"
  | "enterprise_annual";

export interface SubscriptionPlanConfig {
  id: SubscriptionPlanId;
  tier: PlanTier;
  planName: "Pro" | "Team" | "Enterprise";
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
  tier: PlanTier;
  planName: "Pro" | "Team" | "Enterprise";
  audience: string;
  description: string;
  inviteCapacityLabel: string;
  monthly: SubscriptionPlanConfig;
  annual: SubscriptionPlanConfig;
}

const LEGACY_PRICE_ID_ALIASES: Partial<Record<SubscriptionPlanId, string[]>> = {
  pro_monthly: ["price_1TEfgIP2Yr0z0IcsX2VXk6wJ"],
  pro_annual: ["price_1TEfi2P2Yr0z0Icsnod1blF1"],
  team_monthly: ["price_1TJJjFP2Yr0z0IcsZRFgIQlX", "price_1TEfggP2Yr0z0IcsHHgS6kye"],
  team_annual: ["price_1TJJjWP2Yr0z0IcsAV9Y4SV5", "price_1TEfjmP2Yr0z0IcsXW3ZujSG"],
  enterprise_monthly: ["price_1TJJlcP2Yr0z0IcsUb9IHJuS", "price_1TEfhaP2Yr0z0IcsGlDJJyu7"],
  enterprise_annual: ["price_1TJQdEP2Yr0z0IcsjUAm4Xq6", "price_1TEfkDP2Yr0z0IcsUhXwzh9z", "price_1TJJlpP2Yr0z0IcsDJBpCJHa"],
};

const getPublicPriceId = (envKey: keyof ImportMetaEnv, fallback = "") =>
  (import.meta.env[envKey] || fallback || "").trim();

const PLAN_CAPACITY: Record<PlanTier, number | null> = {
  pro: 0,
  team: 2,
  enterprise: 9,
};

const PLAN_DETAILS: Record<PlanTier, { planName: "Pro" | "Team" | "Enterprise"; audience: string; description: string }> = {
  pro: {
    planName: "Pro",
    audience: "For Solo Pastors and Ministry Leaders",
    description: "Built for a single weekly sermon workflow",
  },
  team: {
    planName: "Team",
    audience: "For Small Church Teams",
    description: "Shared workflow for up to 3 total users",
  },
  enterprise: {
    planName: "Enterprise",
    audience: "For Growing Churches and Larger Teams",
    description: "Built for up to 10 total users",
  },
};

const createPlan = (
  tier: PlanTier,
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
  pro_monthly: createPlan(
    "pro",
    "monthly",
    "$49",
    getPublicPriceId("VITE_STRIPE_PRICE_PRO_MONTHLY", "price_1TVyQnP2Yr0z0IcsKcAHhYX8")
  ),
  pro_annual: createPlan(
    "pro",
    "annual",
    "$490",
    getPublicPriceId("VITE_STRIPE_PRICE_PRO_ANNUAL", "price_1TVyQqP2Yr0z0IcsKQ6KN3xA")
  ),
  team_monthly: createPlan(
    "team",
    "monthly",
    "$99",
    getPublicPriceId("VITE_STRIPE_PRICE_TEAM_MONTHLY", "price_1TVyQtP2Yr0z0IcsfNMO4n3o")
  ),
  team_annual: createPlan(
    "team",
    "annual",
    "$990",
    getPublicPriceId("VITE_STRIPE_PRICE_TEAM_ANNUAL", "price_1TVyQxP2Yr0z0IcsMr2gCkbm")
  ),
  enterprise_monthly: createPlan(
    "enterprise",
    "monthly",
    "$199",
    getPublicPriceId("VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY", "price_1TVyQzP2Yr0z0Ics7qONt0Fm")
  ),
  enterprise_annual: createPlan(
    "enterprise",
    "annual",
    "$1990",
    getPublicPriceId("VITE_STRIPE_PRICE_ENTERPRISE_ANNUAL", "price_1TVyR1P2Yr0z0IcsBZck11XI")
  ),
};

export const SUBSCRIPTION_PLAN_LIST = Object.values(SUBSCRIPTION_PLANS);

const PLAN_BY_ANY_PRICE_ID = new Map<string, SubscriptionPlanConfig>();

for (const plan of SUBSCRIPTION_PLAN_LIST) {
  PLAN_BY_ANY_PRICE_ID.set(plan.priceId, plan);
  for (const legacyPriceId of LEGACY_PRICE_ID_ALIASES[plan.id] || []) {
    PLAN_BY_ANY_PRICE_ID.set(legacyPriceId, plan);
  }
}

export const PLAN_FAMILIES: PlanFamilyConfig[] = [
  {
    tier: "pro",
    planName: "Pro",
    audience: PLAN_DETAILS.pro.audience,
    description: PLAN_DETAILS.pro.description,
    inviteCapacityLabel: PLAN_DETAILS.pro.description,
    monthly: SUBSCRIPTION_PLANS.pro_monthly,
    annual: SUBSCRIPTION_PLANS.pro_annual,
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
  {
    tier: "enterprise",
    planName: "Enterprise",
    audience: PLAN_DETAILS.enterprise.audience,
    description: PLAN_DETAILS.enterprise.description,
    inviteCapacityLabel: PLAN_DETAILS.enterprise.description,
    monthly: SUBSCRIPTION_PLANS.enterprise_monthly,
    annual: SUBSCRIPTION_PLANS.enterprise_annual,
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
  tier: PlanTier,
  interval: BillingInterval
): SubscriptionPlanConfig => SUBSCRIPTION_PLANS[`${tier}_${interval}` as SubscriptionPlanId];

export const getPlanFamily = (tier: PlanTier) =>
  PLAN_FAMILIES.find((family) => family.tier === tier) || null;

export const getPlanCapacityByTier = (tier?: string | null) => {
  if (!tier || !(tier in PLAN_CAPACITY)) {
    return {
      maxAdditionalUsers: 0,
      enforceInviteCapacity: true,
      isUnlimited: false,
    };
  }

  const maxAdditionalUsers = PLAN_CAPACITY[tier as PlanTier];
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
