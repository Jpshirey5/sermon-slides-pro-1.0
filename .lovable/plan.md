

# Plan: Fix Post-Confirmation → Stripe Checkout Flow

## Problem
Currently, when a user confirms their email, they land on the app root (`/`) with no automatic redirect to Stripe. You want:
1. Email confirmation → land in app → immediately redirect to Stripe Checkout
2. After payment → back to app → subscription verified → dashboard access
3. Subsequent logins → check DB for active subscription → skip Stripe, go to dashboard

## Current State
- `emailRedirectTo` in SignUp.tsx points to `window.location.origin` (root `/`)
- `ProtectedRoute` already gates `/dashboard` behind subscription check and auto-redirects to Stripe if unsubscribed
- `create-checkout` success URL points to `/account?checkout=success`
- Account page handles `?checkout=success` by calling `checkSubscription()`

## What's Actually Needed

The pieces are mostly in place. The gap is: after email confirmation, the user lands on `/` (the landing page) instead of being funneled into the subscription gate. Two changes fix this:

### 1. Update `src/pages/SignUp.tsx` — Change `emailRedirectTo`
- Change from `window.location.origin` to `window.location.origin + "/dashboard"`
- When user clicks the confirmation link, Supabase will redirect them to `/dashboard`
- `ProtectedRoute` on `/dashboard` will detect no subscription → auto-redirect to Stripe Checkout

### 2. Update `supabase/functions/create-checkout/index.ts` — Change success URL
- Change `success_url` from `/account?checkout=success` to `/dashboard?checkout=success`
- After Stripe payment, user lands on `/dashboard`
- The subscription check will now pass (active sub) and they'll see the dashboard

### 3. Update `src/pages/Dashboard.tsx` — Handle `checkout=success` param
- Add a `useEffect` that checks for `?checkout=success` in the URL
- Call `checkSubscription()` and show a success toast
- This ensures the subscription state refreshes immediately after returning from Stripe

### 4. Update `src/pages/Login.tsx` — No changes needed
- Login already navigates to `/dashboard`, which is gated by `ProtectedRoute`
- If subscription is active (returning user), they pass through immediately
- If not active (shouldn't happen for returning users), they get redirected to Stripe

## Flow After Changes

```text
New user:
  Sign up → confirm email → redirected to /dashboard
    → ProtectedRoute: no subscription → auto-redirect to Stripe
    → Pay → Stripe redirects to /dashboard?checkout=success
    → checkSubscription() → subscription active → dashboard loads

Returning user:
  Log in → navigate to /dashboard
    → ProtectedRoute: subscription active → dashboard loads immediately
```

## Files

| File | Change |
|------|--------|
| `src/pages/SignUp.tsx` | Change `emailRedirectTo` to `/dashboard` |
| `supabase/functions/create-checkout/index.ts` | Change `success_url` to `/dashboard?checkout=success` |
| `src/pages/Dashboard.tsx` | Add `checkout=success` query param handler |

