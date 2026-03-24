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

The Vite dev server runs locally and uses the frontend environment variables defined in `.env`.

## Available Scripts

- `npm run dev` starts the local Vite dev server
- `npm run build` creates a production build
- `npm run build:dev` creates a development-mode build
- `npm run preview` previews the production build locally
- `npm run lint` runs ESLint
- `bun run deploy` builds the app and deploys with Wrangler
- `bun run preview:cf` builds the app and starts Wrangler dev for Cloudflare preview behavior

## Environment Variables

Current frontend variables are defined in [.env](/Users/johnshirey/Desktop/Replika/sermon-slides-pro-1.0/.env):

- `VITE_SITE_URL`
- `VITE_STRIPE_PAYMENT_LINK`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_BIBLE_API_BASE_URL`
- `VITE_BIBLE_API_KEY`
- `VITE_BIBLE_ID_CSB`
- `VITE_BIBLE_ID_NIV`
- `VITE_BIBLE_ID_NKJV`

Notes:

- `VITE_*` variables are exposed to the frontend bundle and should only contain public values.
- Supabase service-role keys, Stripe secrets, Resend API keys, webhook secrets, and similar credentials should not live in the frontend `.env`.
- Secrets for Edge Functions should be configured in Supabase or your deployment environment.
- `VITE_SITE_URL` should match the canonical app URL used for auth-related redirects in production.

## Auth and Billing Notes

- Supabase handles signup, login, email confirmation, and password reset.
- The app uses a dedicated `/auth/confirm` route for email confirmation.
- Password resets route through `/reset-password`.
- Stripe checkout is initiated through the app and Supabase Edge Functions, not directly from the email template.
- If auth emails are pointing to the wrong host, check Supabase `Authentication -> URL Configuration` and the confirm-signup email template.

## Deployment

This project is deployed as a Vite app with Cloudflare Wrangler.

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
