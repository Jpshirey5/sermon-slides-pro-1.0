# Presenter

Sermon Slide Pro presents sermons itself. There is no file export. Copyrighted translations are shown only inside the app, as API.Bible's terms require (see `CLAUDE.md`).

## How it fits together

- **Services** (`/dashboard/services`) are an ordered list of items: a sermon, a scripture reading, a logo screen, or a black screen. Items store references and settings, never verse text.
- **The presenter** has two windows:
  - The operator view (`/present/:serviceId`, sign-in required) shows what is on the projector, what is next, and the whole service order.
  - The projector window (`/present/:serviceId/output`) holds no data. It shows the frames the operator sends over a `BroadcastChannel`, and confirms what it put on screen.
- **Scripture** comes from the `service-bundle` edge function, fresh from a 30 day server cache. Text saved inside older sermons is ignored by the presenter.
- **Present from the editor** opens the newest service that already has that sermon, or creates a one-item service for it.

## Rules the code enforces

- Only paying churches can present (Stripe active, trialing, or past due; beta trial; partner billed).
- Cached verse text expires within 30 days. Turning a translation off deletes its cached text at once and the presenter drops it within about a minute.
- Every scripture slide carries its copyright line, and the full notices are on a credits slide and behind the operator's notices button.
- Each time a scripture slide appears on the projector, a FUMS event is queued (it survives going offline) and sent to `fums-report`.
- Text on the projector cannot be selected or copied.

## Where the code lives

- `src/presenter/core`: presenter logic with no React dependency, so a desktop shell can reuse it.
- `src/presenter/ui`, `src/pages/Present.tsx`, `src/pages/PresentOutput.tsx`: the React views.
- `supabase/functions/_shared/scripture`: API.Bible client, cache, expiry, and access rules.
- `supabase/functions/_shared/presenter`: bundle, status, and FUMS logic.
- `supabase/migrations/20261008120000_add_presenter_services_and_scripture_cache.sql`: tables and policies.

## Deploying

Order matters. The app depends on the database and functions being there first.

1. Take a database backup.
2. Apply the migration `20261008120000_add_presenter_services_and_scripture_cache.sql`.
3. Deploy the edge functions `service-bundle`, `presenter-status`, `fums-report`, and the rewritten `scripture-lookup`.
4. Remove the old public ESV proxy from Supabase: `supabase functions delete esv-lookup` (deleting the folder from the repo does not remove the deployed function).
5. Push to GitHub so Cloudflare Pages builds the app.
6. Run the backfill dry run, review it, then apply it:
   `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run --allow-net --allow-env --allow-read scripts/strip-sermon-scripture.ts` (add `--apply` for the real run).

Secrets used: `BIBLE_API_KEY` (already set), `BIBLE_ID_*` (already set), `ESV_API_KEY` (already set), and `FUMS_ENDPOINT` (set it once API.Bible confirms the FUMS endpoint; until then display events are recorded but not forwarded).

After step 3, guests can look up public domain translations only (KJV, WEB, ASV). Copyrighted translations need a signed-in church account.

## Testing

- App: `npx vitest run`
- Server: `deno test -A --no-lock --node-modules-dir=none supabase/functions`
