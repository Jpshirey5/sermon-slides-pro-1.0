# Full Auth, Billing, and Account System for SermonSlides Pro

## Overview

This plan implements real Supabase authentication, Stripe subscription billing, and an account management page -- replacing the current localStorage-based mock auth with a production-ready system.

## Existing Infrastructure

- **Supabase project** already connected (`hqtcgynnnghxihvykrin`)
- **Database tables** already exist: `profiles`, `accounts`, `account_members`, `sermons`
- **Stripe products** already exist:
  - "Unlimited Plan" (`prod_TnqhnQ7zEQScWe`) with price `price_1SqEzyP2Yr0z0IcsN8lN68kU` at **$30/month**
  - "Pay-Per-Sermon" (`prod_TnqhEey12IfCOF`)
- **Secrets** already configured: `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
- **RLS policies** already exist on all tables
- `**handle_new_user` trigger function** exists (creates profile on signup)

---

## 1. Database Migration

Add missing columns to the existing `profiles` table:

```text
profiles (add columns):
  - email text
  - plan_tier text default 'free'
  - subscription_status text default 'inactive'
  - stripe_customer_id text
  - stripe_subscription_id text
```

Update the `handle_new_user()` trigger function to also store the email from `auth.users`.

Note: The `accounts` table already has `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, and `subscription_period_end`. We will sync subscription data to **both** `profiles` (for simple per-user queries) and `accounts` (for team/org level).

---

## 2. Auth Context (Global State)

Create `src/contexts/AuthContext.tsx`:

- Wraps the app in a React context providing: `user`, `session`, `profile`, `loading`, `signOut`
- Uses `supabase.auth.onAuthStateChange` listener (set up BEFORE `getSession()`)
- Fetches the user's profile from `profiles` table on login
- Exposes subscription status from the profile
- Provides `signOut` that calls `supabase.auth.signOut()`

Create `src/components/ProtectedRoute.tsx`:

- Wraps routes that require authentication
- Redirects to `/login` if not authenticated
- Shows a loading spinner while auth state is resolving

---

## 3. Auth Pages

### Sign Up Page (`src/pages/SignUp.tsx`)

- Fields: Full Name, Email, Password, Confirm Password
- Calls `supabase.auth.signUp()` with `full_name` in metadata
- The existing `handle_new_user` trigger auto-creates the profile row
- Shows email confirmation message on success
- Redirects to `/dashboard` after confirmation
- Make sure they have paid for the $30 subscription in Supabase before giving them access to the platform.

### Login Page (`src/pages/Login.tsx`) -- Rewrite existing

- Replace localStorage mock with `supabase.auth.signInWithPassword()`
- Error handling for invalid credentials
- Link to Sign Up and Forgot Password

### Forgot Password Page (`src/pages/ForgotPassword.tsx`)

- Email input field
- Calls `supabase.auth.resetPasswordForEmail()` with `redirectTo` pointing to `/reset-password`
- Success/error feedback

### Reset Password Page (`src/pages/ResetPassword.tsx`)

- Checks for `type=recovery` in URL hash
- New password + confirm password fields
- Calls `supabase.auth.updateUser({ password })`
- Redirects to `/dashboard` on success

---

## 4. Edge Functions

### `create-checkout` (Stripe Checkout Session)

- Authenticates user via JWT
- Looks up or creates Stripe customer by email
- Stores `stripe_customer_id` in profiles if missing
- Creates a Stripe Checkout Session in `subscription` mode with `price_1SqEzyP2Yr0z0IcsN8lN68kU`
- Returns the checkout URL
- `success_url` points to `/account?checkout=success`
- `cancel_url` points to `/account`

### `check-subscription` (Subscription Status)

- Authenticates user via JWT
- Looks up Stripe customer by email
- Checks for active subscriptions
- Returns `{ subscribed, plan_tier, subscription_end }`

### `customer-portal` (Manage Subscription)

- Authenticates user via JWT
- Creates a Stripe Customer Portal session
- Returns the portal URL for redirect

### `stripe-webhook` (Webhook Handler)

- Public endpoint (no JWT, validates Stripe signature)
- Handles events:
  - `checkout.session.completed` -- activate subscription
  - `customer.subscription.updated` -- sync status changes
  - `customer.subscription.deleted` -- mark as canceled
- Updates `profiles` table with `subscription_status`, `plan_tier`, `stripe_customer_id`, `stripe_subscription_id`

---

## 5. Pricing Section Update

Update `src/components/landing/Pricing.tsx`:

- Change $29 to **$30** in display
- "Start Free Trial" button behavior:
  - If not authenticated: redirect to `/signup`
  - If authenticated: call `create-checkout` edge function and redirect to Stripe

---

## 6. Account Page (`src/pages/Account.tsx`)

New authenticated page at `/account`:

- Display: full name, email, current plan tier, subscription status, renewal date
- Edit full name (persists to Supabase `profiles` table)
- "Manage Subscription" button -- calls `customer-portal` edge function
- "Upgrade to Pro" button if on free tier -- calls `create-checkout`
- Post-checkout success detection via `?checkout=success` query param (triggers `check-subscription` refresh)

---

## 7. Route Updates (`src/App.tsx`)

- Wrap app in `AuthProvider`
- Add new routes:
  - `/signup` -- SignUp page
  - `/forgot-password` -- ForgotPassword page
  - `/reset-password` -- ResetPassword page
  - `/account` -- Account page (protected)
- Protect `/dashboard`, `/dashboard/create`, `/manuscript`, `/account` with `ProtectedRoute`
- Update `/login` to use real Supabase auth

---

## 8. Dashboard Updates

- Replace `localStorage.getItem("logged_in")` checks with AuthContext
- Replace `localStorage.getItem("user_email")` with `profile.email` or `user.email`
- Update logout to use `signOut()` from AuthContext
- Add "Account" link in dashboard header

---

## 9. Header Updates

- If user is logged in, show "Dashboard" and "Account" links instead of "Login"
- If not logged in, show "Login" and "Sign Up" buttons

---

## Technical Details

### config.toml additions

```text
[functions.create-checkout]
verify_jwt = false

[functions.check-subscription]
verify_jwt = false

[functions.customer-portal]
verify_jwt = false

[functions.stripe-webhook]
verify_jwt = false
```

### Files Created (new)

- `src/contexts/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/pages/SignUp.tsx`
- `src/pages/ForgotPassword.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/Account.tsx`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/check-subscription/index.ts`
- `supabase/functions/customer-portal/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

### Files Modified

- `src/App.tsx` -- AuthProvider wrapper, new routes, protected routes
- `src/pages/Login.tsx` -- real Supabase auth
- `src/pages/Dashboard.tsx` -- use AuthContext instead of localStorage
- `src/components/landing/Header.tsx` -- conditional auth links
- `src/components/landing/Pricing.tsx` -- $30 price, auth-aware checkout
- `supabase/config.toml` -- edge function configs
- Database migration for profiles columns

### Stripe Webhook Setup Required

After deployment, you will need to add the webhook endpoint URL in your Stripe Dashboard:

- URL: `https://hqtcgynnnghxihvykrin.supabase.co/functions/v1/stripe-webhook`
- Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the webhook signing secret and add it as a Supabase secret (`STRIPE_WEBHOOK_SECRET`)  
