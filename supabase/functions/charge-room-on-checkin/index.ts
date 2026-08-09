// charge-room-on-checkin
// 入住當天自動以已綁定的卡片 token 收取房費（Pay by Card Token）。
// batch 模式由 cron 於台灣時間每日 00:30 呼叫，處理「今天入住」且 room_charge_status = 'card_bound' 的訂單。
// 也支援單筆手動觸發（後台）：{ orderId: "..." }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { payByCardToken } from "../_shared/tappay.ts";
import { taipeiToday } from "../_shared/cancellationPolicy.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  resolveCaller,
  canEditModule,
  isSuperAdmin,
  forbiddenResponse,
  unauthorizedResponse,
} from "../_shared/authz.ts";

async function chargeOne(supabase: any, orderId: string, triggerSource: string, performedBy: string | null) {
  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
  const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
  if (!partnerKey || !merchantId) throw new Error("TapPay credentials not configured");

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, accommodation_id, order_number, order_status, payment_status, final_price, paid_amount, room_charge_status",
    )
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { success: false, message: "找不到訂單" };
  if (order.order_status === "cancelled") return { success: false, message: "訂單已取消，不執行扣款" };
  if (order.room_charge_status === "charged" || order.payment_status === "paid") {
    return { success: true, alreadyCharged: true, message: "訂單已付款" };
  }
  if (order.room_charge_status !== "card_bound") {
    return { success: false, message: "此訂單未綁卡，無法自動扣款" };
  }

  const amount = Math.round((order.final_price || 0) - (order.paid_amount || 0));
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, message: "應扣款金額無效" };
  }

  const { data: tokenRow } = await supabase
    .from("deposit_card_tokens")
    .select("*")
    .eq("order_id", order.id)
    .eq("purpose", "room_charge")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tokenRow) return { success: false, message: "找不到有效的綁卡資料" };

  const result = await payByCardToken({
    partnerKey,
    merchantId,
    cardKey: tokenRow.card_key,
    cardToken: tokenRow.card_token,
    amount,
    details: `房費 - 訂單 ${order.order_number}`,
    orderNumber: `ROOM-${order.order_number}`,
  });

  console.log("[charge-room-on-checkin] TapPay", {
    orderNumber: order.order_number,
    amount,
    status: result.status,
    msg: result.msg,
  });

  await supabase.from("deposit_charges").insert({
    order_id: order.id,
    accommodation_id: order.accommodation_id,
    card_token_id: tokenRow.id,
    action: "room_charge",
    amount,
    status: result.success ? "success" : "failed",
    trigger_source: triggerSource,
    rec_trade_id: result.recTradeId ?? null,
    webhook_status: result.success ? "pending" : "failed",
    needs_manual_review: !result.success,
    error_message: result.success ? null : (result.msg || `TapPay error ${result.status}`),
    performed_by: performedBy,
  });


  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  if (result.success) {
    const { data: cur } = await supabase.from("orders").select("notes").eq("id", order.id).single();
    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        paid_amount: (order.paid_amount || 0) + amount,
        payment_method: "信用卡（入住當天扣款）",
        room_charge_status: "charged",
        room_charge_at: new Date().toISOString(),
        room_charge_rec_trade_id: result.recTradeId ?? null,
        room_charge_error: null,
        notes: `${cur?.notes ? cur.notes + "\n" : ""}🔒 ${stamp} 入住日自動扣款成功 NT$${amount.toLocaleString()}（TapPay 交易 ${result.recTradeId}）`,
      })
      .eq("id", order.id);

    await supabase.from("deposit_card_tokens").update({ is_active: false }).eq("id", tokenRow.id);

    return { success: true, amount, recTradeId: result.recTradeId };
  }

  const { data: cur } = await supabase.from("orders").select("notes").eq("id", order.id).single();
  await supabase
    .from("orders")
    .update({
      room_charge_status: "failed",
      room_charge_error: result.msg || `TapPay error ${result.status}`,
      notes: `${cur?.notes ? cur.notes + "\n" : ""}🔒 ${stamp} 入住日自動扣款失敗：${result.msg || result.status}（請於現場改收款）`,
    })
    .eq("id", order.id);

  return { success: false, message: result.msg || "扣款失敗", errorCode: result.status };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorize caller: service-role (cron) is trusted; everyone else must be
    // staff/admin with edit rights on the order's accommodation.
    const auth = await resolveCaller(req);
    if (!auth.ok) return unauthorizedResponse(corsHeaders, auth.error);
    const ctx = auth.ctx;
    const performedBy: string | null = ctx.userId;

    if (body?.orderId) {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("accommodation_id")
        .eq("id", body.orderId)
        .maybeSingle();
      if (!orderRow) return json({ success: false, message: "找不到訂單" });
      if (!(await canEditModule(ctx, orderRow.accommodation_id, "orders"))) {
        return forbiddenResponse(corsHeaders);
      }
      const r = await chargeOne(supabase, body.orderId, body.triggerSource ?? "manual", performedBy);
      return json(r);
    }

    // batch path: service-role / super_admin only
    if (!isSuperAdmin(ctx)) return forbiddenResponse(corsHeaders);



    // batch：處理「今天（含以前遺漏）入住」且已綁卡尚未扣款的訂單
    const today = taipeiToday();
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number")
      .lte("room_charge_scheduled_date", today)
      .eq("room_charge_status", "card_bound")
      .neq("order_status", "cancelled");

    if (error) throw error;

    const results = [];
    for (const o of orders ?? []) {
      const r = await chargeOne(supabase, o.id, "scheduled", null);
      results.push({ orderNumber: o.order_number, ...r });
    }

    console.log("[charge-room-on-checkin] batch done", { date: today, processed: results.length });
    return json({ success: true, date: today, processed: results.length, results });
  } catch (e) {
    console.error("[charge-room-on-checkin] error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ success: false, message: "自動扣款處理失敗", technicalMessage: msg }, 500);
  }
});
