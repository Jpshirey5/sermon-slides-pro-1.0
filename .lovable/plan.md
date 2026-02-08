
# Update Payment Link URL

## Change Required

Update the `.env` file with your new Stripe Payment Link that has the correct redirect configured.

## File to Modify

| File | Change |
|------|--------|
| `.env` | Update `VITE_STRIPE_PAYMENT_LINK` to the new URL |

## New Value

```env
VITE_STRIPE_PAYMENT_LINK="https://buy.stripe.com/test_dRm5kFbYp69saBg4uCaVa02"
```

## Payment Flow After This Change

```text
User clicks "Pay $9" in PaymentPromptModal
              |
              v
Browser navigates to Stripe checkout
              |
              v
User completes $9 payment
              |
              v
Stripe redirects to /payment-success (your configured redirect)
              |
              v
PaymentSuccess page reads sermonId from localStorage
              |
              v
Redirects to /editor/:id?payment=success
              |
              v
SlideEditor detects payment=success, unlocks export
              |
              v
ExportOptionsModal opens automatically
```

## Ready to Test

Once updated, you can test the full flow from the editor page you're currently on (`/editor/1770508269998`) by clicking the Export button.
