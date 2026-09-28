import { handlePartnerProxy } from "./partner-proxy";

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SUPABASE_URL?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handlePartnerProxy(request, env.SUPABASE_URL)) ?? env.ASSETS.fetch(request);
  },
};
