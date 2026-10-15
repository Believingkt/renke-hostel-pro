// Fin Agent API webhook → LINE Push
// 驗證：X-Fin-Agent-API-Webhook-Signature = HMAC-SHA256(raw body, FIN_WEBHOOK_SECRET)；未設 secret 時退回 FIN_CALLBACK_TOKEN（手測用）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCallback } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) => handleCallback(req, {
  db,
  webhookSecret: Deno.env.get("FIN_WEBHOOK_SECRET") || undefined,
  callbackToken: Deno.env.get("FIN_CALLBACK_TOKEN") || undefined,
  butlerToken: Deno.env.get("LINE_BUTLER_ACCESS_TOKEN") ?? Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? null,
}));
