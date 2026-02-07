

# Plan: Create Dynamic Stripe Checkout with Redirect

## The Problem
The current Payment Link (`https://buy.stripe.com/test_14A9AVe6xapIdNs8KSaVa00`) was created via API and cannot be edited in the Dashboard. My available tools don't support updating Payment Links with redirect URLs.

## The Solution
Instead of using a static Payment Link, we'll create a lightweight edge function that generates Stripe Checkout Sessions with full redirect control. This approach:
- Uses the same $9 price (`price_1SqEznP2Yr0z0IcsXrxP90T7`)
- Supports guest checkout (no authentication required)
- Redirects users back to `/payment-success` after payment

## Architecture

```text
User clicks "Pay $9" in Payment Modal
         |
         v
Frontend calls create-payment edge function
         |
         v
Edge function creates Stripe Checkout Session with:
  - price_id: price_1SqEznP2Yr0z0IcsXrxP90T7
  - mode: "payment" (one-time)
  - success_url: https://[origin]/payment-success
  - cancel_url: https://[origin]/editor/[id]
         |
         v
Returns checkout session URL
         |
         v
User redirected to Stripe Checkout
         |
         v
After payment, Stripe redirects to /payment-success
         |
         v
PaymentSuccess page reads localStorage, redirects to editor
         |
         v
Editor unlocks export automatically
```

## Technical Implementation

### Step 1: Create Edge Function
Create `supabase/functions/create-payment/index.ts`:
- Accept optional `sermon_id` in request body (for cancel URL)
- Create Stripe Checkout Session with `mode: "payment"`
- Set `success_url` to `/payment-success`
- Return the checkout session URL

### Step 2: Update SlideEditor
Modify `src/pages/SlideEditor.tsx`:
- Replace direct Payment Link redirect with edge function call
- Call `supabase.functions.invoke('create-payment', { body: { sermon_id: id } })`
- Redirect to the returned checkout URL

### Step 3: Update Config
Add the function to `supabase/config.toml`

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/create-payment/index.ts` | **Create** - Edge function for dynamic checkout sessions |
| `supabase/config.toml` | **Modify** - Register the new function |
| `src/pages/SlideEditor.tsx` | **Modify** - Use edge function instead of static Payment Link |

## Key Code Details

The edge function will:
- NOT require authentication (guest checkout)
- Use `mode: "payment"` for one-time purchase
- Set success_url dynamically based on request origin
- Use the existing price ID: `price_1SqEznP2Yr0z0IcsXrxP90T7`

The frontend will:
- Still store `pending_payment_sermon_id` in localStorage before redirect
- Handle errors gracefully with toast notifications

## Benefits Over Static Payment Link
- Full control over redirect URLs
- Can pass sermon_id for better cancel URL handling
- No manual Stripe Dashboard configuration needed
- Easier to update in the future

