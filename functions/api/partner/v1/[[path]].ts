// Cloudflare Pages Function: /api/partner/v1/* → Supabase partner-api.
// (Workers deploys use worker/index.ts instead; both share worker/partner-proxy.ts.)
import { handlePartnerProxy } from "../../../../worker/partner-proxy";

export const onRequest = async (context: { request: Request; env: { SUPABASE_URL?: string } }) =>
  (await handlePartnerProxy(context.request, context.env.SUPABASE_URL)) ??
  new Response("Not found", { status: 404 });
