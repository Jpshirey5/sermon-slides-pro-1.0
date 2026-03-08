

# Plan: Fix Subscription Redirect Loop and Move to Account-Level Billing

## Root Cause

Two problems are causing the infinite Stripe redirect loop:

1. **Race condition in ProtectedRoute**: When the user returns from Stripe to `/dashboard?checkout=success`, `ProtectedRoute` fires first and sees `subscription.subscribed === false` (the check hasn't completed yet). It immediately redirects back to Stripe before the Dashboard component even mounts to handle the `checkout=success` parameter.

2. **Wrong billing scope**: Subscription data is currently stored on the `profiles` table (per-user), but billing should be per-account since the `accounts` table already has `subscription_status`, `stripe_customer_id`, and `stripe_subscription_id` columns.

## Changes

### 1. Fix `ProtectedRoute` — Stop the redirect loop
- Detect `?checkout=success` in the URL query string
- When present, call `checkSubscription()` and **wait** for it to resolve instead of redirecting to Stripe
- Add a `subscriptionChecked` flag to track whether the initial check has completed, preventing premature redirects

### 2. Update `AuthContext` — Add subscription-checked state
- Add a `subscriptionChecked` boolean to track whether `checkSubscription()` has completed at least once
- `ProtectedRoute` should not redirect to Stripe until this flag is true
- This prevents the race where `subscribed === false` simply because the check hasn't run yet

### 3. Update `check-subscription` edge function — Account-level lookup
- After authenticating the user, look up their `account_id` via the `account_members` table
- Then check the `accounts` table for `stripe_customer_id` to find the Stripe customer
- If no Stripe customer on the account, fall back to email-based Stripe lookup
- On finding an active subscription, update the `accounts` table (not `profiles`) with `subscription_status = 'active'`, `stripe_customer_id`, `stripe_subscription_id`, and `subscription_period_end`

### 4. Update `create-checkout` edge function — Store on account
- Look up the user's account_id
- Store `stripe_customer_id` on the `accounts` table instead of `profiles`
- Pass `metadata: { account_id }` to the Stripe checkout session for webhook correlation

### 5. Update `stripe-webhook` — Write to accounts table
- On `checkout.session.completed`: use metadata `account_id` (or fall back to email lookup via profiles → account_members) to update the `accounts` table
- On `subscription.updated` / `subscription.deleted`: look up by `stripe_customer_id` in `accounts` table

### 6. Update `create-checkout` — Prevent duplicate checkout for already-subscribed accounts
- Before creating a checkout session, check if the Stripe customer already has an active subscription
- If yes, return the dashboard URL directly instead of creating another checkout

## Flow After Fix

```text
New user:
  Sign up → confirm email → /dashboard
    → ProtectedRoute: subscriptionChecked=false → wait
    → checkSubscription() completes → subscribed=false, subscriptionChecked=true
    → ProtectedRoute: redirect to Stripe
    → Pay → /dashboard?checkout=success
    → ProtectedRoute: sees checkout=success → calls checkSubscription(), waits
    → check-subscription queries Stripe → active → updates accounts table → returns subscribed=true
    → ProtectedRoute: subscribed=true → renders Dashboard

Returning user:
  Log in → /dashboard
    → checkSubscription() → Stripe confirms active sub → subscribed=true
    → Dashboard renders immediately
```

## Files

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add `subscriptionChecked` state, set after first `checkSubscription()` resolves |
| `src/components/ProtectedRoute.tsx` | Wait for `subscriptionChecked`, detect `checkout=success` param, call `checkSubscription()` + wait before allowing render |
| `supabase/functions/check-subscription/index.ts` | Query `account_members` → `accounts` for subscription status; update `accounts` table |
| `supabase/functions/create-checkout/index.ts` | Store `stripe_customer_id` on `accounts`; pass `account_id` in Stripe metadata; skip checkout if already subscribed |
| `supabase/functions/stripe-webhook/index.ts` | Update `accounts` table instead of `profiles` |

