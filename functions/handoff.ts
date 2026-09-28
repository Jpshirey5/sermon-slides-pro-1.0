// Cloudflare Pages Function: /handoff?t=... → Supabase partner-handoff.
// Exact path only; /handoff/complete is the SPA page and is served as usual.
import { handlePartnerProxy } from "../worker/partner-proxy";

export const onRequest = async (context: { request: Request; env: { SUPABASE_URL?: string }; next: () => Promise<Response> }) =>
  (await handlePartnerProxy(context.request, context.env.SUPABASE_URL)) ?? context.next();
