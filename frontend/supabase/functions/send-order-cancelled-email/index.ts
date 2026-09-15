// 客人自行取消訂單（前台／會員介面）時寄出的取消通知信。
// 僅供服務端（service role）呼叫；後台人員取消不會走這支函式，因此不會寄信。
// 實際組信／寄送／寫 log 的邏輯統一放在 _shared/orderCancelledEmail.ts，與 cron 共用。
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendOrderCancelledEmail, type CancelKind } from "../_shared/orderCancelledEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  orderId?: string;
  orderNumber?: string;
  cancelledBy?: string;
  reason?: string | null;
  chargedFee?: number;
  refunded?: number;
  needManual?: boolean;
  triggerSource?: string;
  cancelKind?: CancelKind;
  deadlineText?: string | null;
  previewTo?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token !== SERVICE_KEY) return json({ success: false, error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body.orderId && !body.orderNumber) return json({ success: false, error: "order required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const result = await sendOrderCancelledEmail(supabase, {
      orderId: body.orderId,
      orderNumber: body.orderNumber,
      reason: body.reason ?? null,
      chargedFee: body.chargedFee,
      refunded: body.refunded,
      needManual: body.needManual,
      triggerSource: body.triggerSource,
      cancelKind: body.cancelKind,
      deadlineText: body.deadlineText ?? null,
      previewTo: body.previewTo,
    });

    if (!result.ok) return json({ success: false, error: result.error }, result.status);
    if (result.skipped) return json({ success: true, skipped: result.skipped });
    if (body.previewTo?.trim()) {
      return json({ success: true, preview: true, subject: result.subject, html: result.html });
    }
    return json({ success: true });
  } catch (e) {
    console.error("[send-order-cancelled-email] error", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
