# Sermon Slide Pro: standing rules

## Product direction
- The in-app presenter is the only delivery path. Pastors write and present inside SSP.
- All translations are supported inside SSP. Copyrighted translations are display-only in our app.
- No file export (.pro7, PowerPoint) and no delivery of scripture to partner platforms.
- Sunday reliability is the product: offline cache, display control, and no surprises are priorities.

## Licensing rules (API.Bible, confirmed in writing)
- Copyrighted translations may only be displayed by SSP itself. Never write their text to any file and never send it to another app or platform.
- Stored scripture must be refreshed within 30 days and purgeable within 72 hours of a license ending.
- Licensed text must be protected against copying and bulk extraction.
- Every scripture display is reported through FUMS.
- Show the translation's copyright and attribution wherever its text appears. Full notice reachable in the app.
- The API.Bible key stays on the server. Never ship it in a client.
- Prefer storing references over verse text.

## Lyrics rules
- Never ship or distribute licensed song lyrics ourselves.
- Churches import lyrics under their own CCLI license. We also support public domain hymns and original songs.

## IP rules
- Do not copy ProPresenter code, assets, file formats, or UI trade dress. Our own design and data model only.

## Working style
- Plan first, then implement one small step at a time and stop for review.
- Plain language in all copy and docs. No em dashes.
- Add tests for expiry and revocation.
- If existing code conflicts with these rules, flag it instead of working around it.

## Stack
Vite + React Router single-page app, served by Cloudflare Pages (push to GitHub, Pages builds from the repo; wrangler is not used). Server code runs in Supabase Edge Functions (Deno) on Supabase Postgres. Stripe for billing, Resend for email, AWS Bedrock for AI. Desktop shell (Electron) comes later and loads the same React code.
