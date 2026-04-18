// create-paid-order
// Two modes:
//   1) Charge mode: receive prime + cardholder, charge TapPay (non-3DS), then create order.
//   2) Post-charge mode: receive alreadyChargedRecTradeId (already charged via process-tappay-payment),
//      create order; if insert fails, refund the recTradeId.
// Idempotency: returns existing order if same idempotency_key already exists.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function normalizePhoneE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("09") && cleaned.length === 10) return "+886" + cleaned.substring(1);
  if (cleaned.startsWith("886")) return "+" + cleaned;
  return "+886" + cleaned;
}

async function refundTapPay(partnerKey: string, recTradeId: string, amount: number) {
  try {
    const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
    const endpoint =
      env === "sandbox"
        ? "https://sandbox.tappaysdk.com/tpc/transaction/refund"
        : "https://prod.tappaysdk.com/tpc/transaction/refund";

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify({ partner_key: partnerKey, rec_trade_id: recTradeId, amount }),
    });
    const result = await resp.json();
    console.error("[create-paid-order] Refund attempt result:", { status: result.status, msg: result.msg });
    return result.status === 0;
  } catch (e) {
    console.error("[create-paid-order] Refund call threw:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = (await req.json()) as RequestBody;

    // Basic validation
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
      return new Response(
        JSON.stringify({ success: false, message: "缺少必要欄位" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Number.isInteger(body.finalPrice) || body.finalPrice <= 0) {
      return new Response(
        JSON.stringify({ success: false, message: "金額不正確" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPostCharge = !!body.alreadyChargedRecTradeId;
    if (!isPostCharge && (!body.prime || !body.cardholder)) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少付款資訊" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from("orders")
      .select("id, order_number, final_price, check_in_date, check_out_date")
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();

    if (existing) {
      console.log("[create-paid-order] Idempotent hit:", existing.order_number);
      return new Response(
        JSON.stringify({ success: true, alreadyExists: true, order: existing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalPrice = body.totalPrice ?? body.finalPrice;
    const totalGuests = body.totalGuests ?? 2;

    // Server-side price validation
    try {
      const validateResp = await fetch(`${supabaseUrl}/functions/v1/validate-order-prices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          accommodationId: body.accommodationId,
          roomTypeId: body.selectedRoom.id,
          checkInDate: body.checkInDate,
          checkOutDate: body.checkOutDate,
          totalPrice,
          discountCode: body.discountCode || null,
          discountAmount: body.discountAmount || 0,
          finalPrice: body.finalPrice,
          mealPlan: body.mealPlan || null,
          mealPlanDetails: body.mealPlanDetails || [],
          mealPlanTotal: body.mealPlanTotal || 0,
          petCount: body.petCount || 0,
          petPlanPrice: body.petPlanPrice || 0,
        }),
      });

      if (!validateResp.ok) {
        const text = await validateResp.text();
        console.error("[create-paid-order] Price validation service error:", validateResp.status, text);
        // In post-charge mode, we MUST still create the order (charge already happened);
        // log only and proceed
        if (!isPostCharge) {
          return new Response(
            JSON.stringify({ success: false, message: "價格驗證服務暫時無法使用，請稍後再試" }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        const validation = await validateResp.json();
        if (!validation.isValid) {
          console.error("[create-paid-order] Price validation failed:", validation.errors);
          if (!isPostCharge) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "價格驗證失敗，請重新預訂",
                errors: validation.errors,
              }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // post-charge: log but continue (we'll still create the order; admin can investigate)
          console.error("[create-paid-order] Post-charge price mismatch — proceeding to create order anyway");
        }
      }
    } catch (e) {
      console.error("[create-paid-order] Price validation threw:", e);
      if (!isPostCharge) {
        return new Response(
          JSON.stringify({ success: false, message: "價格驗證失敗，請稍後再試" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
    if (!partnerKey || !merchantId) {
      return new Response(
        JSON.stringify({ success: false, message: "付款系統設定錯誤" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let recTradeId: string;
    let authCode: string | undefined;

    if (isPostCharge) {
      recTradeId = body.alreadyChargedRecTradeId!;
      console.log("[create-paid-order] Post-charge mode, recTradeId:", recTradeId);
    } else {
      // Charge mode: pay-by-prime (no 3DS)
      const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
      const endpoint =
        env === "sandbox"
          ? "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime"
          : "https://prod.tappaysdk.com/tpc/payment/pay-by-prime";

      const phoneE164 = normalizePhoneE164(body.cardholder!.phoneNumber);

      const tappayResp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
        body: JSON.stringify({
          prime: body.prime,
          partner_key: partnerKey,
          merchant_id: merchantId,
          amount: body.finalPrice,
          currency: "TWD",
          details: `${body.selectedRoom.name} - ${body.checkInDate} 至 ${body.checkOutDate}`,
          order_number: body.idempotencyKey.substring(0, 50),
          cardholder: {
            phone_number: phoneE164,
            name: body.cardholder!.name,
            email: body.cardholder!.email,
          },
          remember: false,
          three_domain_secure: false,
        }),
      });

      const tappayResult = await tappayResp.json();
      console.log("[create-paid-order] TapPay result:", {
        status: tappayResult.status,
        recTradeId: tappayResult.rec_trade_id,
      });

      if (tappayResult.status !== 0) {
        let userMessage = tappayResult.msg || "付款失敗";
        let suggestion = "請檢查卡片資訊或聯繫發卡銀行";
        switch (tappayResult.status) {
          case 3: userMessage = "卡片資訊錯誤"; suggestion = "請檢查卡號、有效期限和安全碼"; break;
          case 10: userMessage = "授權失敗"; suggestion = "卡片餘額不足或超過信用額度"; break;
          case 924: userMessage = "3D 驗證失敗"; break;
          case 925: userMessage = "交易被拒絕"; suggestion = "請聯繫發卡銀行確認卡片狀態"; break;
          case 10023: userMessage = "銀行端回覆錯誤"; suggestion = "請稍後重試或更換卡片"; break;
        }
        return new Response(
          JSON.stringify({
            success: false,
            message: userMessage,
            suggestion,
            errorCode: tappayResult.status,
            technicalMessage: tappayResult.msg,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      recTradeId = tappayResult.rec_trade_id;
      authCode = tappayResult.auth_code;
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
          return new Response(
            JSON.stringify({ success: true, alreadyExists: true, order: dup }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      console.error("[create-paid-order] Order insert failed AFTER charge:", orderError);
      const refunded = await refundTapPay(partnerKey, recTradeId, body.finalPrice);
      return new Response(
        JSON.stringify({
          success: false,
          message: refunded
            ? "建立訂單失敗，已自動退刷，請稍後再試"
            : `建立訂單失敗，且自動退刷未成功，請聯繫客服並提供交易編號：${recTradeId}`,
          error: orderError.message,
          recTradeId,
          refunded,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    return new Response(
      JSON.stringify({
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
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-paid-order] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, message: "伺服器錯誤", error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
