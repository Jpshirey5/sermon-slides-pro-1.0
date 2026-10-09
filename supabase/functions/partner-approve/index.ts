// PARTNER API — "Approve and send back" from the deck editor. See ./handler.ts.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleApprove } from "./handler.ts";

serve((req) => handleApprove(req));
