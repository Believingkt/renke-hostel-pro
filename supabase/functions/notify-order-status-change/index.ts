// 掃描 order_status_change_events 隊列，發送 Email + LINE 給訂單所屬會員
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = "人客多 Lakeze <noreply@lakeze.com>";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const MAX_BATCH = 25;

interface EventRow {
  id: string;
  order_id: string;
  event_type: string;
  sent_email_at: string | null;
  sent_line_at: string | null;
  sent_inapp_at: string | null;
  attempts: number;
}

function buildMessage(order: any, eventType: string): { title: string; body: string } {
  const orderNo = order.order_number;
  const roomName = order.room_types?.name ?? "";
  const base = `【訂單 ${orderNo}】${roomName}\n入住 ${order.check_in_date} ~ ${order.check_out_date}`;

  if (eventType.startsWith("payment_status:paid")) {
    return { title: "訂單付款成功", body: `已收到您的付款，訂單確認完成！\n${base}` };
  }
  if (eventType.startsWith("payment_status:deposit_paid")) {
    return { title: "已收到訂金", body: `已收到您的訂金，餘額請於入住時繳付。\n${base}` };
  }
  if (eventType.startsWith("payment_status:refunded")) {
    return { title: "款項已退回", body: `您的訂單款項已完成退款。\n${base}` };
  }
  if (eventType.startsWith("order_status:cancelled")) {
    return { title: "訂單已取消", body: `您的訂單已取消。如有疑問請聯繫客服。\n${base}` };
  }
  if (eventType.startsWith("order_status:confirmed")) {
    return { title: "訂單已確認", body: `訂單已確認，期待您的入住！\n${base}` };
  }
  return { title: "訂單狀態更新", body: `${eventType}\n${base}` };
}

function extractLineUserId(email: string | null): string | null {
  if (!email) return null;
  const m = email.match(/^line_([A-Za-z0-9_-]+)@line\.lakeze\.local$/);
  return m ? m[1] : null;
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    console.warn("[notify-status] Resend not configured");
    return false;
  }
  try {
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.6;color:#2d3344">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#d07218">${subject}</h2>
  <p>${body.replace(/\n/g, "<br>")}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#6b7280;font-size:12px">此為系統自動發送，請勿直接回覆。</p>
</div></body></html>`;
    const r = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!r.ok) {
      console.error("[notify-status] email fail", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify-status] email throw", e);
    return false;
  }
}

async function sendLine(lineUserId: string, message: string): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-line-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ targets: [lineUserId], message }),
    });
    if (!r.ok) {
      console.error("[notify-status] line fail", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify-status] line throw", e);
    return false;
  }
}

async function processEvent(evt: EventRow): Promise<void> {
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select(`id, accommodation_id, order_number, guest_email, member_id,
             check_in_date, check_out_date,
             room_types ( name )`)
    .eq("id", evt.order_id)
    .maybeSingle();

  if (oErr || !order) {
    await supabase.from("order_status_change_events").update({
      last_error: `order_fetch_failed: ${oErr?.message ?? "not_found"}`,
      attempts: evt.attempts + 1,
    }).eq("id", evt.id);
    return;
  }

  if (!order.member_id) {
    await supabase.from("order_status_change_events").update({
      sent_email_at: new Date().toISOString(),
      sent_line_at: new Date().toISOString(),
      sent_inapp_at: new Date().toISOString(),
      last_error: "no_member",
    }).eq("id", evt.id);
    return;
  }

  const { data: member } = await supabase
    .from("platform_members")
    .select("id, user_id, email, name")
    .eq("id", order.member_id)
    .maybeSingle();

  if (!member) {
    await supabase.from("order_status_change_events").update({
      last_error: "member_not_found",
      attempts: evt.attempts + 1,
    }).eq("id", evt.id);
    return;
  }

  const { title, body } = buildMessage(order, evt.event_type);
  const now = new Date().toISOString();
  const updates: Record<string, string> = {};

  if (!evt.sent_email_at) {
    const isLineEmail = member.email && /^line_.*@line\.lakeze\.local$/.test(member.email);
    const emailTarget = !isLineEmail ? (order.guest_email || member.email) : order.guest_email;
    if (emailTarget) {
      if (await sendEmail(emailTarget, title, body)) updates.sent_email_at = now;
    } else {
      updates.sent_email_at = now;
    }
  }

  const lineUserId = extractLineUserId(member.email);
  if (!evt.sent_line_at) {
    if (lineUserId) {
      if (await sendLine(lineUserId, `${title}\n\n${body}`)) updates.sent_line_at = now;
    } else {
      updates.sent_line_at = now;
    }
  }

  // notifications 表為 staff 用途，此處僅標記 skip 以完成事件
  if (!evt.sent_inapp_at) updates.sent_inapp_at = now;

  await supabase.from("order_status_change_events").update({
    ...updates,
    attempts: evt.attempts + 1,
  }).eq("id", evt.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { data: events, error } = await supabase
    .from("order_status_change_events")
    .select("*")
    .or("sent_email_at.is.null,sent_line_at.is.null,sent_inapp_at.is.null")
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  for (const evt of events ?? []) {
    try { await processEvent(evt as EventRow); processed++; }
    catch (e) { console.error("[notify-status] process error", evt.id, e); }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, remaining: (events?.length ?? 0) === MAX_BATCH }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
