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
  monthly: SubscriptionPlanConfig;
  annual: SubscriptionPlanConfig;
}

const getPublicPriceId = (envKey: keyof ImportMetaEnv, fallback = "") =>
  (import.meta.env[envKey] || fallback || "").trim();

const PLAN_CAPACITY: Record<PlanTier, number | null> = {
  pro: 0,
  team: 2,
  enterprise: null,
};

const PLAN_DETAILS: Record<PlanTier, { planName: "Pro" | "Team" | "Enterprise"; audience: string; description: string }> = {
  pro: {
    planName: "Pro",
    audience: "For the Solo User",
    description: "Best for one person building and exporting sermons each week.",
  },
  team: {
    planName: "Team",
    audience: "For Teams up to 3 Users",
    description: "Includes up to 2 additional users through invites for collaborative teams.",
  },
  enterprise: {
    planName: "Enterprise",
    audience: "For Organizations with Unlimited Users",
    description: "Built for broader staff access with room for future organization controls.",
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
    getPublicPriceId("VITE_STRIPE_PRICE_PRO_MONTHLY", "price_1TEfgIP2Yr0z0IcsX2VXk6wJ")
  ),
  pro_annual: createPlan(
    "pro",
    "annual",
    "$490",
    getPublicPriceId("VITE_STRIPE_PRICE_PRO_ANNUAL", "price_1TEfi2P2Yr0z0Icsnod1blF1")
  ),
  team_monthly: createPlan(
    "team",
    "monthly",
    "$89",
    getPublicPriceId("VITE_STRIPE_PRICE_TEAM_MONTHLY", "price_1TEfggP2Yr0z0IcsHHgS6kye")
  ),
  team_annual: createPlan(
    "team",
    "annual",
    "$890",
    getPublicPriceId("VITE_STRIPE_PRICE_TEAM_ANNUAL", "price_1TEfjmP2Yr0z0IcsXW3ZujSG")
  ),
  enterprise_monthly: createPlan(
    "enterprise",
    "monthly",
    "$179",
    getPublicPriceId("VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY", "price_1TEfhaP2Yr0z0IcsGlDJJyu7")
  ),
  enterprise_annual: createPlan(
    "enterprise",
    "annual",
    "$1790",
    getPublicPriceId("VITE_STRIPE_PRICE_ENTERPRISE_ANNUAL", "price_1TEfkDP2Yr0z0IcsUhXwzh9z")
  ),
};

export const SUBSCRIPTION_PLAN_LIST = Object.values(SUBSCRIPTION_PLANS);

export const PLAN_FAMILIES: PlanFamilyConfig[] = [
  {
    tier: "pro",
    planName: "Pro",
    audience: PLAN_DETAILS.pro.audience,
    description: PLAN_DETAILS.pro.description,
    monthly: SUBSCRIPTION_PLANS.pro_monthly,
    annual: SUBSCRIPTION_PLANS.pro_annual,
  },
  {
    tier: "team",
    planName: "Team",
    audience: PLAN_DETAILS.team.audience,
    description: PLAN_DETAILS.team.description,
    monthly: SUBSCRIPTION_PLANS.team_monthly,
    annual: SUBSCRIPTION_PLANS.team_annual,
  },
  {
    tier: "enterprise",
    planName: "Enterprise",
    audience: PLAN_DETAILS.enterprise.audience,
    description: PLAN_DETAILS.enterprise.description,
    monthly: SUBSCRIPTION_PLANS.enterprise_monthly,
    annual: SUBSCRIPTION_PLANS.enterprise_annual,
  },
];

export const getPlanByPriceId = (priceId?: string | null): SubscriptionPlanConfig | null => {
  if (!priceId) return null;
  return SUBSCRIPTION_PLAN_LIST.find((plan) => plan.priceId === priceId) || null;
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
