

# Plan: Send Invite Emails via Resend

## Summary

Rewrite the `send-invite` edge function to actually send an email using Resend, and update `Account.tsx` to call the edge function instead of copying a link to clipboard.

## Prerequisites

You'll need a **Resend API key** and a **verified sender domain** in Resend. The `RESEND_API_KEY` secret is not currently configured — I'll request it during implementation.

## Changes

### 1. Add `RESEND_API_KEY` secret
- Use the secrets tool to request the API key from you

### 2. Rewrite `supabase/functions/send-invite/index.ts`
- Import Resend (`npm:resend@6`)
- After receiving `{ email, token, org_name, invited_by_name }`, construct the signup link and send an HTML email via `resend.emails.send()`
- Email contains a branded message: "You've been invited to join {org_name} on SermonSlides" with a signup button linking to `/signup?invite={token}`
- Return success/error to the frontend

### 3. Update `src/pages/Account.tsx` `handleInvite`
- After inserting the invite into `account_invites`, call `supabase.functions.invoke("send-invite", ...)` with the token, email, org name, and inviter name
- Remove the clipboard copy logic
- Show `toast.success("Invite sent to {email}!")` on success

| File | Change |
|------|--------|
| `supabase/functions/send-invite/index.ts` | Send email via Resend instead of returning link |
| `src/pages/Account.tsx` | Call edge function after creating invite, remove clipboard logic |

