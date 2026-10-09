# Sermon Slide Pro Partner API

Turn a sermon outline in your product into finished worship slides (ProPresenter 7 and PowerPoint), and send your pastors into Sermon Slide Pro to review them with one click.

- **Base URL:** `https://www.sermonslidepro.com/api/partner/v1`
- **Format:** JSON over HTTPS. Server to server only. Never ship your key to a browser or mobile app.
- **Model:** polling. There are no webhooks. You submit work, then poll the resource until it finishes.
- **Reference:** [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1)

---

## Your first call in five minutes

You will receive three things from us:

| Item | Example | Where it goes |
|---|---|---|
| API key | `ssp_live_k3j9x0aa_Qm9…` | `Authorization: Bearer …` on every request |
| Signing secret | `7f1c…` (64 hex chars) | Your server's secret store. Used to sign every request |
| Allowed return hosts | `app.yourchms.com` | Hosts you may send pastors back to (`return_url`) |

Both the key and the secret are shown once. We keep only hashes, so if you lose either one we issue a new pair.

Keys that start with `ssp_test_` belong to a test partner record, not a separate environment. Test seats, decks, and exports are real, so use your own test email addresses. There is no sandbox.

**1. Save the helper below** (Node or Python) and set `SSP_API_KEY` and `SSP_SIGNING_SECRET`.

**2. Create a theme:**

```js
const theme = await ssp("POST", "/themes", {
  external_theme_id: "grace-dark",
  church_name: "Grace Church",
  config: { background: "#101820", text_color: "#F2AA4C", font_family: "Georgia", default_translation: "NIV" },
});
console.log(theme.status, theme.body.theme_id); // 201 "8b0c…"
```

