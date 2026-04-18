// Shared helper to call validate-order-prices Edge Function

export interface PriceValidationInput {
  accommodationId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  totalPrice: number;
  discountCode?: string | null;
  discountAmount?: number;
  finalPrice: number;
  mealPlan?: string | null;
  mealPlanDetails?: unknown;
  mealPlanTotal?: number;
  petCount?: number;
  petPlanPrice?: number;
}

export type PriceValidationOutcome =
  | { ok: true }
  | { ok: false; reason: "service_unavailable"; message: string }
  | { ok: false; reason: "invalid_price"; errors: unknown };

export async function validateOrderPrices(
  supabaseUrl: string,
  serviceKey: string,
  input: PriceValidationInput,
): Promise<PriceValidationOutcome> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/validate-order-prices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        accommodationId: input.accommodationId,
        roomTypeId: input.roomTypeId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        totalPrice: input.totalPrice,
        discountCode: input.discountCode || null,
        discountAmount: input.discountAmount || 0,
        finalPrice: input.finalPrice,
        mealPlan: input.mealPlan || null,
        mealPlanDetails: input.mealPlanDetails || [],
        mealPlanTotal: input.mealPlanTotal || 0,
        petCount: input.petCount || 0,
        petPlanPrice: input.petPlanPrice || 0,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[priceValidation] Service error:", resp.status, text);
      return {
        ok: false,
        reason: "service_unavailable",
        message: "價格驗證服務暫時無法使用，請稍後再試",
      };
    }

    const validation = await resp.json();
    if (!validation.isValid) {
      console.error("[priceValidation] Failed:", validation.errors);
      return { ok: false, reason: "invalid_price", errors: validation.errors };
    }
    return { ok: true };
  } catch (e) {
    console.error("[priceValidation] Threw:", e);
    return {
      ok: false,
      reason: "service_unavailable",
      message: "價格驗證失敗，請稍後再試",
    };
  }
}
