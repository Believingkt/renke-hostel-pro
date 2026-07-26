// create-card-bound-order
// 信用卡「先綁卡、不扣款」建單：
//   1) 以 TapPay Bind Card API 取得 card_key / card_token（不會請款）
//   2) 建立訂單，payment_status = 'unpaid'、room_charge_status = 'card_bound'
//   3) 入住當天由 charge-room-on-checkin 自動以 token 扣款
// Idempotency：相同 idempotency_key 直接回傳既有訂單。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bindCardByPrime, mapTapPayErrorToUserMessage } from "../_shared/tappay.ts";
import { validateOrderPrices } from "../_shared/orderPriceValidation.ts";
import { reportBackendError } from "../_shared/errorReporter.ts";
import { sendBookingConfirmationByOrderId } from "../_shared/sendBookingEmail.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  idempotencyKey: string;
  prime: string;
  cardholder: { name: string; email: string; phoneNumber: string };
  accommodationId: string;
  selectedRoom: { id: string; name: string };
  packageId?: string | null;
  checkInDate: string;
  checkOutDate: string;
  guestInfo: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  mealPlan: string;
  mealPlanDetails: Array<{ date: string; count: number; price: number }>;
  mealPlanTotal: number;
  petCount: number;
  petPlanPrice: number;
  finalPrice: number;
  totalPrice?: number;
  discountCode?: string | null;
  discountAmount: number;
  totalGuests?: number;
  customerId?: string | null;
  memberId?: string | null;
  customAddonDetails?: unknown;
  nights: number;
}

