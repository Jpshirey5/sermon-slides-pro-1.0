

# Plan: Gate Dashboard Behind Active Subscription

## Problem
Currently, after login/signup, users go straight to `/dashboard` without needing an active subscription. You want new users to be redirected to Stripe Checkout first, and only access the dashboard/account once they have an active Pro subscription.

## Approach

Modify `ProtectedRoute` to check subscription status in addition to authentication. If the user is logged in but has no active subscription, redirect them to Stripe Checkout automatically.

## Changes

### 1. Update `src/components/ProtectedRoute.tsx`
- Pull `subscription` and `checkSubscription` from `useAuth()` in addition to `user` and `loading`
- After confirming the user is authenticated and loading is complete:
  - If `subscription.subscribed === false`, invoke the `create-checkout` edge function and redirect the user to the Stripe Checkout URL
  - Show a loading spinner while the checkout redirect is in progress
- Add an `allowUnsubscribed` prop so specific routes (like `/account?checkout=success`) can bypass the gate temporarily for the post-checkout callback

### 2. Update `src/App.tsx`
- The `/account` route needs to allow unsubscribed users through (so the `?checkout=success` callback can land and trigger subscription verification)
- Pass `allowUnsubscribed` prop to `ProtectedRoute` wrapping the `/account` route

### 3. Update Login redirect (`src/pages/Login.tsx`)
- No change needed — it already navigates to `/dashboard`, which will now be gated by `ProtectedRoute`

### 4. Update Signup flow (`src/pages/SignUp.tsx`)
- No change needed — after email confirmation and login, the same gate applies

## Flow
```text
User signs up → confirms email → logs in
  → ProtectedRoute checks subscription
    → No active sub? → auto-redirect to Stripe Checkout
    → Stripe success → /account?checkout=success
      → checkSubscription() fires → subscription confirmed
      → User can now access /dashboard and /account
```

## Files

| File | Change |
|------|--------|
| `src/components/ProtectedRoute.tsx` | Add subscription check + auto-checkout redirect |
| `src/App.tsx` | Pass `allowUnsubscribed` to Account route |

