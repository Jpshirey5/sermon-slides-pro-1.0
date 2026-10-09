// PARTNER API — public handoff endpoint. See ./handler.ts.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleHandoff } from "./handler.ts";

serve((req) => handleHandoff(req));
