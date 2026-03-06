

# Plan: Fix Invite Flow — No Auto-Created Users, Add Duplicate Check

## Problem
The current `send-invite` edge function calls Supabase's `/auth/v1/invite` endpoint, which **creates a user in `auth.users`** with no name or password. This is undesired — we want the invite to only send a link, and the user is created only when they complete the signup form.

## Changes

### 1. Rewrite `send-invite` edge function
**File:** `supabase/functions/send-invite/index.ts`

- Remove the call to `/auth/v1/invite` entirely (this is what creates the ghost user)
- Instead, use Supabase Auth Admin's `generateLink` API for a magic link or simply construct the signup URL and use a basic email sending approach
- Since we don't have Resend or a custom email provider, the simplest approach: use Supabase's built-in SMTP by sending a custom email via the Admin API's `POST /auth/v1/admin/generate_link` with `type: magiclink` — but this also creates users
- **Best approach**: Skip Supabase Auth entirely for the invite. Just return the signup link to the frontend and display it as a shareable link. The `account_invites` table record is what matters. The frontend already handles the fallback case where email fails — we just make this the primary flow and always show the link to copy/share.

### 2. Add duplicate user check on signup
**File:** `src/pages/SignUp.tsx`

- Before calling `supabase.auth.signUp()`, check if the email already exists by attempting a lookup
- Use a new RPC function or simply attempt signup and handle the "User already registered" error from Supabase Auth gracefully with a clear message like "This email is already registered. Please log in instead."

### 3. Add duplicate check in invite flow
**File:** `src/pages/Account.tsx`

- Before inserting into `account_invites`, check if a user with that email already exists in `profiles` table
- If they do, show a message: "This user already has an account. Add them directly instead."
- Also check if there's already a pending invite for that email

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/send-invite/index.ts` | Remove `/auth/v1/invite` call; just return the signup link |
| `src/pages/Account.tsx` | Add duplicate email check before creating invite |
| `src/pages/SignUp.tsx` | Handle "already registered" error clearly; add check before signup |

