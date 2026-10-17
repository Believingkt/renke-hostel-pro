// payuni-create-pending-order
// PAYUNi 館信用卡「先建待付款訂單」：驗價、建單欄位與 create-paid-order 相同，但不扣款，
// payment_status = pending_payment、paid_amount = 0、payment_method = credit_card_payuni。
// 寄信／KOL／推播改在付款成功（_shared/orderPaymentSuccess.ts）觸發。冪等：相同 idempotency_key 回傳既有訂單。
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateOrderPrices } from "../_shared/orderPriceValidation.ts";
import { resolveOrderPricingTemplateId } from "../_shared/orderPricingTemplate.ts";
import { reportBackendError } from "../_shared/errorReporter.ts";
import { checkTripProductStock, finalizeTripOrder } from "../_shared/tripOrder.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { resolveMemberId } from "../_shared/resolveMemberId.ts";
import { PAYUNI_PAYMENT_METHOD } from "../_shared/orderPaymentSuccess.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ success: false, message: "Method Not Allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: any = await req.json().catch(() => null);
    if (!body?.idempotencyKey || !body.accommodationId || !body.selectedRoom?.id || !body.checkInDate || !body.checkOutDate ||
      !body.guestInfo?.name || !body.guestInfo?.phone || !body.finalPrice) {
      return json({ success: false, message: "缺少必要欄位" }, 400);
    }
    if (!Number.isInteger(body.finalPrice) || body.finalPrice <= 0) return json({ success: false, message: "金額不正確" }, 400);

    const { data: acc } = await supabase.from("accommodation_info")
      .select("payment_provider_active, payuni_mer_status, payuni_payment_tools").eq("id", body.accommodationId).maybeSingle();
    if (!acc || acc.payment_provider_active !== "payuni" || acc.payuni_mer_status !== 1 || Number((acc.payuni_payment_tools as any)?.CREDIT) !== 1) {
      return json({ success: false, message: "此館尚未開通線上刷卡" }, 400);
    }

    const { data: existing } = await supabase.from("orders")
      .select("id, order_number, final_price, check_in_date, check_out_date").eq("idempotency_key", body.idempotencyKey).maybeSingle();
    if (existing) return json({ success: true, alreadyExists: true, order: existing });

    const totalPrice = body.totalPrice ?? body.finalPrice;
    const priceCheck = await validateOrderPrices(supabaseUrl, supabaseServiceKey, {
      accommodationId: body.accommodationId,
      roomTypeId: body.selectedRoom.id,
      packageId: body.packageId ?? null,
      pricingTemplateId: body.pricingTemplateId ?? null,
      roomQuantity: body.roomQuantity ?? 1,
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate,
      totalPrice,
      discountCode: body.discountCode,
      discountAmount: body.discountAmount,
      finalPrice: body.finalPrice,
      mealPlan: body.mealPlan,
      mealPlanDetails: body.mealPlanDetails,
      mealPlanTotal: body.mealPlanTotal,
      petCount: body.petCount,
      petPlanPrice: body.petPlanPrice,
      customAddonDetails: body.customAddonDetails ?? null,
      childSelection: body.childSelection ?? null,
      childExtraTotal: body.childExtraTotal ?? 0,
      tripId: body.tripId ?? null,
      guestEmail: body.guestInfo?.email ?? null,
    });
    if (!priceCheck.ok) {
      if (priceCheck.reason === "service_unavailable") return json({ success: false, message: priceCheck.message }, 503);
      return json({ success: false, message: "價格驗證失敗，請重新預訂", errors: priceCheck.errors }, 400);
    }
    const stockCheck = await checkTripProductStock(supabaseUrl, supabaseServiceKey, body.customAddonDetails);
    if (!stockCheck.ok) return json({ success: false, message: stockCheck.message }, 409);

    const safeMemberId = await resolveMemberId(req, supabase, body.memberId ?? null);
    const { data: orderTemplateRows } = await supabase.from("pricing_templates")
      .select("id, accommodation_id, default_package_id, display_order, created_at").eq("accommodation_id", body.accommodationId);
    const orderPricingTemplateId = resolveOrderPricingTemplateId({
      templates: orderTemplateRows ?? [],
      accommodationId: body.accommodationId,
      packageId: body.packageId ?? null,
      fallbackTemplateId: body.pricingTemplateId ?? null,
    });

    let orderNotes = "[PAYUNi 待付款]";
    if (body.guestInfo.notes) orderNotes += ` ${body.guestInfo.notes}`;
    const { data: orderData, error: orderError } = await supabase.from("orders").insert([{
      accommodation_id: body.accommodationId,
      room_type_id: body.selectedRoom.id,
      package_id: body.packageId || null,
      pricing_template_id: orderPricingTemplateId,
      customer_id: body.customerId || null,
      member_id: safeMemberId,
      order_number: "",
      idempotency_key: body.idempotencyKey,
      guest_name: body.guestInfo.name,
      guest_phone: body.guestInfo.phone,
      guest_email: body.guestInfo.email || null,
      guest_address: body.guestInfo.address || null,
      check_in_date: body.checkInDate,
      check_out_date: body.checkOutDate,
      guest_count: body.totalGuests ?? 2,
      meal_plan: body.mealPlan,
      total_price: totalPrice,
      discount_code: body.discountCode || null,
      discount_amount: body.discountAmount || 0,
      final_price: body.finalPrice,
      deposit_amount: 0,
      deposit_payment_method: "credit_card",
      balance_payment_method: null,
      payment_method: PAYUNI_PAYMENT_METHOD,
      payment_status: "pending_payment",
      paid_amount: 0,
      order_status: "pending",
      notes: orderNotes,
      pet_count: body.petCount || 0,
      pet_plan_price: body.petPlanPrice || 0,
      room_quantity: body.roomQuantity ?? 1,
      custom_addon_details: body.customAddonDetails ?? null,
      order_source: "website",
      attribution_session_id: typeof body.attributionSessionId === "string" ? String(body.attributionSessionId).slice(0, 128) : null,
    }]).select().single();

    if (orderError) {
      if (orderError.code === "23505") {
        const { data: dup } = await supabase.from("orders")
          .select("id, order_number, final_price").eq("idempotency_key", body.idempotencyKey).maybeSingle();
        if (dup) return json({ success: true, alreadyExists: true, order: dup });
      }
      await reportBackendError({
        functionName: "payuni-create-pending-order", category: "order_insert", step: "pending_insert",
        errorMessage: orderError.message, errorCode: orderError.code, accommodationId: body.accommodationId, idempotencyKey: body.idempotencyKey,
      });
      return json({ success: false, message: "建立訂單失敗，請稍後再試" }, 500);
    }

    try {
      await finalizeTripOrder(supabaseUrl, supabaseServiceKey, {
        orderId: orderData.id, tripId: body.tripId ?? null, customAddonDetails: body.customAddonDetails ?? null,
      });
    } catch (e) {
      console.error("[payuni-create-pending-order] finalizeTripOrder failed (non-fatal):", e);
    }
    const roomQuantity = Math.max(1, Math.floor(Number(body.roomQuantity) || 1));
    if (roomQuantity > 1) {
      const { error: orderRoomsError } = await supabase.from("order_rooms").insert([{
        order_id: orderData.id, room_type_id: body.selectedRoom.id, quantity: roomQuantity, template_id: orderPricingTemplateId,
      }]);
      if (orderRoomsError) console.error("[payuni-create-pending-order] order_rooms insert failed:", orderRoomsError);
    }

    return json({
      success: true,
      order: {
        id: orderData.id, order_number: orderData.order_number, final_price: orderData.final_price, room_name: body.selectedRoom.name,
        check_in_date: body.checkInDate, check_out_date: body.checkOutDate, nights: body.nights,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await reportBackendError({ functionName: "payuni-create-pending-order", category: "unhandled_exception", errorMessage: msg });
    return json({ success: false, message: "伺服器錯誤" }, 500);
  }
});
