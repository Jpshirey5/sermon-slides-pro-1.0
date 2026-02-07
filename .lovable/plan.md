
# Plan: Redirect Back to Editor After Stripe Payment

## Overview
Configure the Stripe Payment Link to redirect users back to their specific editor page after completing payment, where they can immediately select their export format.

## Current Issue
The Stripe Payment Link currently shows a hosted confirmation page after payment. Users have to manually navigate back to their presentation, then click export again and use the "Already paid? Unlock export" button.

## Solution Architecture

Since the Stripe Payment Link is **static** (the same link is used for all presentations), we cannot dynamically set the redirect URL per presentation. Instead, we'll:

1. **Create a Payment Success page** that acts as a redirect handler
2. **Update the Stripe Payment Link** (in Dashboard) to redirect to this success page
3. **Use localStorage** to remember which presentation the user was editing
4. **Auto-redirect** from the success page back to the correct editor with unlock parameters

## Technical Implementation

### Step 1: Create Payment Success Handler Page
Create a new route `/payment-success` that:
- Reads the pending presentation ID from localStorage (`pending_payment_sermon_id`)
- Redirects to `/editor/:id?payment=success`
- Shows a brief loading state during redirect

### Step 2: Update App Routes
Add the `/payment-success` route in `App.tsx`

### Step 3: Modify SlideEditor Payment Flow
Update the flow to:
- Save the presentation ID to localStorage before Stripe redirect (already done as `pending_payment_sermon_id`)
- Keep the existing `?payment=success` handling that unlocks exports and shows the modal

### Step 4: Configure Stripe Payment Link (Manual Step)
You'll need to update the Payment Link in your Stripe Dashboard:
1. Go to [Stripe Dashboard → Payment Links](https://dashboard.stripe.com/payment-links)
2. Click on the Pay-Per-Sermon payment link
3. Click "Edit"
4. Under "After payment" → select "Don't show confirmation page"
5. Set the redirect URL to: `https://your-domain.lovable.app/payment-success?payment=success`
6. Save changes

## Flow Diagram

```text
User clicks Export → Payment Modal opens → User clicks "Pay $9"
         ↓
localStorage stores: pending_payment_sermon_id = "1770494955858"
         ↓
User redirected to Stripe Checkout
         ↓
User completes payment
         ↓
Stripe redirects to: /payment-success?payment=success
         ↓
PaymentSuccess page reads localStorage, finds pending ID
         ↓
Auto-redirect to: /editor/1770494955858?payment=success
         ↓
SlideEditor detects ?payment=success, unlocks export, shows Export Modal
```

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/PaymentSuccess.tsx` | **Create** - Redirect handler that reads localStorage and navigates to correct editor |
| `src/App.tsx` | **Modify** - Add `/payment-success` route |
| `src/pages/SlideEditor.tsx` | **Minor** - Ensure pending ID storage key is consistent |

## User Action Required
After implementation, you'll need to update the Payment Link redirect URL in your Stripe Dashboard to point to:
```
https://[your-preview-url]/payment-success?payment=success
```

Replace `[your-preview-url]` with your actual preview or published domain.
