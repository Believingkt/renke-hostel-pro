// Fin（Intercom Custom Channel）outbound callback → LINE Push
// Header: Authorization: Bearer <FIN_CALLBACK_TOKEN> 或 X-Callback-Token／X-Intercom-Token
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCallback } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) => handleCallback(req, {
  db,
  callbackToken: Deno.env.get("FIN_CALLBACK_TOKEN"),
  butlerToken: Deno.env.get("LINE_BUTLER_ACCESS_TOKEN") ?? Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? null,
}));
