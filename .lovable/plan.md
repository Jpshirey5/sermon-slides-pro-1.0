

# Plan: Embed Stripe Payment in Same-Tab Flow

## The Challenge

Unfortunately, **Stripe Payment Links cannot be embedded in iframes**. Stripe sets security headers (`X-Frame-Options: DENY`) on their `buy.stripe.com` domain to prevent clickjacking attacks. This is a security measure that cannot be bypassed.

## Best Alternative: Same-Tab Redirect

Instead of opening Stripe in a **new tab** (which feels disconnected), we can open it in the **same tab**. This creates a smoother experience:

1. User clicks "Pay $9" 
2. They're taken to Stripe (same tab) 
3. After payment, Stripe automatically redirects them back to your app
4. The export modal opens automatically

The user never loses context because they return to exactly where they were, with the export modal ready.

## What This Changes

| Current Behavior | New Behavior |
|-----------------|--------------|
| Opens Stripe in new tab | Navigates to Stripe in same tab |
| User has to manually return | Auto-redirects back to editor |
| Modal says "Opens in a new tab" | Modal says "Continue to payment" |
| ExternalLink icon on button | Arrow icon instead |

## Implementation

### Step 1: Update PaymentPromptModal

Change the payment button to navigate in the same window instead of opening a new tab:

```typescript
// Change from:
window.open(paymentLink, "_blank");

// To:
window.location.href = paymentLink;
```

Also update the UI text to reflect this behavior.

### Step 2: Keep Existing Success Flow

The current flow already handles the return perfectly:
1. Stripe redirects to `/payment-success`
2. `PaymentSuccess` page reads the sermon ID from localStorage
3. Redirects to `/editor/:id?payment=success`
4. `SlideEditor` detects the param and unlocks export

This all stays the same - it's already well designed!

## Files to Modify

| File | Change |
|------|--------|
| `src/components/PaymentPromptModal.tsx` | Change `window.open` to `window.location.href`, update button text |

## User Experience

```text
User clicks Export → Modal opens
          |
          v
User clicks "Pay $9"
          |
          v
Same tab navigates to Stripe checkout
          |
          v
User completes payment
          |
          v
Stripe redirects to /payment-success (same tab)
          |
          v
Auto-redirect to /editor/:id?payment=success
          |
          v
Export modal opens, download ready
```

## Why This Works Well

1. **No context switching** - user stays in the same browser tab
2. **Automatic return** - no need to remember where they were
3. **Clean flow** - feels like part of your app, not a separate experience
4. **Reliable** - no iframe restrictions or CORS issues

## Note on True Embedded Checkout

If you want a truly embedded payment form (card fields inside your modal), you would need:
- A backend (Supabase Edge Functions or Lovable Cloud) to create PaymentIntent/Checkout sessions
- The Stripe.js and React Stripe.js libraries

This is possible in the future if you decide to add a backend, but for now the same-tab redirect is the best no-backend solution.

