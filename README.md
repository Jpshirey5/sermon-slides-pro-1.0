# Sermon Slide Pro

Sermon Slide Pro is a React and Vite application for building sermon presentations with guided onboarding, scripture lookup, slide editing, subscription management, and export workflows.

This repository contains the web app, the supporting Supabase configuration, and the edge functions used for billing, account operations, and supporting services.

## Stack

- React 18
- Vite 5
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth, Database, and Edge Functions
- Stripe
- Cloudflare Wrangler

## Core Features

- Marketing landing page with pricing and conversion flows
- Email and invite-based signup/login with Supabase Auth
- Email confirmation and password reset flows
- Guided product tour across dashboard, creator, and editor
- Sermon creation flow with title, translation, points, and verse lookup
- Slide editor and saved presentation dashboard
- Subscription management and Stripe checkout handoff
- Export-related services for PowerPoint and ProPresenter

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- npm for local development
- Bun for the Cloudflare deploy scripts in `package.json`

### Install

```sh
git clone <your-repo-url>
cd sermon-slides-pro-1.0
npm install
```

### Run the app locally

```sh
npm run dev
```

The Vite dev server runs locally and uses frontend environment variables from a local `.env` file.

## Available Scripts

- `npm run dev` starts the local Vite dev server
- `npm run build` creates a production build
- `npm run build:dev` creates a development-mode build
- `npm run preview` previews the production build locally
- `npm run lint` runs ESLint
- `bun run deploy` builds the app and deploys with Wrangler
- `bun run preview:cf` builds the app and starts Wrangler dev for Cloudflare preview behavior

## Environment Variables

Use `.env.example` as the template for your local `.env` file. The real `.env` should stay local and should not be committed.

- `VITE_SITE_URL`
- `VITE_STRIPE_PAYMENT_LINK`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`

Notes:

- `VITE_*` variables are exposed to the frontend bundle and should only contain public values.
- Supabase service-role keys, Stripe secrets, Resend API keys, webhook secrets, and similar credentials should not live in the frontend `.env`.
- Secrets for server-side API calls should be configured in your server runtime, not in frontend `VITE_*` variables.
- Scripture lookup uses the Supabase `scripture-lookup` Edge Function in both local development and production.
- The frontend only needs public Supabase app config to call the scripture lookup route. It should not contain Bible API keys.
- `VITE_SITE_URL` should match the canonical app URL used for auth-related redirects in production.

Supabase scripture function secret setup:

```sh
npx supabase secrets set \
  BIBLE_API_KEY=your-api-bible-key \
  BIBLE_API_BASE_URL=https://rest.api.bible/v1 \
  BIBLE_ID_CSB=your-csb-bible-id \
  BIBLE_ID_NIV=your-niv-bible-id \
  BIBLE_ID_NKJV=your-nkjv-bible-id \
  ESV_API_KEY=your-esv-api-key
```

## Auth and Billing Notes

- Supabase handles signup, login, email confirmation, and password reset.
- The app uses a dedicated `/auth/confirm` route for email confirmation.
- Password resets route through `/reset-password`.
- The app includes a global `PASSWORD_RECOVERY` redirect safeguard so Supabase recovery sessions are pushed onto `/reset-password` even if the initial landing route is different.
- Team invites are created in the app, but the email is now delivered through Supabase Auth's invite template.
- New Supabase invite acceptance routes through `/auth/confirm` and then into the signup page to finish name and password setup.
- Stripe checkout is initiated through the app and Supabase Edge Functions, not directly from the email template.
- Active subscription changes from the Account page are handled through the Stripe billing portal via the `customer-portal` Edge Function.
- The Stripe billing portal configuration must have subscription update options enabled for the supported plan prices if you want in-app plan changes to work.
- If auth emails are pointing to the wrong host, check Supabase `Authentication -> URL Configuration` and the confirm-signup email template.

## Auth Email Setup

Sermon Slide Pro now uses two coordinated email paths:

- Supabase Auth emails via custom SMTP for:
  - confirm signup
  - recovery
  - invite
- App-managed invite creation and pending invite tracking in the database
- Transactional Resend API email for owner-driven team-member removal notices

The app assumes the following route alignment in production:

- confirm signup -> `/auth/confirm`
- invite -> `/auth/confirm`
- recovery -> `/reset-password`

Required public/frontend variables:

- `VITE_SITE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Required server-side/runtime variables:

- `SITE_URL` for edge-function invite redirect fallback
- `SUPABASE_SERVICE_ROLE_KEY` for the `send-invite` function
- `RESEND_API_KEY` for team-member removal emails
- `RESEND_FROM_EMAIL` for team-member removal emails
- `RESEND_FROM_NAME` optional sender name override for team-member removal emails
- `SUPPORT_CONTACT_EMAIL` optional override for contact-form submissions, defaults to `support@sermonslidepro.com`
- `BETA_EMAIL_WORKER_SECRET` for the daily beta lifecycle email worker
- `FINALIZE_ACCOUNT_DELETIONS_SECRET` for the daily account deletion finalizer
- `PENDING_SIGNUP_CLEANUP_SECRET` for the daily abandoned signup cleanup worker

