// Who may present: paying churches only. Mirrors check-subscription's notion
// of "subscribed", read from the account row so presenting does not depend on
// Stripe answering on a Sunday morning.

export interface AccountPlanFields {
  subscription_status: string | null;
  is_beta_user?: boolean | null;
  beta_trial_ends_at?: string | null;
  partner_billing_active?: boolean | null;
  /** Shown in song credit lines. */
  ccli_license_number?: string | null;
}

/**
 * check-subscription counts Stripe 'active', 'trialing', and 'past_due' as
 * subscribed, and records past_due as 'active' on the account. Beta trials
 * and partner-billed accounts also count.
 */
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

export function accountCanPresent(account: AccountPlanFields | null | undefined, now: Date = new Date()): boolean {
  if (!account) return false;
  if (account.partner_billing_active) return true;
  if (account.subscription_status && PAYING_STATUSES.has(account.subscription_status)) return true;
  if (account.is_beta_user && account.beta_trial_ends_at) {
    const ends = new Date(account.beta_trial_ends_at).getTime();
    if (!Number.isNaN(ends) && ends >= now.getTime()) return true;
  }
  return false;
}

/** Fixed-window rate limit bucket names, in UTC. */
export function minuteBucket(prefix: string, now: Date): string {
  return `${prefix}:m:${now.toISOString().slice(0, 16)}`;
}

export function dayBucket(prefix: string, now: Date): string {
  return `${prefix}:d:${now.toISOString().slice(0, 10)}`;
}
