// 前台（免登入）訂單取消：僅限「尚未完成扣款」且符合免費取消政策的訂單。
// 驗證方式：訂單編號 + (訂購人 Email 或 手機末四碼)。
// 取消後訂單 order_status = cancelled，房間即自動釋放（庫存計算一律排除 cancelled）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { calcCancellationFee, taipeiToday } from "../_shared/cancellationPolicy.ts";

interface Body {
  order_number?: string;
  email?: string;
  phone_last4?: string;
  reason?: string;
  /** 只試算取消政策，不異動資料 */
  quote_only?: boolean;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const orderNumber = (body.order_number || "").trim().toUpperCase();
    if (!orderNumber) return json({ success: false, message: "缺少訂單編號" }, 400, corsHeaders);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, order_number, accommodation_id, guest_email, guest_phone, order_status, payment_status, paid_amount, final_price, check_in_date, notes, room_charge_status",
      )
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (!order) return json({ success: false, message: "查無此訂單" }, 404, corsHeaders);

    const today = taipeiToday();
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("free_cancel_days")
      .eq("accommodation_id", order.accommodation_id)
      .maybeSingle();
    const freeCancelDays = Number(bs?.free_cancel_days ?? 14);
    const quote = calcCancellationFee(
      Number(order.final_price || 0),
      order.check_in_date,
      today,
      Number(order.paid_amount || 0),
      freeCancelDays,
    );

    const alreadyCharged =
      order.room_charge_status === "charged" ||
      order.payment_status === "paid" ||
      Number(order.paid_amount || 0) > 0;

    if (body.quote_only) {
      return json(
        { success: true, quote, freeCancelDays, alreadyCharged, cancelled: order.order_status === "cancelled" },
        200,
        corsHeaders,
      );
    }

    // 身分驗證：Email 或手機末四碼須對得上
    const email = (body.email || "").trim().toLowerCase();
    const last4 = (body.phone_last4 || "").replace(/\D/g, "").slice(-4);
    const orderEmail = (order.guest_email || "").trim().toLowerCase();
    const orderPhoneDigits = (order.guest_phone || "").replace(/\D/g, "");
    const verified =
      (!!email && !!orderEmail && email === orderEmail) ||
      (last4.length === 4 && orderPhoneDigits.endsWith(last4));
    if (!verified) {
      return json({ success: false, message: "驗證失敗，請確認訂購人 Email 或手機末四碼" }, 403, corsHeaders);
    }

    if (order.order_status === "cancelled") {
      return json({ success: false, message: "此訂單已取消" }, 400, corsHeaders);
    }
    if (alreadyCharged) {
      return json(
        { success: false, message: "此訂單已完成扣款，無法自行取消，請聯繫住宿客服協助處理退款" },
        400,
        corsHeaders,
      );
    }
    if (order.check_in_date < today) {
      return json({ success: false, message: "已過入住日無法線上取消，請直接聯繫住宿" }, 400, corsHeaders);
    }
    if (quote.feeAmount > 0) {
      return json(
        {
          success: false,
          needs_fee: true,
          quote,
          message: `距入住 ${quote.daysBefore} 天，依取消政策需收取 ${quote.percent}% 手續費（NT$${quote.feeAmount.toLocaleString()}），請登入會員中心或聯繫客服辦理取消`,
        },
        400,
        corsHeaders,
      );
    }

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const note = [
      `🔒 ${stamp} 客人於付款狀態頁自行取消訂單（未扣款）${body.reason ? `：${body.reason}` : ""}`,
      `🔒 取消政策：距入住 ${quote.daysBefore} 天，${quote.label}，未產生費用；房間已釋放`,
    ].join("\n");

    const { error } = await supabase
      .from("orders")
      .update({
        order_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        payment_status: "cancelled",
        cancellation_fee_amount: 0,
        cancellation_fee_percent: quote.percent,
        room_charge_status: order.room_charge_status ? "cancelled" : null,
        notes: `${order.notes ? order.notes + "\n" : ""}${note}`,
      })
      .eq("id", order.id)
      .eq("order_status", order.order_status);

    if (error) return json({ success: false, message: error.message }, 500, corsHeaders);

    // 停用已綁定的信用卡 token，確保入住日不會再被扣款
    await supabase
      .from("deposit_card_tokens")
      .update({ is_active: false })
      .eq("order_id", order.id)
      .eq("is_active", true);

    // 取消通知信（best-effort）
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-order-cancelled-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          reason: body.reason ?? null,
          chargedFee: 0,
          refunded: 0,
          needManual: false,
          triggerSource: "public_payment_status_page",
        }),
      });
    } catch (mailErr) {
      console.error("[public-order-cancel] email failed", mailErr);
    }

    return json(
      { success: true, message: "訂單已取消，保留的房間已釋放，且不會再進行扣款", quote },
      200,
      corsHeaders,
    );
  } catch (err) {
    console.error("[public-order-cancel] error", err);
    return json({ success: false, message: (err as Error)?.message ?? "internal_error" }, 500, {
      ...buildCorsHeaders(req),
    });
  }
});