Supabase Dashboard requirements:

- `Authentication -> URL Configuration`
  - Site URL must be `https://www.sermonslidepro.com` in production
  - Redirect URLs must allow:
    - `https://www.sermonslidepro.com/auth/confirm`
    - `https://www.sermonslidepro.com/reset-password`
    - `https://www.sermonslidepro.com/admin/accept-invite`
    - Cloudflare preview URLs only when intentionally testing preview deployments
- `Authentication -> Email Templates`
  - Confirm signup should use the app confirmation route
  - Recovery should use the app reset-password route
  - Invite should use the branded Supabase invite template
- `Authentication -> SMTP Settings`
  - configured to use Resend SMTP

Use the hosted public logo URL in Supabase email templates rather than local image assets:

- `https://hqtcgynnnghxihvykrin.supabase.co/storage/v1/object/public/Branding/Sermon%20Slide%20Pro%20logo%20Transparent.png`

Recommended direct-app template link patterns:

- Confirm signup:
  - `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
- Recovery:
  - `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`
- Invite:
  - `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`

With the current app:

- signup passes `redirectTo` as the full `/auth/confirm` route
- recovery passes `redirectTo` as the full `/reset-password` route
- team invites pass `redirectTo` as the full `/auth/confirm` route
- invited team members finish setup on `/signup?invite=complete` after email confirmation
- owners can remove non-owner team members from the Account page, which deletes that user login and emails a removal notice
- contact form submissions are sent through the `contact-support` Edge Function to `support@sermonslidepro.com` unless `SUPPORT_CONTACT_EMAIL` is set
- contact form submissions validate the sender email domain server-side using DNS; clearly invalid domains are blocked, but temporary DNS lookup failures do not block sends

### Scheduled Operations

These scheduled jobs are required for beta/offboarding operations. Configure them in Supabase scheduled functions, an external cron, or another secure scheduler.

Daily beta lifecycle emails:

- Function URL: `https://hqtcgynnnghxihvykrin.supabase.co/functions/v1/process-beta-trial-emails`
- Method: `POST`
- Cadence: once daily
- Required header: `x-worker-secret: <BETA_EMAIL_WORKER_SECRET>`
- Purpose: sends beta Day 10, Day 25, and Day 30 emails through Resend, then records the sent timestamp on the account.

Daily account deletion finalizer:

- Function URL: `https://hqtcgynnnghxihvykrin.supabase.co/functions/v1/finalize-account-deletions`
- Method: `POST`
- Cadence: once daily
- Required header: `x-finalize-secret: <FINALIZE_ACCOUNT_DELETIONS_SECRET>`
- Purpose: permanently finalizes due organization deletion requests after the grace/billing-term window.

Daily pending signup cleanup:

- Function URL: `https://hqtcgynnnghxihvykrin.supabase.co/functions/v1/cleanup-pending-signups`
- Method: `POST`
- Cadence: once daily
- Required header: `x-cleanup-secret: <PENDING_SIGNUP_CLEANUP_SECRET>`
- Purpose: deletes abandoned owner signups that are still `pending_checkout` after the safe cleanup window.

These functions intentionally reject requests without their configured scheduler secret. Do not put the Supabase service-role key in client-side code or frontend environment variables.

## Deployment

This project is deployed as a Vite app with Cloudflare Wrangler.

Scripture lookup backend:

- The frontend always calls the Supabase `scripture-lookup` Edge Function.
- The same Supabase route is used in both local development and production.
- Cloudflare/Wrangler continues to deploy the frontend app, but it is not part of the scripture lookup backend path.

Typical deploy flow:

```sh
bun install --frozen-lockfile
bun run build
bun run deploy
```

Operational requirements:

- Cloudflare/Wrangler must be configured for the target environment.
- Supabase URL Configuration must use the correct production domain.
- Supabase email templates must align with the app’s confirmation route.
- Stripe-related Supabase Edge Functions must have the required environment secrets configured.
- Stripe billing portal settings must allow customer subscription updates for the plan prices used in this app.

## Project Structure

- `src/pages` route-level screens such as landing, dashboard, auth, creator, and editor
- `src/components` shared UI, onboarding, layout, and feature components
- `src/lib` application utilities for exports, monitoring, product tours, auth helpers, pricing, and data flows
- `src/contexts` shared state providers such as authentication
- `supabase/functions` edge functions for checkout, subscription checks, invites, telemetry, and supporting integrations
- `supabase/migrations` database migration history

## Operational Notes

- Auth confirmation and password reset depend on correct Supabase Dashboard configuration.
- Stripe checkout depends on the related Supabase Edge Functions and their secrets being configured correctly.
- Invite delivery depends on the `send-invite` Edge Function and its email provider configuration.
- The README documents the current repo behavior and scripts; if deployment or auth configuration changes, this file should be updated alongside those changes.
