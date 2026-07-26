// 寄送「訂單確認信」— 內容完整複製會員端訂單詳情頁。
// 觸發：訂房完成後自動寄出（由 _shared/sendBookingEmail.ts 呼叫），或會員在訂單詳情頁按「重新傳送信件」。

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildOrderConfirmationEmail } from "../_shared/orderConfirmationEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 簡易限流：同一訂單 60 秒內最多 3 封
const rateMap = new Map<string, { count: number; resetTime: number }>();
const RATE_MAX = 3;
const RATE_WINDOW = 60 * 1000;

function allowed(key: string): boolean {
  const now = Date.now();
  const rec = rateMap.get(key);
  if (!rec || now > rec.resetTime) {
    rateMap.set(key, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  if (rec.count >= RATE_MAX) return false;
  rec.count++;
  return true;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body?.orderNumber || "").trim();
    const triggerSource = String(body?.triggerSource || "auto");
    const siteUrl = typeof body?.siteUrl === "string" ? body.siteUrl : undefined;

    if (!orderNumber || orderNumber.length < 5) {
      return json({ success: false, error: "無效的訂單編號" }, 400);
    }
    if (!allowed(`order:${orderNumber}`)) {
      return json({ success: false, error: "寄送過於頻繁，請稍後再試" }, 429);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 服務端呼叫（service role）直接放行；帶使用者 JWT 時需驗證 Email 與訂單相符
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceCall = token === SERVICE_KEY;

    const { data: orderRow } = await supabase
      .from("orders")
      .select("guest_email")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (!orderRow) return json({ success: false, error: "找不到指定的訂單" }, 404);

    if (!isServiceCall) {
      const { data: userData } = await supabase.auth.getUser(token);
      const userEmail = userData?.user?.email?.toLowerCase();
      if (!userEmail) return json({ success: false, error: "請先登入" }, 401);
      if (userEmail !== (orderRow.guest_email || "").toLowerCase()) {
        return json({ success: false, error: "此訂單不屬於目前登入的帳號" }, 403);
      }
    }

    const built = await buildOrderConfirmationEmail(supabase, orderNumber, { siteUrl });
    if ("error" in built) {
      const map: Record<string, [string, number]> = {
        order_not_found: ["找不到指定的訂單", 404],
        no_email: ["此訂單未填寫 Email", 400],
      };
      const [msg, status] = map[built.error] || ["組信失敗", 500];
      return json({ success: false, error: msg }, status);
    }

    // 預覽模式：只回傳 HTML，不實際寄送
    if (body?.preview === true) {
      return new Response(built.html, {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (!RESEND_API_KEY) {
      console.error("[send-order-confirmation] RESEND_API_KEY missing");
      return json({ success: false, error: "郵件服務尚未設定" }, 500);
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "人客多通知 <noreply@sensaninn.lakeze.com>",
        to: [built.to],
        subject: built.subject,
        html: built.html,
      }),
    });

    const respText = await resp.text();
    if (!resp.ok) {
      console.error(`[send-order-confirmation] resend failed [${resp.status}]: ${respText}`);
      return json({ success: false, error: "寄送失敗", details: respText }, resp.status);
    }

    console.log(
      `[send-order-confirmation] sent order=${orderNumber} to=${built.to} source=${triggerSource}`,
    );
    return json({ success: true, message: "訂單確認信已寄出", to: built.to });
  } catch (e) {
    console.error("[send-order-confirmation] exception", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
