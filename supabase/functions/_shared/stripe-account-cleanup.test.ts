import { assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import type Stripe from "https://esm.sh/stripe@18.5.0";
import { cancelAndDeleteStripeCustomer } from "./stripe-account-cleanup.ts";

type Call = { method: string; args: unknown[] };

const resourceMissing = (message = "No such resource") => {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "resource_missing";
  error.statusCode = 404;
  return error;
};

const makeSubscription = (id: string, status: string) => ({ id, status });

/** Minimal fake covering only the Stripe methods cancelAndDeleteStripeCustomer calls. */
function makeStripe(overrides: {
  customer?: unknown;
  customerRetrieveError?: unknown;
  subscriptions?: Array<{ id: string; status: string }>;
  subscriptionsListError?: unknown;
  subscriptionOverrides?: Record<string, { retrieveError?: unknown; cancelError?: unknown }>;
  customerDelError?: unknown;
}) {
  const calls: Call[] = [];
  const stripe = {
    customers: {
      retrieve: async (id: string) => {
        calls.push({ method: "customers.retrieve", args: [id] });
        if (overrides.customerRetrieveError) throw overrides.customerRetrieveError;
        return overrides.customer ?? { id, deleted: false };
      },
      del: async (id: string) => {
        calls.push({ method: "customers.del", args: [id] });
        if (overrides.customerDelError) throw overrides.customerDelError;
        return { id, deleted: true };
      },
    },
    subscriptions: {
      list: async (params: unknown) => {
        calls.push({ method: "subscriptions.list", args: [params] });
        if (overrides.subscriptionsListError) throw overrides.subscriptionsListError;
        return { data: overrides.subscriptions ?? [] };
      },
      retrieve: async (id: string) => {
        calls.push({ method: "subscriptions.retrieve", args: [id] });
        const sub = overrides.subscriptions?.find((s) => s.id === id);
        const subOverride = overrides.subscriptionOverrides?.[id];
        if (subOverride?.retrieveError) throw subOverride.retrieveError;
        return sub ?? makeSubscription(id, "active");
      },
      cancel: async (id: string) => {
        calls.push({ method: "subscriptions.cancel", args: [id] });
        const subOverride = overrides.subscriptionOverrides?.[id];
        if (subOverride?.cancelError) throw subOverride.cancelError;
        return { id, status: "canceled" };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls };
}

Deno.test("cancels the active subscription then deletes the customer, in that order", async () => {
  const { stripe, calls } = makeStripe({
    subscriptions: [makeSubscription("sub_1", "active")],
  });

  await cancelAndDeleteStripeCustomer(stripe, "cus_1", "sub_1");

  const methodOrder = calls.map((c) => c.method);
  assertEquals(methodOrder, [
    "customers.retrieve",
    "subscriptions.list",
    "subscriptions.retrieve",
    "subscriptions.cancel",
    "customers.del",
  ]);
  const cancelIndex = methodOrder.indexOf("subscriptions.cancel");
  const delIndex = methodOrder.indexOf("customers.del");
  assertEquals(cancelIndex < delIndex, true, "subscription must be canceled before the customer is deleted");
});

Deno.test("skips already-canceled subscriptions but still deletes the customer", async () => {
  const { stripe, calls } = makeStripe({
    subscriptions: [makeSubscription("sub_1", "canceled")],
  });

  await cancelAndDeleteStripeCustomer(stripe, "cus_1", "sub_1");

  const methodOrder = calls.map((c) => c.method);
  assertEquals(methodOrder.includes("subscriptions.cancel"), false);
  assertEquals(methodOrder.includes("customers.del"), true);
});

Deno.test("deduplicates the passed-in subscriptionId against the listed subscriptions", async () => {
  const { stripe, calls } = makeStripe({
    subscriptions: [makeSubscription("sub_1", "active")],
  });

  await cancelAndDeleteStripeCustomer(stripe, "cus_1", "sub_1");

  const cancelCalls = calls.filter((c) => c.method === "subscriptions.cancel");
  assertEquals(cancelCalls.length, 1);
});

Deno.test("no Stripe customer at all: missing customer is treated as already cleaned up, not an error", async () => {
  const { stripe, calls } = makeStripe({ customerRetrieveError: resourceMissing() });

  await cancelAndDeleteStripeCustomer(stripe, "cus_missing", null);

  assertEquals(calls.map((c) => c.method), ["customers.retrieve"]);
});

Deno.test("customer already marked deleted: no-op, no subscription or delete calls", async () => {
  const { stripe, calls } = makeStripe({ customer: { id: "cus_1", deleted: true } });

  await cancelAndDeleteStripeCustomer(stripe, "cus_1", null);

  assertEquals(calls.map((c) => c.method), ["customers.retrieve"]);
});

Deno.test("a subscription that vanishes mid-cancel is skipped, not fatal", async () => {
  const { stripe, calls } = makeStripe({
    subscriptions: [makeSubscription("sub_1", "active")],
    subscriptionOverrides: { sub_1: { cancelError: resourceMissing() } },
  });

  await cancelAndDeleteStripeCustomer(stripe, "cus_1", "sub_1");

  assertEquals(calls.map((c) => c.method).includes("customers.del"), true);
});

Deno.test("a genuine subscription-cancel failure throws and never reaches customer delete", async () => {
  const { stripe, calls } = makeStripe({
    subscriptions: [makeSubscription("sub_1", "active")],
    subscriptionOverrides: { sub_1: { cancelError: new Error("card issue / API error") } },
  });

  await assertRejects(
    () => cancelAndDeleteStripeCustomer(stripe, "cus_1", "sub_1"),
    Error,
    "Failed canceling Stripe subscription sub_1",
  );
  assertEquals(calls.map((c) => c.method).includes("customers.del"), false);
});

Deno.test("a genuine customer-delete failure throws with the customer id in the message", async () => {
  const { stripe } = makeStripe({ customerDelError: new Error("Stripe is down") });

  await assertRejects(
    () => cancelAndDeleteStripeCustomer(stripe, "cus_1", null),
    Error,
    "Failed deleting Stripe customer cus_1",
  );
});

Deno.test("a genuine subscriptions.list failure throws before any cancellation is attempted", async () => {
  const { stripe, calls } = makeStripe({ subscriptionsListError: new Error("network blip") });

  await assertRejects(() => cancelAndDeleteStripeCustomer(stripe, "cus_1", null), Error);
  assertEquals(calls.map((c) => c.method).includes("subscriptions.cancel"), false);
  assertEquals(calls.map((c) => c.method).includes("customers.del"), false);
});
