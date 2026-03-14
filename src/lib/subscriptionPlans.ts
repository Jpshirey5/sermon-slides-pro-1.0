export type BillingInterval = "month" | "year";

export interface SubscriptionPlanConfig {
  id: BillingInterval;
  label: string;
  badgeLabel: string;
  priceId: string;
  displayPrice: string;
  intervalLabel: string;
}

export const SUBSCRIPTION_PLANS: Record<BillingInterval, SubscriptionPlanConfig> = {
  month: {
    id: "month",
    label: "Pro Monthly",
    badgeLabel: "Pro Monthly",
    priceId: "price_1TAr39P2Yr0z0IcssSAqGZ8n",
    displayPrice: "$50",
    intervalLabel: "/month",
  },
  year: {
    id: "year",
    label: "Pro Yearly",
    badgeLabel: "Pro Yearly",
    priceId: "price_1TAr3bP2Yr0z0Icsfjb1ckej",
    displayPrice: "$500",
    intervalLabel: "/year",
  },
};

export const SUBSCRIPTION_PLAN_LIST = [
  SUBSCRIPTION_PLANS.month,
  SUBSCRIPTION_PLANS.year,
];

export const getPlanByPriceId = (priceId?: string | null): SubscriptionPlanConfig | null => {
  if (!priceId) return null;
  return SUBSCRIPTION_PLAN_LIST.find((plan) => plan.priceId === priceId) || null;
};

export const getPlanByInterval = (interval?: string | null): SubscriptionPlanConfig | null => {
  if (interval !== "month" && interval !== "year") return null;
  return SUBSCRIPTION_PLANS[interval];
};
