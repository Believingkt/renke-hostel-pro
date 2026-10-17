// PAYUNi 代理商 Notify（商店狀態、支付工具、商店／後台設定、交易類事件）。一律回 200 純文字 OK。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPayuniConfig } from "../_shared/payuni.ts";
import { sendPaymentAlertEmail } from "../_shared/paymentAlert.ts";
import { handleAgentNotify } from "../_shared/payuniMerchantHandlers.ts";

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Supabase env not configured");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    return await handleAgentNotify(req, {
      admin,
      config: getPayuniConfig(),
      sendAlert: (subject, html) => sendPaymentAlertEmail(admin, subject, html),
    });
  } catch (e) {
    console.error(`[payuni-agent-notify] ${e instanceof Error ? e.message : e}`);
    return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
});
