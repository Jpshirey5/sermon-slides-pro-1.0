import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Supabase Database Webhook -> HubSpot contact sync.
 *
 * Triggered by webhooks on these tables:
 *   - public.profiles        INSERT (a new user finished signing up)
 *                            DELETE (a contact was removed in the app)
 *   - public.account_invites INSERT (an org owner invited a teammate)
 *   - public.accounts        DELETE (an org was removed in the app)
 *
 * INSERT: the payload only carries the changed row, so we enrich it with a
 * service-role lookup to resolve the organization name and city/state, then
 * upsert the contact into HubSpot via the CRM v3 API (search-by-email, then
 * PATCH if found / POST if not).
 *
 * DELETE: we never hard-delete in HubSpot (that loses history). Instead we find
 * the Contact (by email) or Company (by name) and PATCH a custom status property
 * to "inactive". The property must exist on the object in HubSpot first.
 *
 * Schema mapping (see migrations for source of truth):
 *   profiles.full_name        -> firstname / lastname (split)
 *   profiles.email            -> email
 *   accounts.name             -> "organization" -> HubSpot `company`
 *   accounts.city / .state    -> "address"      -> HubSpot `city` / `state`
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

// Custom property (must exist on BOTH the Contact and Company objects in HubSpot)
// that we set to "inactive" when the corresponding row is deleted in the app.
const STATUS_PROPERTY = "sermon_slide_status";
// Must match the dropdown option values defined on the HubSpot property exactly.
const STATUS_ACTIVE = "Active";
const STATUS_INACTIVE = "Inactive";

