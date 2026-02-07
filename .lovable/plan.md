

# Plan: Remove Supabase and Simplify Payment Flow

## Overview

Remove all Supabase integration from the app. Since Supabase Edge Functions were being used to create Stripe checkout sessions, we'll switch to using **Stripe Payment Links** - a simple URL-based payment approach that requires no backend.

## Current Supabase Usage

| Location | Purpose |
|----------|---------|
| `src/integrations/supabase/` | Supabase client and types |
| `supabase/functions/create-payment/` | Edge function for Stripe payments |
| `supabase/config.toml` | Supabase configuration |
| `supabase/migrations/` | Database migrations |
| `.env` | Supabase environment variables |
| `src/components/StripeEmbeddedCheckout.tsx` | Uses Supabase to call edge function |
| `src/pages/SlideEditor.tsx` | Imports Supabase client (unused) |

## New Payment Approach: Stripe Payment Links

Instead of embedded checkout (which requires a backend), we'll use **Stripe Payment Links**:

1. You create a Payment Link in your Stripe Dashboard for the $9 product
2. When users click "Pay $9", they open the payment link in a new tab
3. After payment, Stripe redirects back to your app with success parameters
4. The app detects the return and unlocks exports

This is simpler, requires no backend, and works reliably.

## Implementation Steps

### Step 1: Delete Supabase Files

Remove these files/folders:
- `src/integrations/supabase/` (entire folder)
- `supabase/` (entire folder - functions, config, migrations)
- `src/components/StripeEmbeddedCheckout.tsx`

### Step 2: Update .env

Remove Supabase variables, add Stripe Payment Link:
```
VITE_STRIPE_PAYMENT_LINK="https://buy.stripe.com/YOUR_PAYMENT_LINK"
```

### Step 3: Simplify PaymentPromptModal

Replace the embedded checkout with a simple "Pay Now" button that:
- Saves the sermon ID to localStorage
- Opens the Stripe Payment Link in a new tab with return URL

### Step 4: Update SlideEditor

- Remove the Supabase import
- Keep the existing payment success detection from URL params

### Step 5: Keep PaymentSuccess Page

This page still works - it reads from localStorage and redirects properly.

### Step 6: Remove Stripe React Packages (Optional)

Since we're not using embedded checkout, we can remove:
- `@stripe/stripe-js`
- `@stripe/react-stripe-js`

## Files to Modify/Delete

| Action | File |
|--------|------|
| Delete | `src/integrations/supabase/client.ts` |
| Delete | `src/integrations/supabase/types.ts` |
| Delete | `src/integrations/` folder |
| Delete | `supabase/functions/create-payment/index.ts` |
| Delete | `supabase/config.toml` |
| Delete | `supabase/` folder |
| Delete | `src/components/StripeEmbeddedCheckout.tsx` |
| Modify | `src/components/PaymentPromptModal.tsx` |
| Modify | `src/pages/SlideEditor.tsx` |
| Modify | `.env` |
| Modify | `package.json` (remove Supabase packages) |

## New Payment Flow

```text
User clicks "Export" → Not unlocked
         |
         v
PaymentPromptModal opens
         |
         v
User clicks "Pay $9"
         |
         v
App saves sermon ID to localStorage
Opens Stripe Payment Link in new tab
         |
         v
User completes payment on Stripe
         |
         v
Stripe redirects to /payment-success
         |
         v
PaymentSuccess page reads localStorage
Redirects to /editor/:id?payment=success
         |
         v
SlideEditor detects success, unlocks export
```

## User Action Required

You'll need to create a **Stripe Payment Link** in your Stripe Dashboard:

1. Go to [Stripe Dashboard → Payment Links](https://dashboard.stripe.com/payment-links)
2. Create a new payment link for $9
3. Set the "After payment" redirect to: `https://id-preview--4106109b-8adc-4e56-b2c6-847326cb6d74.lovable.app/payment-success`
4. Copy the payment link URL (looks like `https://buy.stripe.com/xxx`)

## Benefits

- No backend required
- No Supabase dependency
- Simpler architecture
- Payment Links are fully managed by Stripe
- Easy to update pricing in Stripe Dashboard

