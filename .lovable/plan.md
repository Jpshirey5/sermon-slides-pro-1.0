

# Plan: Use Resend's Free Test Domain for Invite Emails

## The Good News

You already have a `RESEND_API_KEY` configured and the `send-invite` function is set up with Resend. The only issue is the `from` address — it currently uses `noreply@sermonslides.com`, which requires a verified domain.

Resend provides a free testing sender address: `onboarding@resend.dev`. It works immediately with no domain setup, but has one limitation: **it can only send to the email address associated with your Resend account**.

This is perfect for building and testing the full flow. When you're ready to go live with a real domain, you just change one line.

## Change

### Update `supabase/functions/send-invite/index.ts`

Change the `from` field from:
```
"SermonSlides <noreply@sermonslides.com>"
```
to:
```
"SermonSlides <onboarding@resend.dev>"
```

That's it — one line change, then redeploy the function.

## Testing Limitation

With `onboarding@resend.dev`, Resend will only deliver emails to the email address on your Resend account. So to test, invite that specific email address. Once you verify a custom domain in Resend later, swap the `from` address and you can send to anyone.

