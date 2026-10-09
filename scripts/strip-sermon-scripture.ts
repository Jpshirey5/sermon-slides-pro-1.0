// Remove stored verse text from existing sermons (API.Bible licensing: store
// references, not text). New saves already strip it; this cleans up old rows.
//
// Dry run first (changes nothing, prints counts):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno run --allow-net --allow-env --allow-read scripts/strip-sermon-scripture.ts
//
// Then, after taking a database backup and reviewing the dry run:
//   ... scripts/strip-sermon-scripture.ts --apply
//
// Safe to run more than once. A sermon a pastor saves during the run is
// skipped, not overwritten; run again to pick it up. Scripture slides with no
// readable reference keep their text and are listed in the report.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { type BackfillDb, formatReport, runBackfill, type SermonRow } from "./strip-sermon-scripture-lib.ts";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
const unknown = Deno.args.filter((a) => a !== "--apply");
if (unknown.length) {
  console.error(`error: unexpected argument ${unknown[0]}`);
  Deno.exit(1);
}
const apply = Deno.args.includes("--apply");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const db: BackfillDb = {
  async page(afterId, limit) {
    let q = admin.from("sermons").select("id, account_id, title, slides, updated_at").order("id").limit(limit);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q;
    if (error) throw new Error(`could not read sermons: ${error.message}`);
    return (data ?? []) as SermonRow[];
  },
  async update(id, slides, expectedUpdatedAt) {
    const { data, error } = await admin
      .from("sermons")
      .update({ slides })
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .select("id");
    if (error) throw new Error(`could not update sermon ${id}: ${error.message}`);
    return (data ?? []).length === 1;
  },
};

const report = await runBackfill(db, { apply });
console.log(formatReport(report));
