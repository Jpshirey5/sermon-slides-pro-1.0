import { useMemo } from "react";

export type FinancialIntegrationKey = "stripe" | "relay" | "quickbooks";
export type FinancialTransactionType = "income" | "expense";
export type FinancialTransactionStatus = "paid" | "pending";

export type FinancialBucket = {
  id: string;
  label: string;
  amountCents: number;
  allocationPercent: number;
};

export type FinancialTransaction = {
  id: string;
  name: string;
  date: string;
  amountCents: number;
  type: FinancialTransactionType;
  status: FinancialTransactionStatus;
};

export type FinancialRevenuePoint = {
  month: string;
  revenueCents: number;
};

export type FinancialIntegration = {
  key: FinancialIntegrationKey;
  label: string;
  description: string;
  isConnected: boolean;
};

type UseFinancialDataOptions = {
  stripeApiKey?: string;
  relayApiKey?: string;
};

const monthlyRevenue: FinancialRevenuePoint[] = [
  { month: "Dec", revenueCents: 1245000 },
  { month: "Jan", revenueCents: 1420000 },
  { month: "Feb", revenueCents: 1584000 },
  { month: "Mar", revenueCents: 1699000 },
  { month: "Apr", revenueCents: 1812000 },
  { month: "May", revenueCents: 1945000 },
];

const transactions: FinancialTransaction[] = [
  { id: "txn_1", name: "Community Bible Church", date: "2026-05-03", amountCents: 9900, type: "income", status: "paid" },
  { id: "txn_2", name: "Cloudflare Hosting", date: "2026-05-02", amountCents: 4200, type: "expense", status: "paid" },
  { id: "txn_3", name: "New Life Fellowship", date: "2026-05-01", amountCents: 14900, type: "income", status: "paid" },
  { id: "txn_4", name: "Resend Email", date: "2026-04-30", amountCents: 1900, type: "expense", status: "pending" },
  { id: "txn_5", name: "Grace Point Church", date: "2026-04-29", amountCents: 9900, type: "income", status: "paid" },
  { id: "txn_6", name: "Design Subscription", date: "2026-04-28", amountCents: 2900, type: "expense", status: "paid" },
];

const revenue = monthlyRevenue[monthlyRevenue.length - 1]?.revenueCents ?? 0;
const expenses = transactions
  .filter((transaction) => transaction.type === "expense")
  .reduce((total, transaction) => total + transaction.amountCents, 0);
const profit = revenue - expenses;

const buckets: FinancialBucket[] = [
  { id: "income", label: "Income", amountCents: revenue, allocationPercent: 100 },
  { id: "profit", label: "Profit", amountCents: Math.round(revenue * 0.05), allocationPercent: 5 },
  { id: "owners-pay", label: "Owner's Pay", amountCents: Math.round(revenue * 0.5), allocationPercent: 50 },
  { id: "taxes", label: "Taxes", amountCents: Math.round(revenue * 0.15), allocationPercent: 15 },
  { id: "operating-expenses", label: "Operating Expenses", amountCents: Math.round(revenue * 0.3), allocationPercent: 30 },
];

const baseIntegrations: Record<FinancialIntegrationKey, Omit<FinancialIntegration, "isConnected">> = {
  stripe: {
    key: "stripe",
    label: "Stripe",
    description: "Sync subscriptions, payouts, and revenue trends from your billing source of truth.",
  },
  relay: {
    key: "relay",
    label: "Relay",
    description: "Track operating cash buckets and align Profit First transfers with your bank workflow.",
  },
  quickbooks: {
    key: "quickbooks",
    label: "QuickBooks",
    description: "Keep accounting exports and categorization ready for your bookkeeping process.",
  },
};

export const formatFinancialCurrency = (amountCents: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amountCents / 100);

export const useFinancialData = ({ stripeApiKey, relayApiKey }: UseFinancialDataOptions = {}) => {
  const integrations = useMemo<Record<FinancialIntegrationKey, FinancialIntegration>>(
    () => ({
      stripe: { ...baseIntegrations.stripe, isConnected: Boolean(stripeApiKey) },
      relay: { ...baseIntegrations.relay, isConnected: Boolean(relayApiKey) },
      quickbooks: { ...baseIntegrations.quickbooks, isConnected: false },
    }),
    [relayApiKey, stripeApiKey],
  );

  return {
    revenue,
    subscribers: 38,
    expenses,
    profit,
    buckets,
    transactions,
    monthlyRevenue,
    integrations,
  };
};

