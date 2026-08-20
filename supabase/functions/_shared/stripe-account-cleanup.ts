// Shared "hard delete" Stripe cleanup used by finalize-account-deletions (grace-period
// cron) and admin-api (customer_hard_delete_org). Both need the same guarantee: when an
// account is actually deleted, its Stripe subscription(s) are canceled immediately and its
// Stripe customer record is removed, with real failures surfaced to the caller instead of
// swallowed -- a caller that silently proceeds after a failed Stripe call leaves an orphaned
// Stripe customer with no record anywhere that cleanup didn't finish.
import Stripe from "https://esm.sh/stripe@18.5.0";

type Logger = (step: string, details?: Record<string, unknown>) => void;

const isStripeResourceMissing = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  return code === "resource_missing" || statusCode === 404;
};

const stripeErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Cancels every subscription for a Stripe customer (immediately, not
 * cancel-at-period-end -- this only runs when an account is being permanently
 * deleted) and then deletes the customer record. A customer or subscription
 * that's already gone is treated as success, not an error. Any other Stripe
 * failure throws so the caller can abort before touching local data.
 */
export async function cancelAndDeleteStripeCustomer(
  stripe: Stripe,
  customerId: string,
  subscriptionId: string | null,
  log: Logger = () => {},
): Promise<void> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      log("Stripe customer already gone, nothing to clean up", { customerId });
      return;
    }
    throw new Error(`Failed retrieving Stripe customer ${customerId}: ${stripeErrorMessage(error)}`);
  }

  if (customer.deleted) {
    log("Stripe customer already deleted, nothing to clean up", { customerId });
    return;
  }

  const subscriptionIds = new Set<string>();
  if (subscriptionId) subscriptionIds.add(subscriptionId);

  try {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const sub of subscriptions.data) subscriptionIds.add(sub.id);
  } catch (error) {
    throw new Error(`Failed listing Stripe subscriptions for customer ${customerId}: ${stripeErrorMessage(error)}`);
  }

  for (const id of subscriptionIds) {
    try {
      const subscription = await stripe.subscriptions.retrieve(id);
      if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
        await stripe.subscriptions.cancel(id);
        log("Canceled Stripe subscription", { customerId, subscriptionId: id });
      }
    } catch (error) {
      if (isStripeResourceMissing(error)) {
        log("Stripe subscription already gone, skipping", { customerId, subscriptionId: id });
        continue;
      }
      throw new Error(`Failed canceling Stripe subscription ${id} for customer ${customerId}: ${stripeErrorMessage(error)}`);
    }
  }

  try {
    await stripe.customers.del(customerId);
    log("Deleted Stripe customer", { customerId });
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      log("Stripe customer already gone during delete, treating as success", { customerId });
      return;
    }
    throw new Error(`Failed deleting Stripe customer ${customerId}: ${stripeErrorMessage(error)}`);
  }
}