If you get `201`, your key, signature, and clock are all working. If you get `401`, see [Errors](#errors).

---

## Authentication and request signing

Every request needs three headers:

```
Authorization: Bearer ssp_live_<prefix>_<secret>
X-SSP-Timestamp: 1790000000
X-SSP-Signature: 5d41402abc4b2a76b9719d911017c592…
```

- `X-SSP-Timestamp` is the current Unix time in **seconds**. We reject anything more than 300 seconds from our clock, so keep NTP running.
- `X-SSP-Signature` is the lowercase hex HMAC-SHA256 of the **signature base string**, keyed with your signing secret.

### The signature base string

```
<timestamp> + "." + <METHOD> + "." + <pathname> + "." + <rawBody>
```

| Part | Rule |
|---|---|
| `timestamp` | Exactly the value you send in `X-SSP-Timestamp` |
| `METHOD` | Uppercase: `GET`, `POST`, `DELETE` |
| `pathname` | The path you request, starting `/api/partner/v1/`, **without** the query string. Sign it exactly as sent, including any percent-encoding |
| `rawBody` | The exact bytes you send as the body. **Empty string for GET and DELETE.** Sign the serialized string you send, not an object you re-serialize later |

Example for `POST /api/partner/v1/themes` at time `1790000000` with body `{"external_theme_id":"t1","church_name":"Grace"}`:

```
1790000000.POST./api/partner/v1/themes.{"external_theme_id":"t1","church_name":"Grace"}
```

### Node helper (Node 18+, no dependencies)

```js
import crypto from "node:crypto";

const BASE = "https://www.sermonslidepro.com";
const API_KEY = process.env.SSP_API_KEY;
const SIGNING_SECRET = process.env.SSP_SIGNING_SECRET;

export async function ssp(method, path, body, { idempotencyKey } = {}) {
  const pathname = `/api/partner/v1${path}`;
  const rawBody = method === "GET" || method === "DELETE" ? "" : JSON.stringify(body ?? {});
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(`${timestamp}.${method}.${pathname}.${rawBody}`)
    .digest("hex");

  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    "X-SSP-Timestamp": timestamp,
    "X-SSP-Signature": signature,
  };
  if (rawBody) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: rawBody || undefined });
  return { status: res.status, requestId: res.headers.get("x-request-id"), body: await res.json() };
}
```

### Python helper (3.8+, `requests`)

```python
import hashlib, hmac, json, os, time
import requests

BASE = "https://www.sermonslidepro.com"
API_KEY = os.environ["SSP_API_KEY"]
SIGNING_SECRET = os.environ["SSP_SIGNING_SECRET"].encode()

def ssp(method, path, body=None, idempotency_key=None):
    pathname = f"/api/partner/v1{path}"
    raw_body = "" if method in ("GET", "DELETE") else json.dumps(body or {}, separators=(",", ":"))
    timestamp = str(int(time.time()))
    base = f"{timestamp}.{method}.{pathname}.{raw_body}".encode()
    signature = hmac.new(SIGNING_SECRET, base, hashlib.sha256).hexdigest()

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "X-SSP-Timestamp": timestamp,
        "X-SSP-Signature": signature,
    }
    if raw_body:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    res = requests.request(method, BASE + pathname, headers=headers, data=raw_body.encode() if raw_body else None)
    return res.status_code, res.headers.get("X-Request-Id"), res.json()
```

Send `raw_body` itself as the body (`data=`), not `json=`. Letting `requests` re-serialize the object changes the bytes and breaks the signature.

---

## The full flow

```
Your app                                  Sermon Slide Pro
────────                                  ────────────────
POST /themes            (once per church)
POST /accounts          (once per pastor)
POST /decks  ─────────────────────────────▶ generate slides
GET  /decks/{id}  … poll until "ready"
POST /sessions ──▶ redirect pastor to url ─▶ pastor reviews, edits,
                                             clicks "Approve and send back"
return_url?ssp_deck_id=… ◀────────────────── browser comes back to you
POST /decks/{id}/exports
GET  /exports/{id} … poll until "ready" ──▶ download .probundle / .pptx
```

Every id you send can be yours: seats are addressed by your `external_user_id`, themes by your `external_theme_id`. You can use our ids (`ssp_user_id`, `theme_id`) wherever you'd use yours.

### 1. Create a theme (once per church)

`POST /themes` creates or updates by `external_theme_id` and always returns `201`.

```json
{
  "external_theme_id": "grace-dark",
  "church_name": "Grace Church",
  "config": {
    "background": "#101820",
    "text_color": "#F2AA4C",
    "accent_color": "#FFFFFF",
    "font_family": "Georgia",
    "logo_url": "https://cdn.gracechurch.org/logo.png",
    "default_translation": "NIV"
  }
}
```

```json
{
  "theme_id": "8b0c5a4e-2f61-4c8e-9a0f-3c1d2b7e6a11",
  "external_theme_id": "grace-dark",
  "church_name": "Grace Church",
  "config": { "background": "#101820", "text_color": "#F2AA4C", "accent_color": "#FFFFFF", "font_family": "Georgia", "logo_url": "https://cdn.gracechurch.org/logo.png", "default_translation": "NIV" },
  "created_at": "2026-09-25T14:02:11.482Z",
  "updated_at": "2026-09-25T14:02:11.482Z"
}
```

`config` is strict: unknown keys are rejected. Every field is optional. Colors are hex. `logo_url` must be https. `accent_color` and `logo_url` are stored but not rendered on slides yet.

### 2. Provision the pastor (once per pastor)

`POST /accounts`

```json
{
  "external_user_id": "chms-user-4821",
  "email": "pastor.pat@gracechurch.org",
  "name": "Pat Rivera",
  "church_name": "Grace Church",
  "role": "Lead Pastor",
  "theme_id": "grace-dark",
  "send_welcome_email": false
}
```

`201 Created` for a new seat, `200 OK` if this `external_user_id` already has one. Safe to call on every login.

```json
{
  "ssp_user_id": "3f2b9c1e-7d44-4a8b-b1e2-9c0a5d6f7e81",
  "external_user_id": "chms-user-4821",
  "email": "pastor.pat@gracechurch.org",
  "entitlement": "core",
  "entitlement_status": "active",
  "theme_id": "8b0c5a4e-2f61-4c8e-9a0f-3c1d2b7e6a11",
  "provisioned_at": "2026-09-25T14:03:40.117Z",
  "created": true
}
```

- If the email is new to us, we create a Sermon Slide Pro account with no password. The pastor signs in through your app (step 4). With `send_welcome_email: true` we also email them a link to set a password so they can sign in directly.
- If the pastor already has a Sermon Slide Pro account, we **link** it: their password, billing history, and existing decks are untouched, and your entitlement is added.
- If that email is already linked to one of your seats under a different `external_user_id`, you get `409 email_conflict`.
- While the seat is active, the pastor is never asked to pay us. You are billed per your agreement.

`GET /accounts/{id}` returns the same shape plus `decks_generated_total` and `last_active_at`.

`DELETE /accounts/{id}/entitlement` ends your entitlement. **It never deletes the pastor's account, decks, or exports**; they keep their account and can sign in directly. Calling it again returns `200` with no change. Calling `POST /accounts` again later reactivates the seat.

### 3. Submit a sermon

`POST /decks` with either structured `points`:

```json
{
  "external_user_id": "chms-user-4821",
  "title": "Anchored",
  "scripture_ref": "Hebrews 6:19",
  "service_date": "2026-10-04",
  "translation": "NIV",
  "theme_id": "grace-dark",
  "big_idea": "Hope holds when everything else moves",
  "points": [
    { "heading": "Hope is a person", "refs": ["John 14:6"] },
    { "heading": "Hope is a promise", "refs": ["Romans 8:28", "2 Corinthians 1:20"] },
    { "heading": "Hope is a practice", "refs": [] }
  ]
}
```

or the manuscript as `raw_text` (we find the points and references for you):

```json
{
  "external_user_id": "chms-user-4821",
  "title": "Rest for the Weary",
  "raw_text": "Come to me, all you who are weary (Matthew 11:28)…"
}
```

Send one or the other, not both.

```json
{ "deck_id": "5bf6c2ec-331b-423b-b6b6-355ea54760e8", "status": "queued", "source": "points", "poll_after_ms": 3000 }
```

Defaults: `translation` falls back to the theme's `default_translation`, then `NIV`. `theme_id` falls back to the seat's theme. `service_date` falls back to today. Translations: `KJV NKJV NIV CSB ESV WEB ASV AMP RVR1960 NVI LSG LUT ALMEIDA`. Some translations are licensed per church; a reference we can't fetch in the requested translation appears in `completeness.unresolved_verses`.

### 4. Poll the deck

`GET /decks/{deck_id}` until `status` is `ready` or `failed`.

```json
{
  "deck_id": "5bf6c2ec-331b-423b-b6b6-355ea54760e8",
  "status": "ready",
  "slide_count": 9,
  "completeness": {
    "score": 0.86,
    "total_points": 3,
    "points_with_slides": 3,
    "total_refs": 4,
    "resolved_refs": 3,
    "unresolved_verses": ["2 Corinthians 1:20"],
    "points_without_slides": [],
    "formula": "(points_with_slides + resolved_refs) / (total_points + total_refs), clamped to 0..1, rounded to 2 places; 1.0 when the denominator is 0"
  },
  "thumbnails": [],
  "approved_at": null,
  "created_at": "2026-09-25T14:05:02.901Z",
  "error": null,
  "poll_after_ms": null
}
```

`completeness` is `null` until the deck is ready. The score is deterministic arithmetic, not a model's opinion, so you can show it to pastors ("3 of 4 verses found"). `thumbnails` is currently always empty.

### 5. Send the pastor in to review

`POST /sessions`

```json
{
  "external_user_id": "chms-user-4821",
  "deck_id": "5bf6c2ec-331b-423b-b6b6-355ea54760e8",
  "return_url": "https://app.yourchms.com/sermons/991/slides"
}
```

```json
{
  "url": "https://www.sermonslidepro.com/handoff?t=Qm9vZ…",
  "expires_at": "2026-09-25T14:11:40.000Z",
  "expires_in": 300
}
```

Redirect the pastor's browser to `url` **right away**. It signs them in and opens the deck. The link works **once** and expires after 300 seconds, so mint it when the pastor clicks, never ahead of time. Don't put it in an email. A used or expired link sends the pastor to our login page, which tells them to click your button again.

`return_url` is optional. It must be `https` and its host must be on your allowlist exactly (no wildcards, no ports, no credentials). Anything else is `400 invalid_return_url`. When `return_url` is set, the deck editor shows **Approve and send back**. Clicking it saves the pastor's edits, marks the deck approved, starts a `pro7` + `pptx` export (unless you already have an export of those exact slides), and sends the browser to:

```
https://app.yourchms.com/sermons/991/slides?ssp_deck_id=5bf6c2ec-331b-423b-b6b6-355ea54760e8
```

We do not call you. When the browser returns, `GET /decks/{id}` shows `approved_at`.

### 6. Export

`POST /decks/{deck_id}/exports` once the deck is `ready` (otherwise `409 deck_not_ready`):

```json
{ "formats": ["pro7", "pptx"] }
```

```json
{ "export_id": "679b3a95-0a69-4ece-98a9-bd9014245a15", "deck_id": "5bf6c2ec-331b-423b-b6b6-355ea54760e8", "status": "queued", "poll_after_ms": 5000 }
```

Exports use the deck's current slides, including the pastor's edits. `pdf` is reserved and not available yet (`422`).

`GET /exports/{export_id}`:

```json
{
  "export_id": "679b3a95-0a69-4ece-98a9-bd9014245a15",
  "deck_id": "5bf6c2ec-331b-423b-b6b6-355ea54760e8",
  "status": "ready",
  "files": [
    { "format": "pro7", "url": "https://…/pro7.probundle?token=…&download=Anchored.probundle", "bytes": 48213, "expires_at": "2026-10-02T14:07:19.000Z" },
    { "format": "pptx", "url": "https://…/pptx.pptx?token=…&download=Anchored.pptx", "bytes": 91877, "expires_at": "2026-10-02T14:07:19.000Z" }
  ],
  "error": null,
  "poll_after_ms": null
}
```

Download URLs are signed for 7 days and re-signed on every `GET`. Don't store them; store the `export_id` and fetch fresh URLs when needed. A `.probundle` imports directly into ProPresenter 7.

---

## Polling

- Wait `poll_after_ms` before the next `GET`: 3000 for decks, 5000 for exports. `poll_after_ms: null` means the resource is finished (`ready` or `failed`).
- Structured decks usually finish in seconds. `raw_text` decks run a language model over the manuscript and can take a minute or more.
- Stop after about 3 minutes and treat the deck as failed. We also mark anything stuck for 10 minutes (15 for exports) as `failed`.
- On `failed`, `error` says what to do, usually "submit again". Submitting again creates a new deck.
- Polling counts against your rate limit, so one poller per resource.

---

## Errors

Every error has the same shape, and every response (success or error) has an `X-Request-Id` header:

```json
{ "error": { "code": "invalid_signature", "message": "Signature does not match the request.", "request_id": "req_4f1c9a0b2e7d6c5a8b3f1e20" } }
```

Branch on `code`, never on `message`.

| HTTP | `code` | What happened | What to do |
|---|---|---|---|
| 401 | `unauthorized` | Key missing, malformed, revoked, or a `ssp_test_` key on a live partner (or the reverse) | Check the `Authorization` header. Ask us for a new key if yours was revoked |
| 401 | `invalid_signature` | Signature doesn't match | Check the base string: uppercase method, path without query string, the exact body bytes you sent, empty body for GET/DELETE |
| 401 | `timestamp_skew` | `X-SSP-Timestamp` is missing or more than 300 s from our clock | Send Unix **seconds**, not milliseconds. Sync your server clock |
| 429 | `rate_limited` | Over your per-minute request limit | Wait for `Retry-After` (60 s), then retry |
| 422 | `validation_failed` | A field is missing or invalid (the message names it), or an `Idempotency-Key` was reused with a different body | Fix the field. Use a new key for a new request |
| 404 | `account_not_provisioned` | No seat with that id for your partner | `POST /accounts` first |
| 409 | `account_already_exists` | Reserved | — |
| 409 | `email_conflict` | That email is already linked to another of your seats | Use the existing seat's `external_user_id`, or give this person a different email |
| 403 | `entitlement_inactive` | The seat was revoked | `POST /accounts` again to reactivate, if they should have access |
| 404 | `deck_not_found` | No deck with that id for your partner | Check the id. Another partner's deck looks exactly like a missing one |
| 409 | `deck_not_ready` | Export requested before the deck is `ready` | Poll the deck, then export |
| 404 | `export_not_found` | No export with that id for your partner | Check the id |
| 404 | `theme_not_found` | No theme with that id for your partner | `POST /themes` first, or fix the id |
| 400 | `invalid_return_url` | `return_url` isn't https, or its host isn't on your allowlist | Use an allowlisted https URL. Ask us to add hosts |
| 413 | `payload_too_large` | Body over 1 MB | Trim `raw_text` (max 200,000 characters) |
| 429 | `quota_exceeded` | Daily deck limit reached (rolling 24 hours) | Wait, or ask us to raise it |
| 500 | `internal_error` | Our fault | Retry with backoff and the same `Idempotency-Key`. If it persists, send us the `request_id` |

A request to a path that doesn't exist returns `404` (or `405` for the wrong method) with code `route_not_found`.

---

## Idempotency

Send an `Idempotency-Key` header (any unique string up to 255 printable ASCII characters, e.g. a UUID) on `POST` requests you might retry:

- Same key and same body within 30 days: you get the **original response replayed byte-for-byte**, with `Idempotent-Replayed: true`. No second deck, export, or theme write.
- Same key, different body: `422 validation_failed`.
- Responses with status 500 are not stored, so a retry after a 500 really runs again.
- Keys are scoped to your partner.

`POST /accounts` is idempotent on `external_user_id` even without a key. `POST /sessions` ignores the header on purpose: every call mints a fresh single-use link.

---

## Limits

| Limit | Default |
|---|---|
| Requests per minute, per partner | 120 |
| Decks created per rolling 24 hours, per partner | 200 |
| Request body | 1 MB |
| `raw_text` | 200,000 characters |
| Points per deck | 30 |
| References per point | 20 |
| Handoff link lifetime | 300 seconds, single use |
| Export download URL lifetime | 7 days (re-signed on each `GET /exports/{id}`) |
| Timestamp tolerance | ±300 seconds |

Need higher limits? Ask us.

---

## Security checklist

- Keep the API key and signing secret on your servers only. We never ask for them in email or chat.
- Mint `POST /sessions` links on click and redirect immediately.
- Treat `ssp_deck_id` on your `return_url` as a hint. Confirm with `GET /decks/{id}` (it's scoped to you) before acting on it.
- If a key or secret may have leaked, tell us. We revoke the key and issue a new pair.

## Support

Contact us through https://www.sermonslidepro.com/contact and include the `request_id` from the response. We can trace any request from its id.
