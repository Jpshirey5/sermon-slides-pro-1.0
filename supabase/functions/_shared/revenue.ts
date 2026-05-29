// Shared revenue/MRR computation from Stripe. Used by admin-api (overview_revenue)
// and the monthly-report cron so the dashboard and emailed numbers never drift.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

type SupabaseAdmin = ReturnType<typeof createClient>;
type Logger = (step: string, details?: Record<string, unknown>) => void;

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const noopLog: Logger = () => {};

// Revenue is only reported from the date the billing data became trustworthy.
export const REPORTING_START_DATE = new Date("2026-04-24T00:00:00.000Z");

// Internal/test accounts excluded from revenue and MRR.
export const STRIPE_REPORTING_EXCLUDED_EMAILS = new Set([
  "jpshirey5@gmail.com",
  "jayshirey14@gmail.com",
]);

export type RevenueSummary = {
  grossRevenueCents: number;
  refundedCents: number;
  stripeFeesCents: number;
  netRevenueCents: number;
  netAfterFeesCents: number;
  currentMrrCents: number;
  paidInvoiceCount: number;
  balanceTransactionCount: number;
  activeSubscriptionCount: number;
  currency: string;
  mixedCurrencies: boolean;
};

export type RevenueResult = {
  items: any[];
  summary: RevenueSummary;
  error?: string;
};

type RevenuePaymentRow = {
  id: string;
  created: number;
  customerId: string;
  currency: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
};

const emptySummary = (): RevenueSummary => ({
  grossRevenueCents: 0,
  refundedCents: 0,
  stripeFeesCents: 0,
  netRevenueCents: 0,
  netAfterFeesCents: 0,
  currentMrrCents: 0,
  paidInvoiceCount: 0,
  balanceTransactionCount: 0,
  activeSubscriptionCount: 0,
  currency: "usd",
  mixedCurrencies: false,
});

const buildRevenueBuckets = (start: Date, end: Date) => {
  const buckets: Record<string, any> = {};
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) {
    buckets[dateKey(cursor)] = {
      date: dateKey(cursor),
      grossRevenueCents: 0,
      refundedCents: 0,
      stripeFeesCents: 0,
      netRevenueCents: 0,
      netAfterFeesCents: 0,
    };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
};

