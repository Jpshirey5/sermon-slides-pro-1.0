// Issue a Partner API key.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno run --allow-net --allow-env scripts/issue-partner-key.ts \
//       --name "Acme Church Software" --slug acme --email dev@acme.com \
//       --hosts app.acme.com,staging.acme.com [--test] [--label "prod key"]
//
// Upserts the partner by slug, generates an API key and a signing secret, stores
// only their sha256 hashes, and prints both plaintexts ONCE. The signing secret
// must then be set as an edge function secret (the printed `supabase secrets set`
// line); the database never holds it.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  randomBase64Url,
  randomHex,
  randomKeyPrefix,
  sha256Hex,
  signingSecretEnvName,
} from "../supabase/functions/_shared/partner/crypto.ts";

interface Args {
  name: string;
  slug: string;
  email: string;
  hosts: string[];
  test: boolean;
  label: string | null;
}

const fail = (message: string): never => {
  console.error(`error: ${message}`);
  Deno.exit(1);
};

const parseArgs = (argv: string[]): Args => {
  const values = new Map<string, string>();
  let test = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--test") {
      test = true;
      continue;
    }
    if (!flag.startsWith("--")) fail(`unexpected argument ${flag}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`${flag} needs a value`);
    values.set(flag.slice(2), value);
    i++;
  }

  const name = values.get("name")?.trim() || fail("--name is required");
  const slug = values.get("slug")?.trim().toLowerCase() || fail("--slug is required");
  const email = values.get("email")?.trim().toLowerCase() || fail("--email is required");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) fail("--slug must be lowercase letters, digits, and dashes");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("--email is not a valid address");

  const hosts = (values.get("hosts") || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    // Bare hostnames only: no scheme, path, port, or wildcard. Matching is exact.
    if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
      fail(`--hosts entry "${host}" must be a bare hostname like app.example.com`);
    }
  }

  return { name, slug, email, hosts, test, label: values.get("label")?.trim() || null };
};

const main = async () => {
  const args = parseArgs(Deno.args);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || fail("SUPABASE_URL is not set");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || fail("SUPABASE_SERVICE_ROLE_KEY is not set");
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: partner, error: partnerError } = await db
    .from("partners")
    .upsert(
      {
        name: args.name,
        slug: args.slug,
        contact_email: args.email,
        is_test: args.test,
        allowed_return_hosts: args.hosts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("id, slug, is_test")
    .single();
  if (partnerError || !partner) fail(`could not upsert partner: ${partnerError?.message}`);

  const prefix = randomKeyPrefix();
  const mode = partner!.is_test ? "test" : "live";
  const apiKey = `ssp_${mode}_${prefix}_${randomBase64Url(32)}`;
  const signingSecret = randomHex(32);

  const { error: keyError } = await db.from("partner_api_keys").insert({
    partner_id: partner!.id,
    key_prefix: prefix,
    key_hash: sha256Hex(apiKey),
    signing_secret_hash: sha256Hex(signingSecret),
    label: args.label,
  });
  if (keyError) fail(`could not store key: ${keyError.message}`);

  const envName = signingSecretEnvName(prefix);
  console.log(`
Partner:        ${args.name} (${partner!.slug}, ${mode})
Partner id:     ${partner!.id}
Return hosts:   ${args.hosts.length ? args.hosts.join(", ") : "(none — return_url will always be rejected)"}

Shown ONCE. Neither value is recoverable; only hashes were stored.

API key:        ${apiKey}
Signing secret: ${signingSecret}

Set the signing secret on the edge functions before the partner's first call:

  npx supabase secrets set ${envName}=${signingSecret}

Env line:
${envName}=${signingSecret}
`);
};

await main();
