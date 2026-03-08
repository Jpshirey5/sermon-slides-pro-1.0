

# Plan: "Get Started" Modal with Two Paths (Pay Per Sermon vs Go Pro)

## Overview

Replace the current "Get Started" button flow with a modal offering two clear paths. This eliminates the broken email-confirmation-to-Stripe redirect entirely.

## New User Flow

```text
Landing page → Click "Get Started" → Modal appears:

  Option A: "Pay Per Sermon" ($9/export)
    → Navigate to /create (no auth needed)
    → User builds slides freely
    → On export click → existing PaymentPromptModal ($9 one-time)

  Option B: "Go Pro" ($30/month)
    → Create guest Stripe Checkout session (no auth required)
    → User pays on Stripe
    → Stripe redirects to /signup?session_id=cs_xxx
    → Edge function retrieves email from Stripe session
    → Email auto-filled on signup form
    → User completes signup → account created → subscription already active
    → Redirected to /dashboard
```

## Files to Create/Modify

### 1. Create `src/components/GetStartedModal.tsx`
- Dialog with two cards side by side
- **Pay Per Sermon**: icon, $9/export description, button navigates to `/create`
- **Go Pro**: icon, $30/month description, button calls a new `create-guest-checkout` edge function, then redirects to Stripe

### 2. Create `supabase/functions/create-guest-checkout/index.ts`
- No auth required (guest checkout)
- Creates a Stripe Checkout session with `mode: "subscription"`, using the existing price `price_1SqEzyP2Yr0z0IcsN8lN68kU`
- `success_url`: `{origin}/signup?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `{origin}/`
- No `customer` param — Stripe collects the email during checkout

### 3. Create `supabase/functions/get-checkout-email/index.ts`
- No auth required
- Accepts `session_id` in request body
- Retrieves the Stripe Checkout Session, extracts `customer_email` or `customer_details.email`
- Returns `{ email }` — nothing sensitive beyond the email

### 4. Update `src/pages/SignUp.tsx`
- On mount, check for `session_id` query param
- If present, call `get-checkout-email` edge function to retrieve email
- Auto-fill and disable the email field
- Store `session_id` in a ref so the `handle_new_user` trigger or a post-signup step can associate the Stripe customer with the new account

### 5. Update `supabase/functions/stripe-webhook/index.ts`
- On `checkout.session.completed`: if no `account_id` in metadata (guest checkout), store the customer/subscription info keyed by `customer_email` so it can be linked later
- Add logic: after user signs up and account is created, a new edge function or the existing `check-subscription` will find the Stripe subscription by email and update the account

### 6. Update `src/components/landing/Hero.tsx`
- Replace `<Link to="/create">` with an `onClick` that opens the GetStartedModal
- Keep the Login button as-is

### 7. Update `src/components/landing/CTA.tsx`
- Same change as Hero — open modal instead of direct link

### 8. Update `src/components/landing/Pricing.tsx`
- "Get Started Free" button on Pay Per Export card → navigate to `/create`
- "Start Free Trial" / Go Pro button → call `create-guest-checkout` and redirect to Stripe

### 9. Simplify `src/components/ProtectedRoute.tsx`
- Remove all the Stripe redirect logic (no more auto-redirect to checkout)
- Keep it simple: if not logged in → redirect to `/login`; if logged in but unsubscribed → show a message or redirect to pricing (not Stripe directly)
- The `checkout=success` param handling in Dashboard can also be simplified

### 10. Update `supabase/config.toml`
- Add `verify_jwt = false` for `create-guest-checkout` and `get-checkout-email`

## Post-Signup Subscription Linking

When a user signs up after paying via Stripe:
1. The `handle_new_user` trigger creates profile + account
2. On first login, `check-subscription` queries Stripe by email → finds active subscription → updates the `accounts` table with `subscription_status = 'active'`, `stripe_customer_id`, `stripe_subscription_id`
3. User sees the dashboard immediately

This already works in the current `check-subscription` edge function — it searches Stripe by email. The key difference is the Stripe customer already exists and has an active subscription before the Supabase account exists.

## Summary of Key Changes

| File | Action |
|------|--------|
| `src/components/GetStartedModal.tsx` | Create — modal with two path options |
| `supabase/functions/create-guest-checkout/index.ts` | Create — unauthenticated Stripe checkout for Pro |
| `supabase/functions/get-checkout-email/index.ts` | Create — retrieve email from Stripe session |
| `src/components/landing/Hero.tsx` | Modify — open modal instead of linking to /create |
| `src/components/landing/CTA.tsx` | Modify — same modal integration |
| `src/components/landing/Pricing.tsx` | Modify — wire buttons to correct paths |
| `src/pages/SignUp.tsx` | Modify — auto-fill email from Stripe session |
| `src/components/ProtectedRoute.tsx` | Simplify — remove auto-Stripe-redirect logic |
| `supabase/config.toml` | Add verify_jwt=false for new functions |