function validateRequestBody(body: RequestBody): string | null {
  if (
    !body?.idempotencyKey ||
    !body?.accommodationId ||
    !body?.selectedRoom?.id ||
    !body?.checkInDate ||
    !body?.checkOutDate ||
    !body?.guestInfo?.name ||
    !body?.guestInfo?.phone ||
    !body?.finalPrice
  ) {
    return "缺少必要欄位";
  }
  if (!Number.isInteger(body.finalPrice) || body.finalPrice <= 0) return "金額不正確";
  if (!body.prime || typeof body.prime !== "string" || body.prime.length < 10) {
    return "缺少付款授權資訊，請重新輸入信用卡";
  }
  if (!body.cardholder?.name || !body.cardholder?.phoneNumber) return "缺少持卡人資料";
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = (await req.json()) as RequestBody;

    const validationError = validateRequestBody(body);
    if (validationError) return json({ success: false, message: validationError }, 400);

    // Idempotency
    const { data: existing } = await supabase
      .from("orders")
      .select("id, order_number, final_price, check_in_date, check_out_date")
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();
    if (existing) {
      console.log("[create-card-bound-order] Idempotent hit:", existing.order_number);
      return json({ success: true, alreadyExists: true, order: existing });
    }

    const totalPrice = body.totalPrice ?? body.finalPrice;
    const totalGuests = body.totalGuests ?? 2;

    // 伺服器端價格驗證（含下單頻率限制）
    const priceCheck = await validateOrderPrices(supabaseUrl, supabaseServiceKey, {
      accommodationId: body.accommodationId,
      roomTypeId: body.selectedRoom.id,
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
    });

    if (!priceCheck.ok) {
      if (priceCheck.reason === "service_unavailable") {
        return json({ success: false, message: priceCheck.message }, 503);
      }
      return json(
        { success: false, message: "價格驗證失敗，請重新預訂", errors: priceCheck.errors },
        400,
      );
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
    if (!partnerKey || !merchantId) {
      return json({ success: false, message: "付款系統設定錯誤" }, 500);
    }

    // 1) 綁卡（不扣款）
    const bind = await bindCardByPrime({
      partnerKey,
      merchantId,
      prime: body.prime,
      cardholder: {
        name: body.cardholder.name,
        email: body.cardholder.email || body.guestInfo.email || "noreply@lakeze.com",
        phoneNumber: body.cardholder.phoneNumber,
      },
    });

    console.log("[create-card-bound-order] bind result", { status: bind.status, msg: bind.msg });

    if (!bind.success) {
      const { userMessage, suggestion } = mapTapPayErrorToUserMessage(bind.status, bind.msg);
      await reportBackendError({
        functionName: "create-card-bound-order",
        category: "tappay_bind_card",
        step: "bind_card_by_prime",
        errorMessage: bind.msg ?? userMessage,
        errorCode: bind.status,
        accommodationId: body.accommodationId,
        idempotencyKey: body.idempotencyKey,
        context: { finalPrice: body.finalPrice },
      });
      return json({
        success: false,
        message: userMessage || "信用卡綁定失敗",
        suggestion: suggestion || "請確認卡片資訊是否正確，或更換其他卡片",
        errorCode: bind.status,
        technicalMessage: bind.msg,
      });
    }

    // 2) 建立訂單（未付款、已綁卡）
    let orderNotes = `[信用卡已綁定，入住當天自動扣款${bind.cardLastFour ? `｜卡號末四碼 ${bind.cardLastFour}` : ""}]`;
    if (body.guestInfo.notes) orderNotes += ` ${body.guestInfo.notes}`;

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([{
        accommodation_id: body.accommodationId,
        room_type_id: body.selectedRoom.id,
        package_id: body.packageId || null,
        customer_id: body.customerId || null,
        member_id: body.memberId || null,
        order_number: "",
        idempotency_key: body.idempotencyKey,
        guest_name: body.guestInfo.name,
        guest_phone: body.guestInfo.phone,
        guest_email: body.guestInfo.email || null,
        guest_address: body.guestInfo.address || null,
        check_in_date: body.checkInDate,
        check_out_date: body.checkOutDate,
        guest_count: totalGuests,
        meal_plan: body.mealPlan,
        total_price: totalPrice,
        discount_code: body.discountCode || null,
        discount_amount: body.discountAmount || 0,
        final_price: body.finalPrice,
        deposit_amount: 0,
        payment_method: "信用卡（入住當天扣款）",
        deposit_payment_method: null,
        balance_payment_method: null,
        payment_status: "unpaid",
        paid_amount: 0,
        order_status: "pending",
        room_charge_status: "card_bound",
        room_charge_scheduled_date: body.checkInDate,
        notes: orderNotes,
        pet_count: body.petCount || 0,
        pet_plan_price: body.petPlanPrice || 0,
        meal_plan_details: body.mealPlanDetails || [],
        meal_plan_total: body.mealPlanTotal || 0,
        custom_addon_details: body.customAddonDetails ?? null,
        order_source: "website",
      }])
      .select()
      .single();

    if (orderError) {
      if (orderError.code === "23505") {
        const { data: dup } = await supabase
          .from("orders")
          .select("id, order_number, final_price")
          .eq("idempotency_key", body.idempotencyKey)
          .maybeSingle();
        if (dup) return json({ success: true, alreadyExists: true, order: dup });
      }
      console.error("[create-card-bound-order] insert failed:", orderError);
      await reportBackendError({
        functionName: "create-card-bound-order",
        category: "order_insert",
        step: "insert_after_bind",
        errorMessage: orderError.message,
        errorCode: orderError.code,
        accommodationId: body.accommodationId,
        idempotencyKey: body.idempotencyKey,
      });
      return json(
        { success: false, message: "建立訂單失敗，卡片未被扣款，請稍後再試", error: orderError.message },
        500,
      );
    }

    // 3) 保存卡片 token（purpose = room_charge）
    const { error: tokenErr } = await supabase.from("deposit_card_tokens").insert({
      order_id: orderData.id,
      accommodation_id: body.accommodationId,
      purpose: "room_charge",
      card_key: bind.cardKey,
      card_token: bind.cardToken,
      card_last_four: bind.cardLastFour,
      card_type: bind.cardType,
      card_expiry: bind.cardExpiry,
      is_active: true,
    });
    if (tokenErr) {
      console.error("[create-card-bound-order] token insert failed:", tokenErr);
      await supabase
        .from("orders")
        .update({ room_charge_status: "failed", room_charge_error: "card token save failed" })
        .eq("id", orderData.id);
      await reportBackendError({
        functionName: "create-card-bound-order",
        category: "card_token_insert",
        errorMessage: tokenErr.message,
        accommodationId: body.accommodationId,
        idempotencyKey: body.idempotencyKey,
      });
      return json(
        { success: false, message: "卡片綁定資料儲存失敗，請聯繫客服", error: tokenErr.message },
        500,
      );
    }

    console.log("[create-card-bound-order] Order created:", orderData.order_number);

    if (body.discountCode) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/kol-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ order_id: orderData.id }),
        });
      } catch (e) {
        console.log("[create-card-bound-order] KOL webhook error (non-fatal):", e);
      }
    }

    try {
      await sendBookingConfirmationByOrderId(
        supabaseUrl,
        supabaseServiceKey,
        orderData.id,
        "信用卡（入住當天扣款）",
      );
    } catch (e) {
      console.error("[create-card-bound-order] booking email failed (non-fatal):", e);
    }

    return json({
      success: true,
      order: {
        id: orderData.id,
        order_number: orderData.order_number,
        final_price: orderData.final_price,
        room_name: body.selectedRoom.name,
        check_in_date: body.checkInDate,
        check_out_date: body.checkOutDate,
        nights: body.nights,
      },
      cardLastFour: bind.cardLastFour,
      chargeDate: body.checkInDate,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-card-bound-order] Unexpected error:", error);
    await reportBackendError({
      functionName: "create-card-bound-order",
      category: "unhandled_exception",
      errorMessage: msg,
    });
    return json({ success: false, message: "伺服器錯誤", error: msg }, 500);
  }
});