const listPaidInvoicesInRange = async (stripe: Stripe, startUnix: number, endUnix: number) => {
  const invoices: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.invoices.list({
      status: "paid",
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    invoices.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }
  return invoices;
};

const listRefundsInRange = async (stripe: Stripe, startUnix: number, endUnix: number) => {
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.refunds.list({
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    refunds.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }
  return refunds;
};

const listSucceededChargesInRange = async (stripe: Stripe, startUnix: number, endUnix: number) => {
  const charges: Stripe.Charge[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.charges.list({
      created: { gte: startUnix, lte: endUnix },
      limit: 100,
      expand: ["data.balance_transaction"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    charges.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }
  return charges;
};

const listActiveSubscriptions = async (stripe: Stripe) => {
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
      expand: ["data.items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subscriptions.push(...response.data);
    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  }
  return subscriptions;
};

const normalizeRecurringAmountToMonthly = (price: Stripe.Price, quantity = 1) => {
  const recurring = price.recurring;
  const amount = price.unit_amount ?? 0;
  if (!recurring || amount <= 0) return 0;

  const intervalCount = Math.max(recurring.interval_count || 1, 1);
  const totalAmount = amount * Math.max(quantity || 1, 1);

  if (recurring.interval === "month") return totalAmount / intervalCount;
  if (recurring.interval === "year") return totalAmount / (12 * intervalCount);
  if (recurring.interval === "week") return (totalAmount * 52) / (12 * intervalCount);
  if (recurring.interval === "day") return (totalAmount * 365) / (12 * intervalCount);
  return 0;
};

const getStripeReportingExclusions = async (supabaseAdmin: SupabaseAdmin) => {
  const [{ data: accounts, error: accountsError }, { data: owners, error: ownersError }] = await Promise.all([
    supabaseAdmin.from("accounts").select("id, name, stripe_customer_id, stripe_subscription_id"),
    supabaseAdmin.from("account_members").select("account_id, user_id, role").eq("role", "owner"),
  ]);

  if (accountsError) throw new Error(accountsError.message);
  if (ownersError) throw new Error(ownersError.message);

  const ownerUserIds = Array.from(new Set((owners || []).map((owner: any) => owner.user_id).filter(Boolean)));
  const { data: ownerProfiles, error: ownerProfilesError } = ownerUserIds.length
    ? await supabaseAdmin.from("profiles").select("id, email").in("id", ownerUserIds)
    : { data: [] as any[], error: null };

  if (ownerProfilesError) throw new Error(ownerProfilesError.message);

  const ownerEmailByUserId = new Map<string, string>();
  for (const profile of ownerProfiles || []) {
    const ownerEmail = normalizeEmail(profile.email);
    if (profile.id && ownerEmail) ownerEmailByUserId.set(profile.id, ownerEmail);
  }

  const ownerEmailByAccountId = new Map<string, string>();
  for (const owner of owners || []) {
    const ownerEmail = ownerEmailByUserId.get(owner.user_id) || "";
    if (owner.account_id && ownerEmail && !ownerEmailByAccountId.has(owner.account_id)) {
      ownerEmailByAccountId.set(owner.account_id, ownerEmail);
    }
  }

  const customerIds = new Set<string>();
  const subscriptionIds = new Set<string>();
  for (const account of accounts || []) {
    const ownerEmail = ownerEmailByAccountId.get(account.id) || "";
    if (!STRIPE_REPORTING_EXCLUDED_EMAILS.has(ownerEmail)) continue;
    const customerId = clean(account.stripe_customer_id);
    const subscriptionId = clean(account.stripe_subscription_id);
    if (customerId) customerIds.add(customerId);
    if (subscriptionId) subscriptionIds.add(subscriptionId);
  }

  return { customerIds, subscriptionIds };
};

/**
 * Computes gross/net revenue, Stripe fees, refunds and current MRR for the [start, end]
 * window, broken into daily buckets plus a summary. Excludes test-mode data and internal
 * accounts. Returns zeroed values (with `error`) when Stripe is unconfigured or a call fails.
 */
export const computeRevenueMetrics = async (options: {
  stripe: Stripe | null;
  supabaseAdmin: SupabaseAdmin;
  start: Date;
  end: Date;
  log?: Logger;
}): Promise<RevenueResult> => {
  const { stripe, supabaseAdmin, start, end } = options;
  const log = options.log ?? noopLog;
  const buckets = buildRevenueBuckets(start, end);

  if (!stripe) {
    return { items: Object.values(buckets), summary: emptySummary(), error: "Stripe is not configured." };
  }

  try {
    const effectiveStart = start > REPORTING_START_DATE ? start : REPORTING_START_DATE;
    const startUnix = Math.floor(effectiveStart.getTime() / 1000);
    const endUnix = Math.floor(end.getTime() / 1000);
    const [{ customerIds: excludedCustomerIds, subscriptionIds: excludedSubscriptionIds }, invoices, refunds, charges, subscriptions] = await Promise.all([
      getStripeReportingExclusions(supabaseAdmin),
      listPaidInvoicesInRange(stripe, startUnix, endUnix),
      listRefundsInRange(stripe, startUnix, endUnix),
      listSucceededChargesInRange(stripe, startUnix, endUnix),
      listActiveSubscriptions(stripe),
    ]);

    const includedSubscriptions = subscriptions.filter((subscription) => (
      subscription.livemode === true &&
      !excludedCustomerIds.has(clean(subscription.customer)) &&
      !excludedSubscriptionIds.has(clean(subscription.id))
    ));

    const seenPaymentIds = new Set<string>();
    const includedChargeIds = new Set<string>();
    const paymentRows: RevenuePaymentRow[] = [];

    const addPaymentRowFromCharge = (charge: Stripe.Charge | null, source: "invoice" | "charge") => {
      if (!charge) return;
      if (charge.livemode !== true) return;
      if (charge.status !== "succeeded") return;
      if (new Date(charge.created * 1000) < REPORTING_START_DATE) return;

      const customerId = clean(charge.customer);
      if (!customerId || excludedCustomerIds.has(customerId)) return;

      const paymentId = clean(charge.id);
      if (!paymentId || seenPaymentIds.has(paymentId)) return;

      const rawBalanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction | string | null;
      const balanceTransaction = rawBalanceTransaction && typeof rawBalanceTransaction === "object" ? rawBalanceTransaction : null;
      if (!balanceTransaction) {
        log("Skipping revenue charge without expanded balance transaction", { chargeId: paymentId, source });
        return;
      }
      if (balanceTransaction.livemode !== true) return;

      seenPaymentIds.add(paymentId);
      includedChargeIds.add(paymentId);

      paymentRows.push({
        id: paymentId,
        created: charge.created,
        customerId,
        currency: charge.currency || balanceTransaction.currency || null,
        grossAmount: balanceTransaction.amount || 0,
        feeAmount: balanceTransaction.fee || 0,
        netAmount: balanceTransaction.net || 0,
      });
    };

    const includedInvoices = invoices.filter((invoice) => (
      invoice.livemode === true &&
      invoice.status === "paid" &&
      !excludedCustomerIds.has(clean(invoice.customer)) &&
      new Date(invoice.created * 1000) >= REPORTING_START_DATE
    ));

    for (const invoice of includedInvoices) {
      const chargeId = clean((invoice as any).charge);
      if (!chargeId) continue;
      try {
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
        addPaymentRowFromCharge(charge, "invoice");
      } catch (error) {
        log("Failed retrieving invoice charge for revenue", {
          invoiceId: invoice.id,
          chargeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const charge of charges) {
      if (clean(charge.invoice)) continue;
      addPaymentRowFromCharge(charge, "charge");
    }

    const includedRefunds = refunds.filter((refund) => {
      if (refund.livemode !== true) return false;
      if (new Date(refund.created * 1000) < REPORTING_START_DATE) return false;
      const refundChargeId = clean((refund as any).charge);
      return Boolean(refundChargeId && includedChargeIds.has(refundChargeId));
    });

    const currencies = new Set<string>();
    let grossRevenueCents = 0;
    let refundedCents = 0;
    let stripeFeesCents = 0;
    let netAfterFeesCents = 0;
    let currentMrrCents = 0;

    for (const paymentRow of paymentRows) {
      const key = dateKey(new Date(paymentRow.created * 1000));
      if (!buckets[key]) continue;
      buckets[key].grossRevenueCents += paymentRow.grossAmount;
      buckets[key].stripeFeesCents += paymentRow.feeAmount;
      buckets[key].netAfterFeesCents += paymentRow.netAmount;
      grossRevenueCents += paymentRow.grossAmount;
      stripeFeesCents += paymentRow.feeAmount;
      netAfterFeesCents += paymentRow.netAmount;
      if (paymentRow.currency) currencies.add(paymentRow.currency);
    }

    for (const refund of includedRefunds) {
      const key = dateKey(new Date(refund.created * 1000));
      const amount = refund.amount || 0;
      if (!buckets[key]) continue;
      buckets[key].refundedCents += amount;
      refundedCents += amount;
      if (refund.currency) currencies.add(refund.currency);
    }

    for (const subscription of includedSubscriptions) {
      for (const item of subscription.items?.data || []) {
        const price = item.price;
        currentMrrCents += normalizeRecurringAmountToMonthly(price, item.quantity || 1);
        if (price.currency) currencies.add(price.currency);
      }
    }

    for (const bucket of Object.values(buckets)) {
      bucket.netRevenueCents = bucket.grossRevenueCents - bucket.refundedCents;
    }

    const currency = Array.from(currencies)[0] || "usd";
    return {
      items: Object.values(buckets),
      summary: {
        grossRevenueCents,
        refundedCents,
        stripeFeesCents,
        netRevenueCents: grossRevenueCents - refundedCents,
        netAfterFeesCents,
        currentMrrCents: Math.round(currentMrrCents),
        paidInvoiceCount: includedInvoices.length,
        balanceTransactionCount: paymentRows.length,
        activeSubscriptionCount: includedSubscriptions.length,
        currency,
        mixedCurrencies: currencies.size > 1,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("Stripe revenue overview failed", { error: message });
    return { items: Object.values(buckets), summary: emptySummary(), error: message };
  }
};
