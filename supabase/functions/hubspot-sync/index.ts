import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Supabase Database Webhook -> HubSpot contact sync.
 *
 * Triggered by INSERT webhooks on two tables:
 *   - public.profiles        (a new user finished signing up)
 *   - public.account_invites (an org owner invited a teammate)
 *
 * The webhook payload only carries the changed row, so we enrich it with a
 * service-role lookup to resolve the organization name and city/state, then
 * upsert the contact into HubSpot via the CRM v3 API (search-by-email, then
 * PATCH if found / POST if not).
 *
 * Schema mapping (see migrations for source of truth):
 *   profiles.full_name        -> firstname / lastname (split)
 *   profiles.email            -> email
 *   accounts.name             -> "organization" -> HubSpot `company`
 *   accounts.city / .state    -> "address"      -> HubSpot `city` / `state`
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

type ContactFields = {
  email: string;
  firstName: string;
  lastName: string;
  organization: string;
  city: string;
  state: string;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Split a single "full_name" into first / last for HubSpot's firstname/lastname. */
const splitFullName = (fullName: unknown): { firstName: string; lastName: string } => {
  const name = typeof fullName === "string" ? fullName.trim() : "";
  if (!name) return { firstName: "", lastName: "" };
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

type SupabaseAdmin = ReturnType<typeof createClient>;

/** Resolve org name + city/state for a given account id. */
const loadAccount = async (admin: SupabaseAdmin, accountId: unknown) => {
  if (typeof accountId !== "string" || !accountId) {
    return { organization: "", city: "", state: "" };
  }
  const { data, error } = await admin
    .from("accounts")
    .select("name, city, state")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    console.error("Account lookup failed:", error);
    return { organization: "", city: "", state: "" };
  }
  return {
    organization: (data?.name as string) ?? "",
    city: (data?.city as string) ?? "",
    state: (data?.state as string) ?? "",
  };
};

/** Find the account a freshly-created profile belongs to (owner or member). */
const loadAccountForUser = async (admin: SupabaseAdmin, userId: unknown) => {
  if (typeof userId !== "string" || !userId) {
    return { organization: "", city: "", state: "" };
  }
  const { data, error } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !data?.account_id) {
    if (error) console.error("Membership lookup failed:", error);
    return { organization: "", city: "", state: "" };
  }
  return loadAccount(admin, data.account_id);
};

/**
 * Build the HubSpot-bound fields from a webhook row, enriching as needed.
 * Returns null when the row carries no usable email (nothing to sync).
 */
const buildContactFields = async (
  admin: SupabaseAdmin,
  table: string,
  record: Record<string, unknown>,
): Promise<ContactFields | null> => {
  const email = normalizeEmail(record.email);
  if (!email) return null;

  if (table === "profiles") {
    const { firstName, lastName } = splitFullName(record.full_name);
    const account = await loadAccountForUser(admin, record.id);
    return { email, firstName, lastName, ...account };
  }

  if (table === "account_invites") {
    // Invitees have no name yet (the row is created before they accept).
    const account = await loadAccount(admin, record.account_id);
    return { email, firstName: "", lastName: "", ...account };
  }

  // Unknown table — sync the email and whatever name we can glean.
  const { firstName, lastName } = splitFullName(record.full_name);
  return { email, firstName, lastName, organization: "", city: "", state: "" };
};

/** Only send properties that actually have a value, so we never clobber HubSpot data with blanks. */
const toHubSpotProperties = (fields: ContactFields): Record<string, string> => {
  const props: Record<string, string> = { email: fields.email };
  if (fields.firstName) props.firstname = fields.firstName;
  if (fields.lastName) props.lastname = fields.lastName;
  if (fields.organization) props.company = fields.organization;
  if (fields.city) props.city = fields.city;
  if (fields.state) props.state = fields.state;
  return props;
};

const searchContactByEmail = async (token: string, email: string): Promise<string | null> => {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
      ],
      properties: ["email"],
      limit: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`HubSpot search failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  return body?.results?.[0]?.id ?? null;
};

const updateContact = async (token: string, id: string, properties: Record<string, string>) => {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot update failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
};

const createContact = async (token: string, properties: Record<string, string>) => {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot create failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
};

const searchCompanyByName = async (token: string, name: string): Promise<string | null> => {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "name", operator: "EQ", value: name }] },
      ],
      properties: ["name"],
      limit: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot company search failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  return body?.results?.[0]?.id ?? null;
};

const createCompany = async (token: string, properties: Record<string, string>): Promise<string> => {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot company create failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.id;
};

/** Link a contact to a company using HubSpot's default contact<->company association. */
const associateContactToCompany = async (token: string, contactId: string, companyId: string) => {
  const res = await fetch(
    `${HUBSPOT_BASE}/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`HubSpot association failed (${res.status}): ${await res.text()}`);
  }
};

/**
 * Ensure a Company record exists for the org name and link the contact to it.
 * Mirrors HubSpot's domain-based auto-association, but works for any org name
 * (including contacts on free email domains like gmail.com that HubSpot skips).
 * Returns the company id, or null if there was no org name to act on.
 */
const ensureCompanyAndAssociate = async (
  token: string,
  contactId: string,
  fields: ContactFields,
): Promise<string | null> => {
  if (!fields.organization) return null;

  let companyId = await searchCompanyByName(token, fields.organization);
  if (!companyId) {
    const companyProps: Record<string, string> = { name: fields.organization };
    if (fields.city) companyProps.city = fields.city;
    if (fields.state) companyProps.state = fields.state;
    companyId = await createCompany(token, companyProps);
  }

  await associateContactToCompany(token, contactId, companyId);
  return companyId;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Database webhooks run with verify_jwt = false, so gate the endpoint with a
  // shared secret. Configure the matching header in the webhook definition.
  const expectedSecret = Deno.env.get("HUBSPOT_SYNC_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const hubspotToken = Deno.env.get("HUBSPOT_TOKEN");
  if (!hubspotToken) {
    console.error("HUBSPOT_TOKEN is not configured");
    return json({ error: "HubSpot sync is not configured" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase service-role configuration is missing");
    return json({ error: "Sync is not configured" }, 500);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (payload.type !== "INSERT" || !payload.record) {
    // Not an insert we care about — acknowledge so the webhook isn't retried.
    return json({ skipped: true, reason: "Not an INSERT event" }, 200);
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const fields = await buildContactFields(admin, payload.table, payload.record);
    if (!fields) {
      return json({ skipped: true, reason: "No email on record" }, 200);
    }

    const properties = toHubSpotProperties(fields);
    const existingId = await searchContactByEmail(hubspotToken, fields.email);

    let contactId: string;
    let action: "created" | "updated";
    if (existingId) {
      await updateContact(hubspotToken, existingId, properties);
      contactId = existingId;
      action = "updated";
    } else {
      const created = await createContact(hubspotToken, properties);
      contactId = created?.id;
      action = "created";
    }

    // Company association is best-effort: a failure here shouldn't fail the
    // already-successful contact sync, so we log and carry on.
    let companyId: string | null = null;
    try {
      if (contactId) {
        companyId = await ensureCompanyAndAssociate(hubspotToken, contactId, fields);
      }
    } catch (companyError) {
      console.error("HubSpot company association failed:", companyError);
    }

    return json(
      { success: true, action, contactId: contactId ?? null, companyId },
      action === "created" ? 201 : 200,
    );
  } catch (error) {
    console.error("HubSpot sync error:", error);
    // 502: the failure is in the upstream HubSpot call / enrichment, not the request.
    return json({ error: "Failed to sync contact to HubSpot" }, 502);
  }
});