type WebhookPayload = {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
  // Maintenance actions (not part of the DB webhook shape):
  action?: "reconcile-contacts" | "list-properties";
  dryRun?: boolean;
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
  // A synced contact is, by definition, an active member of the platform.
  const props: Record<string, string> = { email: fields.email, [STATUS_PROPERTY]: STATUS_ACTIVE };
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

const updateCompany = async (token: string, id: string, properties: Record<string, string>) => {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot company update failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
};

/**
 * Handle a DELETE: flag the matching HubSpot record inactive instead of removing it.
 *   - accounts -> Company (matched by name)
 *   - profiles / other contact tables -> Contact (matched by email)
 * Returns a small result describing what was touched (or why it was skipped).
 */
const markInactiveForDelete = async (
  token: string,
  table: string,
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (table === "accounts") {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return { skipped: true, reason: "Deleted account has no name" };
    const companyId = await searchCompanyByName(token, name);
    if (!companyId) return { skipped: true, reason: "No matching HubSpot company" };
    await updateCompany(token, companyId, { [STATUS_PROPERTY]: STATUS_INACTIVE });
    return { object: "company", id: companyId, status: STATUS_INACTIVE };
  }

  const email = normalizeEmail(record.email);
  if (!email) return { skipped: true, reason: "Deleted record has no email" };
  const contactId = await searchContactByEmail(token, email);
  if (!contactId) return { skipped: true, reason: "No matching HubSpot contact" };
  await updateContact(token, contactId, { [STATUS_PROPERTY]: STATUS_INACTIVE });
  return { object: "contact", id: contactId, status: STATUS_INACTIVE };
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

/** Page through every HubSpot contact, returning id + email + current status. */
const listAllContacts = async (
  token: string,
): Promise<Array<{ id: string; email: string; status: string }>> => {
  const out: Array<{ id: string; email: string; status: string }> = [];
  let after: string | undefined;
  do {
    const url = new URL(`${HUBSPOT_BASE}/crm/v3/objects/contacts`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", `email,${STATUS_PROPERTY}`);
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`HubSpot contact list failed (${res.status}): ${await res.text()}`);
    }
    const body = await res.json();
    for (const r of body?.results ?? []) {
      out.push({
        id: r.id,
        email: normalizeEmail(r.properties?.email),
        status: (r.properties?.[STATUS_PROPERTY] as string) ?? "",
      });
    }
    after = body?.paging?.next?.after;
  } while (after);
  return out;
};

/** Every email that currently belongs to the platform: real users + pending invites. */
const loadActiveEmailSet = async (admin: SupabaseAdmin): Promise<Set<string>> => {
  const set = new Set<string>();
  for (const table of ["profiles", "account_invites"]) {
    const { data, error } = await admin.from(table).select("email");
    if (error) {
      console.error(`Active-email lookup failed for ${table}:`, error);
      continue;
    }
    for (const row of data ?? []) {
      const email = normalizeEmail((row as { email: unknown }).email);
      if (email) set.add(email);
    }
  }
  return set;
};

/**
 * Reconcile every HubSpot contact's status against the DB: contacts whose email
 * is still in the platform -> "active", everyone else (left/deleted) -> "inactive".
 * Only PATCHes when the status actually needs to change. dryRun reports without writing.
 */
const reconcileContactStatuses = async (
  token: string,
  admin: SupabaseAdmin,
  dryRun: boolean,
): Promise<Record<string, unknown>> => {
  const activeEmails = await loadActiveEmailSet(admin);
  const contacts = await listAllContacts(token);

  let toActivate = 0;
  let toDeactivate = 0;
  const willInactivate: string[] = [];

  for (const c of contacts) {
    if (!c.email) continue;
    const desired = activeEmails.has(c.email) ? STATUS_ACTIVE : STATUS_INACTIVE;
    if (c.status === desired) continue;

    if (desired === STATUS_ACTIVE) toActivate++;
    else {
      toDeactivate++;
      if (willInactivate.length < 50) willInactivate.push(c.email);
    }
    if (!dryRun) {
      await updateContact(token, c.id, { [STATUS_PROPERTY]: desired });
    }
  }

  return {
    dryRun,
    totalHubspotContacts: contacts.length,
    activeEmailsInDb: activeEmails.size,
    changedToActive: toActivate,
    changedToInactive: toDeactivate,
    inactiveEmails: willInactivate,
  };
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

  try {
    // Diagnostic: list contact/company property internal names matching "status"/"sermon".
    if (payload.action === "list-properties") {
      const out: Record<string, string[]> = {};
      for (const obj of ["contacts", "companies"]) {
        const res = await fetch(`${HUBSPOT_BASE}/crm/v3/properties/${obj}`, {
          headers: { Authorization: `Bearer ${hubspotToken}` },
        });
        if (!res.ok) {
          out[obj] = [`ERROR ${res.status}: ${(await res.text()).slice(0, 200)}`];
          continue;
        }
        const body = await res.json();
        out[obj] = (body?.results ?? [])
          .filter((p: { name: string }) => /sermon/i.test(p.name))
          .map((p: { name: string; type: string; fieldType: string; options?: Array<{ value: string }> }) =>
            `${p.name} [${p.fieldType}] options=${(p.options ?? []).map((o) => o.value).join("|")}`
          );
      }
      return json({ success: true, properties: out }, 200);
    }

    // Maintenance: one-off reconcile of every contact's active/inactive status.
    if (payload.action === "reconcile-contacts") {
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = await reconcileContactStatuses(hubspotToken, admin, payload.dryRun === true);
      return json({ success: true, ...result }, 200);
    }

    // DELETE: flag the matching HubSpot record inactive (no DB enrichment needed).
    if (payload.type === "DELETE") {
      const deleted = payload.old_record ?? payload.record;
      if (!deleted) {
        return json({ skipped: true, reason: "No row on DELETE event" }, 200);
      }
      const result = await markInactiveForDelete(hubspotToken, payload.table, deleted);
      return json({ success: true, ...result }, 200);
    }

    if (payload.type !== "INSERT" || !payload.record) {
      // Not an event we handle — acknowledge so the webhook isn't retried.
      return json({ skipped: true, reason: "Unhandled event type" }, 200);
    }

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
