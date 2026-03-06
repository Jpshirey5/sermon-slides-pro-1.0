# Plan: Remove Training Creator, Wire Up Supabase for Sermons & Orgs, Add Invites, Fix Password Reset

## Summary

Five workstreams: (1) strip Training Creator, (2) add org fields to signup and accounts table, (3) move presentations from localStorage to the existing `sermons` table via the `accounts`/`account_members` infrastructure, (4) build invite flow on Account page, (5) fix password reset.

The good news: the database already has `accounts`, `account_members`, `account_invites`, `sermons` tables with RLS policies and helper functions (`is_account_member`, `is_account_owner`, `get_user_account_id`, `get_invite_by_token`). The frontend just doesn't use any of them yet.

---

## 1. Remove Training Creator

**Files to edit:** `Dashboard.tsx`, `App.tsx`
**Files to delete/ignore:** `ManuscriptGenerator.tsx`, `src/lib/study-guides.ts`

- Remove the Tabs component from Dashboard -- show only the Sermon Slide Creator content directly (no tabs)
- Remove all study guide imports and state from Dashboard
- Remove the `/manuscript` route from App.tsx
- Remove the "Study Guide" button from presentation cards in Dashboard

---

## 2. Add Organization Fields to Sign-Up

**Database migration:**

- Add `city` and `state` columns to `accounts` table (the `name` column already exists, but a new column specifically for the org name)
- Update `handle_new_user()` trigger to auto-create an `accounts` row and an `account_members` row (role=owner) when a new user signs up -- but only if they're not joining via invite

**Sign-Up page (`SignUp.tsx`):**

- Add three new fields: Organization/Church Name, City, State
- Pass org info as `user_metadata` during `signUp()`
- Update `handle_new_user()` to read these from `raw_user_meta_data` and create the account + membership automatically

**Invite sign-up flow:**

- Add a `/signup?invite=TOKEN` route check
- On mount, look up the invite token via `get_invite_by_token` RPC
- If valid, pre-fill org name (read-only) and skip org fields
- After signup, insert the user into `account_members` for that account and delete the invite

---

## 3. Move Presentations to Supabase `sermons` Table

The `sermons` table already exists with: `id`, `account_id`, `created_by_user_id`, `title`, `scripture_reference`, `slides` (jsonb), `background_settings` (jsonb), `font_settings` (jsonb), `created_at`, `updated_at`. RLS policies already restrict to account members.

**Files to edit:** `Dashboard.tsx`, `SlideEditor.tsx`, `CreateSermon.tsx`, `src/lib/presentations.ts`

- Rewrite `src/lib/presentations.ts` to use Supabase queries against `sermons` table instead of localStorage
- Each function becomes async and uses the user's `account_id` (fetched via `get_user_account_id` RPC)
- `CreateSermon.tsx`: on submit, insert into `sermons` table with `account_id` and `created_by_user_id`
- `Dashboard.tsx`: fetch presentations from `sermons` table (all org members see the same list)
- `SlideEditor.tsx`: load/save slides from `sermons` table instead of localStorage
- Store the full slide array in the `slides` jsonb column, and background/font settings in their respective columns

---

## 4. Invite Users from Account Page

**Account page (`Account.tsx`):**

- Add a "Team" section showing current account members (via `get_account_members_for_user` RPC + profiles join)
- Add an "Invite" form: email input + Send button
- On send: insert into `account_invites` with the user's `account_id`, `invited_by`, and `email`
- Create a `send-invite` edge function that emails the invite link (`/signup?invite=TOKEN`)

**Edge function `supabase/functions/send-invite/index.ts`:**

- Receives `{ email, token }` 
- Sends an email with the signup link containing the invite token
- Uses Supabase Auth admin API or a simple email service

---

## 5. Fix Password Reset

The current `ResetPassword.tsx` checks `window.location.hash` for `type=recovery` and listens for `PASSWORD_RECOVERY` auth event. The issue is likely that the Supabase recovery flow uses the hash fragment which may not be detected reliably.

**Fix:**

- In `ResetPassword.tsx`, also parse the URL hash for `access_token` and `refresh_token` and call `supabase.auth.setSession()` to establish the session before allowing password update
- Handle the case where the hash contains recovery params by extracting them and setting the session, then showing the form
- Remove the `isRecovery` gate -- if user lands on `/reset-password` with valid hash params, always show the form

---

## Files Modified


| File                                      | Changes                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `src/pages/Dashboard.tsx`                 | Remove tabs/training, fetch sermons from Supabase                   |
| `src/pages/Account.tsx`                   | Add team members list, invite form, org info display                |
| `src/pages/SignUp.tsx`                    | Add org name/city/state fields, invite token handling               |
| `src/pages/CreateSermon.tsx`              | Save to Supabase instead of localStorage                            |
| `src/pages/SlideEditor.tsx`               | Load/save slides from Supabase                                      |
| `src/pages/ResetPassword.tsx`             | Fix session handling for recovery flow                              |
| `src/lib/presentations.ts`                | Rewrite to async Supabase queries                                   |
| `src/contexts/AuthContext.tsx`            | Add `accountId` to context                                          |
| `src/App.tsx`                             | Remove manuscript route, add invite signup route                    |
| `supabase/functions/send-invite/index.ts` | New edge function for invite emails                                 |
| **Migration**                             | Add `city`, `state` to `accounts`; update `handle_new_user` trigger |
