// 統一推播出口：依事件組文案，推給該會員所有有效 iOS device token。
// 呼叫方式（服務端）：POST /functions/v1/send-push
//   { orderId, event }                       // 依訂單自動組文案
//   { userId, title, body, data }            // 自訂文案
// event: order_created | payment_success | order_cancelled | checkin_reminder
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getApnsJwt, sendApnsToToken } from "../_shared/apns.ts";

type PushEvent =
  | "order_created"
  | "payment_success"
  | "order_cancelled"
  | "checkin_reminder";

interface Body {
  orderId?: string;
  userId?: string;
  event?: PushEvent;
  title?: string;
  body?: string;
  amount?: number;
  data?: Record<string, unknown>;
}

const money = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const input: Body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId = input.userId ?? null;
    let title = input.title ?? "";
    let body = input.body ?? "";
    const data: Record<string, unknown> = { ...(input.data ?? {}) };

    if (input.orderId) {
      const { data: order } = await supabase
        .from("orders")
        .select(
          "id, order_number, member_id, accommodation_id, check_in_date, final_price, paid_amount, refunded_amount, atm_vacc_no, atm_vacc_bank_code, atm_expire_at",
        )
        .eq("id", input.orderId)
        .maybeSingle();

      if (!order) return json({ success: false, reason: "order_not_found" }, 404);

      if (!userId && order.member_id) {
        const { data: member } = await supabase
          .from("platform_members")
          .select("user_id")
          .eq("id", order.member_id)
          .maybeSingle();
        userId = member?.user_id ?? null;
      }

      const { data: acc } = await supabase
        .from("accommodation_info")
        .select("name")
        .eq("id", order.accommodation_id)
        .maybeSingle();
      const accName = acc?.name || "民宿";

      let checkInTime = "15:00";
      const { data: bs } = await supabase
        .from("booking_settings")
        .select("check_in_time")
        .eq("accommodation_id", order.accommodation_id)
        .maybeSingle();
      if (bs?.check_in_time) checkInTime = String(bs.check_in_time).slice(0, 5);

      data.orderId = order.id;
      data.orderNumber = order.order_number;

      switch (input.event) {
        case "order_created": {
          title = "✅ 訂房成功";
          body = `${accName} ${formatDate(order.check_in_date)} 入住，期待您的到來！`;
          if (order.atm_vacc_no) {
            const expire = order.atm_expire_at
              ? new Date(order.atm_expire_at).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
              : "";
            body += `\n💳 ATM 轉帳帳號 ${order.atm_vacc_bank_code ?? ""}-${order.atm_vacc_no}` +
              (expire ? `，請於 ${expire} 前完成繳費` : "");
          }
          break;
        }
        case "payment_success":
          title = "付款成功";
          body = `已收到您的付款 ${money(input.amount ?? order.paid_amount ?? 0)}，訂單已確認`;
          break;
        case "order_cancelled": {
          const refunded = input.amount ?? order.refunded_amount ?? 0;
          title = "訂單已取消";
          body = refunded > 0
            ? `訂單已取消，退款 ${money(refunded)} 將依發卡行作業時間入帳`
            : "您的訂單已取消，如有疑問請與我們聯繫";
          break;
        }
        case "checkin_reminder":
          title = "明天入住提醒";
          body = `明天入住 ${accName}！入住時間 ${checkInTime}，祝旅途愉快 🏡`;
          break;
        default:
          if (!title || !body) return json({ success: false, reason: "missing_event" }, 400);
      }
    }

    if (!userId) return json({ success: false, reason: "no_user" }, 200);
    if (!title || !body) return json({ success: false, reason: "missing_content" }, 400);

    const { data: tokens } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("is_active", true);

    console.log("[send-push]", {
      event: input.event,
      orderId: input.orderId,
      userId,
      tokenCount: tokens?.length ?? 0,
      tokens: (tokens ?? []).map((t) => String(t.token).slice(0, 8)),
      host: Deno.env.get("APNS_ENV") === "sandbox" ? "sandbox" : "production",
      topic: Deno.env.get("APNS_TOPIC") || "com.lakeze.booking",
    });

    if (!tokens || tokens.length === 0) {
      return json({ success: true, sent: 0, reason: "no_tokens" });
    }


    let jwt: string;
    try {
      jwt = await getApnsJwt();
    } catch (_e) {
      console.warn("[send-push] APNs 尚未設定，略過推播");
      return json({ success: false, reason: "apns_not_configured" }, 200);
    }

    const results = await Promise.all(
      tokens.map((t) => sendApnsToToken(t.token, { title, body, data }, jwt)),
    );

    const invalid = results.filter((r) => r.invalidToken).map((r) => r.token);
    if (invalid.length > 0) {
      await supabase
        .from("device_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("token", invalid);
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).map((r) => ({ status: r.status, reason: r.reason }));
    if (failed.length) console.error("[send-push] failures", failed);

    return json({ success: true, sent, invalidated: invalid.length, failed });
  } catch (e) {
    console.error("[send-push] error", e);
    return json(
      { success: false, error: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});
