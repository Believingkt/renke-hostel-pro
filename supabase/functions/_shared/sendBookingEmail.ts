// 統一的訂房通知 email 發送：以 order_id 從 DB 撈資料，組 payload，呼叫 send-booking-confirmation
// 所有付款方式（信用卡 / 3DS / LINE Pay / ATM）皆透過此入口寄信，避免每個流程各自組裝、欄位漂移。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SendBookingEmailResult {
  ok: boolean;
  reason?: string;
  status?: number;
}

export async function sendBookingConfirmationByOrderId(
  supabaseUrl: string,
  supabaseServiceKey: string,
  orderId: string,
  paymentMethodLabel: string,
): Promise<SendBookingEmailResult> {
  if (!orderId) return { ok: false, reason: "missing_order_id" };

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, guest_name, guest_email,
       check_in_date, check_out_date, guest_count, meal_plan,
       final_price, pet_count, pet_plan_price,
       meal_plan_details, meal_plan_total,
       room_types ( name )`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    console.error("[sendBookingEmail] order not found", { orderId, error });
    return { ok: false, reason: "order_not_found" };
  }
  if (!order.guest_email) {
    console.log("[sendBookingEmail] order has no guest_email, skip", order.order_number);
    return { ok: false, reason: "no_email" };
  }

  const roomName = (order as any).room_types?.name ?? "";
  const mealPlanDetails = Array.isArray(order.meal_plan_details) && order.meal_plan_details.length > 0
    ? order.meal_plan_details
    : undefined;

  const payload = {
    guestName: order.guest_name,
    guestEmail: order.guest_email,
    orderNumber: order.order_number,
    roomName,
    checkInDate: order.check_in_date,
    checkOutDate: order.check_out_date,
    guestCount: order.guest_count,
    mealPlan: order.meal_plan || "",
    finalPrice: order.final_price,
    depositAmount: order.final_price,
    paymentMethod: paymentMethodLabel,
    petCount: order.pet_count && order.pet_count > 0 ? order.pet_count : undefined,
    petPlanPrice: order.pet_plan_price && order.pet_plan_price > 0 ? order.pet_plan_price : undefined,
    mealPlanDetails,
    mealPlanTotal: order.meal_plan_total && order.meal_plan_total > 0 ? order.meal_plan_total : undefined,
  };

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("[sendBookingEmail] send failed", resp.status, txt);
      return { ok: false, reason: `http_${resp.status}`, status: resp.status };
    }
    console.log("[sendBookingEmail] sent for order", order.order_number, "method:", paymentMethodLabel);
    return { ok: true, status: resp.status };
  } catch (e) {
    console.error("[sendBookingEmail] exception", e);
    return { ok: false, reason: "exception" };
  }
}
