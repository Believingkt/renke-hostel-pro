// create-paid-order
// Two modes:
//   1) Charge mode: receive prime + cardholder, charge TapPay (non-3DS), then create order.
//   2) Post-charge mode: receive alreadyChargedRecTradeId (already charged via process-tappay-payment),
//      create order; if insert fails, refund the recTradeId.
// Idempotency: returns existing order if same idempotency_key already exists.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chargeByPrime,
  refundTapPay,
  mapTapPayErrorToUserMessage,
} from "../_shared/tappay.ts";
import { validateOrderPrices } from "../_shared/orderPriceValidation.ts";
import { reportBackendError } from "../_shared/errorReporter.ts";
import { sendBookingConfirmationByOrderId } from "../_shared/sendBookingEmail.ts";

import { buildCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  idempotencyKey: string;

  // Either provide for mode 1 (charge):
  prime?: string;
  cardholder?: { name: string; email: string; phoneNumber: string };
  // Or provide for mode 2 (post-charge):
  alreadyChargedRecTradeId?: string;

  accommodationId: string;
  selectedRoom: { id: string; name: string };
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateRequestBody(body: RequestBody): string | null {
  if (
    !body.idempotencyKey ||
    !body.accommodationId ||
    !body.selectedRoom?.id ||
    !body.checkInDate ||
    !body.checkOutDate ||
    !body.guestInfo?.name ||
    !body.guestInfo?.phone ||
    !body.finalPrice
  ) {
    return "缺少必要欄位";
  }
  if (!Number.isInteger(body.finalPrice) || body.finalPrice <= 0) {
    return "金額不正確";
  }
  const isPostCharge = !!body.alreadyChargedRecTradeId;
  if (!isPostCharge && (!body.prime || !body.cardholder)) {
    return "缺少付款資訊";
  }
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = (await req.json()) as RequestBody;

    const validationError = validateRequestBody(body);
    if (validationError) return jsonResponse({ success: false, message: validationError }, 400);

    const isPostCharge = !!body.alreadyChargedRecTradeId;

    // Idempotency check
    const { data: existing } = await supabase
      .from("orders")
      .select("id, order_number, final_price, check_in_date, check_out_date")
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();

    if (existing) {
      console.log("[create-paid-order] Idempotent hit:", existing.order_number);
      return jsonResponse({ success: true, alreadyExists: true, order: existing });
    }

    const totalPrice = body.totalPrice ?? body.finalPrice;
    const totalGuests = body.totalGuests ?? 2;

    // Server-side price validation
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
      // In post-charge mode, charge already happened; log and proceed to create order
      if (isPostCharge) {
        console.error("[create-paid-order] Post-charge price issue, proceeding:", priceCheck);
      } else if (priceCheck.reason === "service_unavailable") {
        return jsonResponse({ success: false, message: priceCheck.message }, 503);
      } else {
        return jsonResponse(
          { success: false, message: "價格驗證失敗，請重新預訂", errors: priceCheck.errors },
          400,
        );
      }
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
    if (!partnerKey || !merchantId) {
      return jsonResponse({ success: false, message: "付款系統設定錯誤" }, 500);
    }

    let recTradeId: string;
    let authCode: string | undefined;

    if (isPostCharge) {
      recTradeId = body.alreadyChargedRecTradeId!;
      console.log("[create-paid-order] Post-charge mode, recTradeId:", recTradeId);
    } else {
      // Charge mode: pay-by-prime (non-3DS)
      const charge = await chargeByPrime({
        partnerKey,
        merchantId,
        prime: body.prime!,
        amount: body.finalPrice,
        details: `${body.selectedRoom.name} - ${body.checkInDate} 至 ${body.checkOutDate}`,
        orderNumber: body.idempotencyKey,
        cardholder: body.cardholder!,
      });

      console.log("[create-paid-order] TapPay result:", {
        status: charge.status,
        recTradeId: charge.rec_trade_id,
      });

      if (charge.status !== 0) {
        const { userMessage, suggestion } = mapTapPayErrorToUserMessage(charge.status, charge.msg);
        await reportBackendError({
          functionName: "create-paid-order",
          category: "tappay_charge",
          step: "charge_by_prime",
          errorMessage: charge.msg ?? userMessage,
          errorCode: charge.status,
          accommodationId: body.accommodationId,
          idempotencyKey: body.idempotencyKey,
          context: { recTradeId: charge.rec_trade_id, finalPrice: body.finalPrice },
        });
        return jsonResponse({
          success: false,
          message: userMessage,
          suggestion,
          errorCode: charge.status,
          technicalMessage: charge.msg,
        });
      }

      recTradeId = charge.rec_trade_id!;
      authCode = charge.auth_code;
    }

    // Create order
    let orderNotes = `[TapPay 交易: ${recTradeId}]`;
    if (authCode) orderNotes += ` [授權碼: ${authCode}]`;
    if (body.guestInfo.notes) orderNotes += ` ${body.guestInfo.notes}`;

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([{
        accommodation_id: body.accommodationId,
        room_type_id: body.selectedRoom.id,
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
        deposit_payment_method: "credit_card",
        balance_payment_method: null,
        payment_status: "paid",
        paid_amount: body.finalPrice,
        order_status: "pending",
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
      // Race resolution via idempotency_key
      if (orderError.code === "23505") {
        const { data: dup } = await supabase
          .from("orders")
          .select("id, order_number, final_price")
          .eq("idempotency_key", body.idempotencyKey)
          .maybeSingle();
        if (dup) {
          console.log("[create-paid-order] Race resolved:", dup.order_number);
          return jsonResponse({ success: true, alreadyExists: true, order: dup });
        }
      }

      console.error("[create-paid-order] Order insert failed AFTER charge:", orderError);
      const refunded = (await refundTapPay(partnerKey, recTradeId, body.finalPrice)).success;
      await reportBackendError({
        functionName: "create-paid-order",
        category: "order_insert",
        step: "post_charge_insert",
        errorMessage: orderError.message,
        errorCode: orderError.code,
        accommodationId: body.accommodationId,
        idempotencyKey: body.idempotencyKey,
        context: { recTradeId, refunded, finalPrice: body.finalPrice },
      });
      return jsonResponse(
        {
          success: false,
          message: refunded
            ? "建立訂單失敗，已自動退刷，請稍後再試"
            : `建立訂單失敗，且自動退刷未成功，請聯繫客服並提供交易編號：${recTradeId}`,
          error: orderError.message,
          recTradeId,
          refunded,
        },
        500,
      );
    }

    console.log("[create-paid-order] Order created:", orderData.order_number);

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
        console.log("[create-paid-order] KOL webhook error (non-fatal):", e);
      }
    }

    // 統一寄送訂房通知信
    try {
      await sendBookingConfirmationByOrderId(
        supabaseUrl,
        supabaseServiceKey,
        orderData.id,
        "信用卡",
      );
    } catch (e) {
      console.error("[create-paid-order] booking email failed (non-fatal):", e);
    }

    return jsonResponse({
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
      recTradeId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-paid-order] Unexpected error:", error);
    await reportBackendError({
      functionName: "create-paid-order",
      category: "unhandled_exception",
      errorMessage: msg,
    });
    return jsonResponse({ success: false, message: "伺服器錯誤", error: msg }, 500);
  }
});
