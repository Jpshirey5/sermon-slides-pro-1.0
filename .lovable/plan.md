

# Fix: Update Stripe Payment Link in Environment

## Problem Identified

The `.env` file contains a placeholder value:
```
VITE_STRIPE_PAYMENT_LINK="https://buy.stripe.com/YOUR_PAYMENT_LINK"
```

The code in `PaymentPromptModal.tsx` checks for this exact placeholder and shows the error "Payment is not configured yet. Please contact support." when found.

## Solution

Update the `.env` file with your actual Stripe Payment Link:
```
VITE_STRIPE_PAYMENT_LINK="https://buy.stripe.com/test_14A9AVe6xapIdNs8KSaVa00"
```

## File to Modify

| File | Change |
|------|--------|
| `.env` | Replace placeholder with actual payment link |

## After This Change

When users click "Pay $9":
1. The sermon ID will be saved to localStorage
2. The browser will navigate to your Stripe checkout page
3. After payment, Stripe will redirect back to `/payment-success`
4. The app will unlock the export functionality

## Important Note

Make sure your Stripe Payment Link is configured to redirect to:
`https://id-preview--4106109b-8adc-4e56-b2c6-847326cb6d74.lovable.app/payment-success`

You can set this in your Stripe Dashboard under the Payment Link settings > "After payment" > "Don't show confirmation page" and enter your redirect URL.

