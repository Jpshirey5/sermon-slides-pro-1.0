# Supabase Auth Email Setup

This app uses Supabase Auth for:

- signup confirmation
- password recovery
- team invites

SMTP delivery is expected to run through Resend from the Supabase dashboard. The app itself does not send Supabase Auth emails directly.

## Current Flow Map

### Confirm signup

- Triggered from `src/pages/SignUp.tsx`
- Uses `emailRedirectTo` with the app route `/auth/confirm`
- Email is sent by Supabase Auth through configured SMTP

### Password recovery

- Triggered from `src/pages/ForgotPassword.tsx`
- Uses `redirectTo` with the app route `/reset-password`
- Email is sent by Supabase Auth through configured SMTP

### Team invites

- Invite records are created in `account_invites`
- `supabase/functions/send-invite/index.ts` now asks Supabase Auth admin to send the invite email
- Supabase sends the invite using the invite template through configured SMTP
- Invite acceptance lands on `/auth/confirm`, then routes invited users into `/signup?invite=complete`
- The signup page pre-fills the invited email and organization, then collects full name and password to finish setup
- Owner-driven member removal emails are separate transactional Resend API emails handled by `supabase/functions/remove-team-member/index.ts`

## Environment Mapping

### Frontend/public values

- `VITE_SITE_URL`
  - canonical app origin used for auth redirect generation
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Edge Function / server values

- `SITE_URL`
  - fallback origin for invite redirects in edge functions
- `SUPABASE_SERVICE_ROLE_KEY`
  - required by `send-invite` to call `auth.admin.inviteUserByEmail`
- `RESEND_API_KEY`
  - required by `remove-team-member` to send removal notices
- `RESEND_FROM_EMAIL`
  - sender address for team-member removal notices
- `RESEND_FROM_NAME`
  - optional sender-name override for team-member removal notices

### Supabase dashboard values

- SMTP host
- SMTP port
- SMTP username
- SMTP password
- sender name
- sender email
- Site URL
- Redirect URLs
- auth email templates

## Supabase Dashboard Values

Use these values in Supabase Authentication SMTP settings:

- Sender name: `Sermon Slide Pro`
- Sender email: `no-reply@yourdomain.com`
- SMTP host: `smtp.resend.com`
- SMTP port: `465`
- SMTP username: `resend`
- SMTP password: use your Resend SMTP/API secret stored in the dashboard, not in frontend code

## Template Alignment

These templates should be configured in Supabase:

- Confirm signup
- Recovery
- Invite

Recommended link patterns inside Supabase templates:

- Confirm signup:
  - `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
- Recovery:
  - `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`
- Invite:
  - `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`

Current app redirect targets:

- signup confirmation sends `redirectTo` to `/auth/confirm`
- password recovery sends `redirectTo` to `/reset-password`
- team invites send `redirectTo` to `/auth/confirm`
- invite completion continues on `/signup?invite=complete`

Use the hosted logo URL in the templates:

- `https://hqtcgynnnghxihvykrin.supabase.co/storage/v1/object/public/Branding/Sermon%20Slide%20Pro%20logo%20Transparent.png`

Do not assume local or bundled images can be used in emails.

## Production Checklist

- `VITE_SITE_URL` matches the production app URL
- `SITE_URL` matches the production app URL for functions
- Supabase Site URL matches the production app URL
- Supabase Redirect URLs include production auth routes
- No auth emails point to localhost
- Confirm signup lands on `/auth/confirm`
- Invite lands on `/auth/confirm`
- Recovery lands on `/reset-password`
- Invited users land on the signup page with organization and email prefilled after accepting the invite
- Owner-driven team-member removal emails have valid `RESEND_API_KEY` and `RESEND_FROM_EMAIL` secrets configured
