/**
 * 已結清訂單折扣碼驗證（唯讀）。
 *
 * 唯一來源：public.validate_discount_code（SECURITY DEFINER，純查詢，
 * 不寫 discount_codes.used_count、不建立 coupon_usages）。
 * 本檔不做任何寫入，也不重寫折扣公式（percentage → round(房費 × value / 100)，
 * 與 update_paid_order_discount 內完全相同）。
 */

/**
 * v5.5A 的 update_paid_order_discount：
 *   - mode = 'code'   → 折扣金額一律採 validator 計算值，無法保留人工調整值
 *   - mode = 'manual' → discount_code 會被寫成 NULL
 * 因此「折扣碼 + 人工調整金額」目前後端不支援，需 v5.5A.1（code_override）。
 */
export const DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED = false;
export const DISCOUNT_CODE_OVERRIDE_BLOCKER =
  "目前後端 update_paid_order_discount 的「折扣碼」模式一律採用系統計算金額，" +
  "「手動折扣」模式則會清掉折扣碼，無法同時保留折扣碼與人工調整金額。" +
  "需先安裝 v5.5A.1（code_override 模式）才能送出人工調整後的折扣金額。";

export type DiscountValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "valid"; code: string; standardAmount: number; discountType: string; message: string }
  | { status: "invalid"; code: string; message: string };

export interface ValidateInput {
  code: string;
  accommodationId: string;
  /** 純房費（與 RPC 內 v_room_fee 相同口徑） */
  roomFee: number;
  roomTypeId: string | null;
  checkInDate: string | null;
  pricingTemplateId: string | null;
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** 依 validator 回傳計算標準折扣金額（公式與 DB 相同） */
export function standardDiscountAmount(
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
  roomFee: number,
): number {
  const v = Number(discountValue ?? 0) || 0;
  if (discountType === "percentage") return Math.round(roomFee * (v / 100));
  return Math.trunc(v);
}

/** 純驗證：只呼叫 validate_discount_code，不產生任何 DB write */
export async function validatePaidDiscountCode(
  client: RpcClient,
  input: ValidateInput,
): Promise<DiscountValidationState> {
  const code = (input.code || "").trim().toUpperCase();
  if (!code) return { status: "invalid", code, message: "請輸入折扣碼" };
  const { data, error } = await client.rpc("validate_discount_code", {
    p_code: code,
    p_accommodation_id: input.accommodationId,
    p_order_amount: Math.max(0, Math.trunc(input.roomFee)),
    p_room_type_id: input.roomTypeId,
    p_check_in_date: input.checkInDate,
    p_pricing_template_id: input.pricingTemplateId,
  });
  if (error) return { status: "invalid", code, message: error.message || "折扣碼驗證失敗" };
  const row = Array.isArray(data) ? (data[0] as any) : (data as any);
  if (!row || row.is_valid !== true) {
    return { status: "invalid", code, message: row?.message || "折扣碼無效" };
  }
  return {
    status: "valid",
    code,
    discountType: String(row.discount_type ?? ""),
    standardAmount: standardDiscountAmount(row.discount_type, row.discount_value, input.roomFee),
    message: String(row.message ?? "折扣碼有效"),
  };
}
