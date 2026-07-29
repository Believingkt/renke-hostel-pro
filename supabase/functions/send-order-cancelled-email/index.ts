// 客人自行取消訂單（前台／會員介面）時寄出的取消通知信。
// 僅供服務端（service role）呼叫；後台人員取消不會走這支函式，因此不會寄信。
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token !== SERVICE_KEY) return json({ success: false, error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body.orderId && !body.orderNumber) return json({ success: false, error: "order required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let q = supabase
      .from("orders")
      .select(
        "id, order_number, guest_name, guest_email, accommodation_id, check_in_date, check_out_date, guest_count, final_price, paid_amount, room_types(name)",
      );
    q = body.orderId ? q.eq("id", body.orderId) : q.eq("order_number", body.orderNumber!);
    const { data: order } = await q.maybeSingle();

    if (!order) return json({ success: false, error: "order_not_found" }, 404);
    if (!order.guest_email) return json({ success: true, skipped: "no_email" });

    let accName = "";
    let accPhone = "";
    let accEmail = "";
    if (order.accommodation_id) {
      const { data: acc } = await supabase
        .from("accommodation_info")
        .select("name, phone, email")
        .eq("id", order.accommodation_id)
        .maybeSingle();
      accName = acc?.name ?? "";
      accPhone = acc?.phone ?? "";
      accEmail = acc?.email ?? "";
    }

    const roomName = (order as any).room_types?.name ?? "";
    const fee = Number(body.chargedFee || 0);
    const refunded = Number(body.refunded || 0);
    const subject = `${accName ? `【${accName}】` : ""}訂單已取消 - 訂單編號 ${order.order_number}`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Microsoft JhengHei',Arial,sans-serif;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);color:#fff;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;font-size:26px;">訂單已取消</h1>
      ${accName ? `<p style="margin:10px 0 0 0;font-size:16px;opacity:.95;">${esc(accName)}</p>` : ""}
    </div>
    <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;">
      <p style="font-size:16px;">親愛的 ${esc(order.guest_name)} 您好，</p>
      <p>我們已依您的要求取消以下訂單：</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">訂單編號</td><td style="text-align:right;font-weight:600;padding:12px 0;">${esc(order.order_number)}</td></tr>
        ${roomName ? `<tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">房型</td><td style="text-align:right;font-weight:600;padding:12px 0;">${esc(roomName)}</td></tr>` : ""}
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">原訂日期</td><td style="text-align:right;font-weight:600;padding:12px 0;">${esc(order.check_in_date)} → ${esc(order.check_out_date)}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">訂單總額</td><td style="text-align:right;font-weight:600;padding:12px 0;">NT$ ${Number(order.final_price || 0).toLocaleString()}</td></tr>
      </table>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;">
        <p style="margin:0 0 8px 0;font-weight:700;color:#b91c1c;">取消結果</p>
        <p style="margin:4px 0;font-size:15px;">取消手續費：<strong>NT$ ${fee.toLocaleString()}</strong></p>
        <p style="margin:4px 0;font-size:15px;">退款金額：<strong>NT$ ${refunded.toLocaleString()}</strong></p>
        ${body.needManual ? `<p style="margin:10px 0 0 0;font-size:14px;color:#b91c1c;">部分款項需由客服人員人工處理，我們將盡快與您聯繫。</p>` : ""}
        ${refunded > 0 ? `<p style="margin:10px 0 0 0;font-size:13px;color:#666;">退款將由原付款管道退回，實際入帳時間依發卡銀行作業為準（約 3～10 個工作天）。</p>` : ""}
      </div>

      ${body.reason ? `<p style="margin-top:20px;color:#666;font-size:14px;">取消原因：${esc(body.reason)}</p>` : ""}

      ${(accPhone || accEmail) ? `
      <div style="margin-top:24px;padding:20px;background:#f8f9fa;border-radius:8px;border-left:4px solid #dc2626;">
        <p style="margin:0 0 12px 0;font-weight:600;">如有任何疑問，歡迎聯繫${accName ? ` ${esc(accName)}` : ""}：</p>
        ${accPhone ? `<p style="margin:6px 0;color:#666;">📞 ${esc(accPhone)}</p>` : ""}
        ${accEmail ? `<p style="margin:6px 0;color:#666;">📧 ${esc(accEmail)}</p>` : ""}
      </div>` : ""}

      <p style="margin-top:20px;color:#666;">期待未來有機會為您服務。</p>
    </div>
    <div style="background:#f8f9fa;padding:20px;text-align:center;color:#666;border-radius:0 0 10px 10px;">
      <p style="margin:0;font-size:14px;">此為系統自動發送的郵件，請勿直接回覆</p>
    </div>
  </div>
</body></html>`;

    if (!RESEND_API_KEY) return json({ success: false, error: "email_not_configured" }, 500);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "人客多通知 <noreply@sensaninn.lakeze.com>",
        to: [order.guest_email],
        subject,
        html,
      }),
    });
    const text = await resp.text();

    try {
      await supabase.from("booking_email_log").insert({
        order_id: order.id,
        order_number: order.order_number,
        email_type: "order_cancelled",
        recipient: order.guest_email,
        subject,
        status: resp.ok ? "sent" : "failed",
        error_message: resp.ok ? null : text.slice(0, 1000),
        trigger_source: body.triggerSource || "member_cancel",
      });
    } catch (logErr) {
      console.error("[send-order-cancelled-email] log failed", logErr);
    }

    if (!resp.ok) {
      console.error("[send-order-cancelled-email] resend failed", resp.status, text);
      return json({ success: false, error: text }, 502);
    }
    return json({ success: true });
  } catch (e) {
    console.error("[send-order-cancelled-email] error", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
