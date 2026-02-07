

# Plan: Stripe Embedded Checkout in Modal

## Overview
Replace the redirect-based Stripe Checkout with an embedded payment form that displays directly in your app. Users will see the Stripe payment form inside a modal without leaving your site.

## Current Issue
The edge function is failing with "Failed to fetch" error, likely due to deployment issues. The current approach also redirects users away from your app to complete payment.

## Solution: Embedded Checkout

Stripe offers an "Embedded Checkout" mode where the payment form renders directly in your application using an iframe. This:
- Keeps users on your site
- Provides a seamless modal experience
- Still handles all payment processing securely through Stripe

## Prerequisites

You'll need a **Stripe Publishable Key** to initialize Stripe.js on the frontend. This is a public key (starts with `pk_test_` or `pk_live_`) that's safe to include in client-side code.

## Technical Implementation

### Step 1: Install React Stripe.js
Add the required npm packages:
- `@stripe/stripe-js` - Stripe.js loader
- `@stripe/react-stripe-js` - React components

### Step 2: Fix and Update Edge Function
Modify `supabase/functions/create-payment/index.ts` to:
- Add `ui_mode: "embedded"` to create an embedded session
- Return the `client_secret` instead of the checkout URL
- The `return_url` replaces `success_url` in embedded mode

### Step 3: Create Embedded Checkout Component
Create a new component that:
- Fetches the checkout session client secret from the edge function
- Uses `EmbeddedCheckoutProvider` and `EmbeddedCheckout` from React Stripe.js
- Renders inside your existing payment modal

### Step 4: Update Payment Modal
Modify `PaymentPromptModal` to:
- Show the embedded checkout form when user clicks "Pay $9"
- Handle completion callback when payment succeeds
- Close modal and unlock exports on success

## User Action Required

You'll need to provide your **Stripe Publishable Key**. You can find it in:
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Copy the "Publishable key" (starts with `pk_test_` for test mode)

This is a public key and is safe to store in your code.

## Architecture

```text
User clicks "Pay $9"
         |
         v
PaymentPromptModal shows loading state
         |
         v
Frontend calls create-payment edge function
         |
         v
Edge function creates Checkout Session with ui_mode: "embedded"
Returns: { clientSecret: "cs_..." }
         |
         v
EmbeddedCheckoutProvider initializes with clientSecret
         |
         v
EmbeddedCheckout renders Stripe payment form in modal
         |
         v
User completes payment in the modal
         |
         v
onComplete callback fires
         |
         v
Modal closes, export unlocked, ExportOptionsModal opens
```

## Files to Create/Modify

| File | Change |
|------|--------|
| `package.json` | Add `@stripe/stripe-js` and `@stripe/react-stripe-js` |
| `supabase/functions/create-payment/index.ts` | Update to use `ui_mode: "embedded"` and return `client_secret` |
| `src/components/StripeEmbeddedCheckout.tsx` | New component for embedded checkout form |
| `src/components/PaymentPromptModal.tsx` | Update to show embedded checkout instead of redirect |
| `src/pages/SlideEditor.tsx` | Simplify payment handling (no redirect needed) |

## Benefits Over Current Approach

| Feature | Current (Redirect) | New (Embedded) |
|---------|-------------------|----------------|
| User stays on site | No | Yes |
| Modal experience | No | Yes |
| Edge function complexity | Same | Same |
| LocalStorage dance | Required | Not needed |
| Success page redirect | Required | Not needed |

## Technical Details

### Edge Function Changes

The edge function will be updated to:
```typescript
// Change from:
mode: "payment",
success_url: `${origin}/payment-success`,
cancel_url: cancelUrl,

// To:
mode: "payment",
ui_mode: "embedded",
return_url: `${origin}/editor/${sermonId}?payment=success`,
```

And return `client_secret` instead of `url`:
```typescript
return new Response(JSON.stringify({ 
  clientSecret: session.client_secret 
}), ...);
```

### Frontend Stripe Integration

```typescript
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

const stripePromise = loadStripe("pk_test_...");

// In component:
<EmbeddedCheckoutProvider
  stripe={stripePromise}
  options={{ clientSecret }}
>
  <EmbeddedCheckout />
</EmbeddedCheckoutProvider>
```

