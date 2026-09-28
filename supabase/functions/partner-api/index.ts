// PARTNER API — Sermon Slide Pro Partner API v1 (polling only).
// Auth, signing, rate limits, idempotency, and logging live in
// _shared/partner/auth.ts (withPartner); routes are in ./routes.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handlePartnerRequest } from "./router.ts";

serve((req) => handlePartnerRequest(req));
