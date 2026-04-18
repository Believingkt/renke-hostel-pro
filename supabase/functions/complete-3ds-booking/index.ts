import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingData {
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
  nights: number;
  discountCode?: string;
  discountAmount: number;
  totalPrice?: number;
  depositAmount?: number;
  totalGuests?: number;
  customerId?: string;
  recTradeId: string;
  authCode?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: BookingData = await req.json();
    console.log("[complete-3ds-booking] Received booking data:", {
      accommodationId: body.accommodationId,
      roomId: body.selectedRoom?.id,
      checkIn: body.checkInDate,
      checkOut: body.checkOutDate,
      recTradeId: body.recTradeId,
    });

    // Validate required fields
    if (!body.accommodationId || !body.selectedRoom?.id || !body.checkInDate || 
        !body.checkOutDate || !body.guestInfo?.name || !body.guestInfo?.phone || 
        !body.finalPrice || !body.recTradeId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "缺少必要欄位" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === Verify TapPay payment is real and successful ===
    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    if (!partnerKey) {
      console.error("[complete-3ds-booking] TAPPAY_PARTNER_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, message: "付款驗證設定錯誤" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tappayQueryResponse = await fetch("https://prod.tappaysdk.com/tpc/transaction/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": partnerKey,
      },
      body: JSON.stringify({
        partner_key: partnerKey,
        filters: { rec_trade_id: body.recTradeId },
      }),
    });

    const tappayResult = await tappayQueryResponse.json();
    console.log("[complete-3ds-booking] TapPay verification:", {
      status: tappayResult.status,
      recordCount: tappayResult.trade_records?.length || 0,
    });

    if (tappayResult.status !== 0 && tappayResult.status !== 2) {
      return new Response(
        JSON.stringify({ success: false, message: "無法驗證付款交易" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tappayRecord = tappayResult.trade_records?.[0];
    if (!tappayRecord) {
      return new Response(
        JSON.stringify({ success: false, message: "找不到付款交易記錄，交易編號無效" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify payment was successful (record_status: 0=auth success, 1=capture success)
    const isPaymentSuccess = tappayRecord.record_status === 0 || tappayRecord.record_status === 1;
    if (!isPaymentSuccess) {
      return new Response(
        JSON.stringify({ success: false, message: "付款未成功，無法建立訂單" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify payment amount matches expected finalPrice
    const verifiedAmount = tappayRecord.amount;
    if (verifiedAmount !== body.finalPrice) {
      console.error("[complete-3ds-booking] Amount mismatch:", { verified: verifiedAmount, submitted: body.finalPrice });
      return new Response(
        JSON.stringify({ success: false, message: "付款金額與訂單金額不符" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[complete-3ds-booking] TapPay payment verified:", {
      recTradeId: tappayRecord.rec_trade_id,
      amount: verifiedAmount,
      authCode: tappayRecord.auth_code,
    });

    // Check if order with this recTradeId already exists (prevent duplicates)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number")
      .ilike("notes", `%${body.recTradeId}%`)
      .single();

    if (existingOrder) {
      console.log("[complete-3ds-booking] Order already exists:", existingOrder.order_number);
      return new Response(
        JSON.stringify({
          success: true,
          message: "訂單已存在",
          order: existingOrder,
          alreadyExists: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === Server-side price validation ===
    // 訂金已移除：所有訂單一律以扣除折扣後的全額（finalPrice）收取
    const totalPrice = body.totalPrice || body.finalPrice;
    const totalGuests = body.totalGuests || 2;

    try {
      const validationPayload = {
        accommodationId: body.accommodationId,
        roomTypeId: body.selectedRoom.id,
        checkInDate: body.checkInDate,
        checkOutDate: body.checkOutDate,
        totalPrice: totalPrice,
        discountCode: body.discountCode || null,
        discountAmount: body.discountAmount || 0,
        finalPrice: body.finalPrice,
        mealPlan: body.mealPlan || null,
        mealPlanDetails: body.mealPlanDetails || [],
        mealPlanTotal: body.mealPlanTotal || 0,
        petCount: body.petCount || 0,
        petPlanPrice: body.petPlanPrice || 0,
      };

      const validateResponse = await fetch(
        `${supabaseUrl}/functions/v1/validate-order-prices`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(validationPayload),
        }
      );

      if (validateResponse.ok) {
        const validationResult = await validateResponse.json();
        if (!validationResult.isValid) {
          console.error("[complete-3ds-booking] Price validation failed:", validationResult.errors);
          return new Response(
            JSON.stringify({
              success: false,
              message: "價格驗證失敗，請重新預訂",
              errors: validationResult.errors,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log("[complete-3ds-booking] Price validation passed");
      } else {
        // If validation service is down, log but allow order to proceed
        // to avoid blocking legitimate payments that already completed 3DS
        const respText = await validateResponse.text();
        console.error("[complete-3ds-booking] Price validation service error:", validateResponse.status, respText);
      }
    } catch (validationError) {
      // Non-fatal: if validation service is unreachable, log and continue
      console.error("[complete-3ds-booking] Price validation call failed (non-fatal):", validationError);
    }

    // Prepare order notes
    let orderNotes = `[TapPay 3DS 交易: ${body.recTradeId}]`;
    if (body.authCode) {
      orderNotes += ` [授權碼: ${body.authCode}]`;
    }
    if (body.guestInfo.notes) {
      orderNotes += ` ${body.guestInfo.notes}`;
    }

    // Create the order
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([{
        accommodation_id: body.accommodationId,
        room_type_id: body.selectedRoom.id,
        customer_id: body.customerId || null,
        order_number: "", // Auto-generated by database trigger
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
        deposit_payment_method: "credit_card_3ds",
        balance_payment_method: null,
        payment_status: "paid",
        paid_amount: verifiedAmount, // Use TapPay-verified amount (= finalPrice)
        order_status: "pending",
        notes: orderNotes,
        pet_count: body.petCount || 0,
        pet_plan_price: body.petPlanPrice || 0,
        meal_plan_details: body.mealPlanDetails || [],
        meal_plan_total: body.mealPlanTotal || 0,
        order_source: "website",
      }])
      .select()
      .single();

    if (orderError) {
      console.error("[complete-3ds-booking] Order creation failed:", orderError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "建立訂單失敗",
          error: orderError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[complete-3ds-booking] Order created:", orderData.order_number);

    // Trigger KOL Webhook if discount code was used
    if (body.discountCode && orderData?.id) {
      try {
        const webhookResponse = await fetch(`${supabaseUrl}/functions/v1/kol-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ order_id: orderData.id }),
        });
        console.log("[complete-3ds-booking] KOL webhook triggered:", webhookResponse.status);
      } catch (webhookError) {
        console.log("[complete-3ds-booking] KOL webhook error (non-fatal):", webhookError);
      }
    }

    // Send booking confirmation email if email provided
    let emailSent = false;
    if (body.guestInfo.email) {
      try {
        const emailPayload = {
          guestName: body.guestInfo.name,
          guestEmail: body.guestInfo.email,
          orderNumber: orderData.order_number,
          roomName: body.selectedRoom.name,
          checkInDate: body.checkInDate,
          checkOutDate: body.checkOutDate,
          guestCount: totalGuests,
          mealPlan: body.mealPlan,
          mealPlanDisplayName: getMealPlanDisplayName(body.mealPlan),
          finalPrice: body.finalPrice,
          depositAmount: body.finalPrice,
          paymentMethod: "信用卡 (3D驗證)",
          petCount: body.petCount > 0 ? body.petCount : undefined,
          petPlanPrice: body.petPlanPrice > 0 ? body.petPlanPrice : undefined,
          mealPlanDetails: body.mealPlanDetails?.length > 0 ? body.mealPlanDetails.map(d => ({
            date: formatDate(d.date),
            count: d.count,
            price: d.price,
          })) : undefined,
          mealPlanTotal: body.mealPlanTotal > 0 ? body.mealPlanTotal : undefined,
        };

        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(emailPayload),
        });

        if (emailResponse.ok) {
          emailSent = true;
          console.log("[complete-3ds-booking] Confirmation email sent");
        }
      } catch (emailError) {
        console.error("[complete-3ds-booking] Email sending failed:", emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "訂單建立成功",
        order: {
          id: orderData.id,
          order_number: orderData.order_number,
          final_price: orderData.final_price,
          room_name: body.selectedRoom.name,
          check_in_date: body.checkInDate,
          check_out_date: body.checkOutDate,
          nights: body.nights,
        },
        emailSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[complete-3ds-booking] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "伺服器錯誤",
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getMealPlanDisplayName(mealPlan: string): string {
  switch (mealPlan) {
    case "2_meals":
      return "一泊二食";
    case "3_meals":
      return "一泊三食";
    case "no_meals":
    default:
      return "純住宿";
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
}
