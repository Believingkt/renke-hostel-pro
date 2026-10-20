// 由 packages/shared/src/utils/discountEvaluation.ts 同步，勿手改；改原檔後跑 node scripts/sync-shared-vendor.mjs
// 折扣碼三態判斷（前台、後台、validate-order-prices 共用）
//   applied        → 照現行計算折扣
//   not_applicable → 碼有效但條件不符：接受碼、折扣 0、房費用售價（不可改用原價）
//   invalid        → 拒絕
// evaluate_discount_code 尚未套用（函式不存在）時退回 validate_discount_code：有效＝applied，其餘＝invalid（即現行行為）。

export type DiscountEvalStatus = "applied" | "not_applicable" | "invalid";

export interface DiscountEvaluation {
  status: DiscountEvalStatus;
  discountType: string | null;
  discountValue: number | null;
  message: string;
  applicableNames: string[];
  scopeEmpty: boolean;
}

export interface DiscountEvalParams {
  code: string;
  accommodationId: string;
  orderAmount?: number;
  roomTypeId?: string | null;
  checkInDate?: string | null;
  pricingTemplateId?: string | null;
}

type RpcResult = { data: any; error: { code?: string; message?: string } | null };
export type RpcCaller = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

const isMissingFunction = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /evaluate_discount_code/.test(e.message ?? "") && /(not find|does not exist)/i.test(e.message ?? ""));

/** 回傳 null 表示查詢失敗（呼叫端照現行錯誤處理） */
export async function evaluateDiscountCode(rpc: RpcCaller, p: DiscountEvalParams): Promise<DiscountEvaluation | null> {
  const args = {
    p_code: p.code,
    p_accommodation_id: p.accommodationId,
    p_order_amount: Math.round(p.orderAmount ?? 0),
    p_room_type_id: p.roomTypeId ?? null,
    p_check_in_date: p.checkInDate ?? null,
    p_pricing_template_id: p.pricingTemplateId ?? null,
  };
  const ev = await rpc("evaluate_discount_code", args);
  if (!ev.error) {
    const r = Array.isArray(ev.data) ? ev.data[0] : ev.data;
    if (!r) return null;
    return {
      status: r.status as DiscountEvalStatus,
      discountType: r.discount_type ?? null,
      discountValue: r.discount_value ?? null,
      message: r.message ?? "",
      applicableNames: r.applicable_names ?? [],
      scopeEmpty: !!r.scope_empty,
    };
  }
  if (!isMissingFunction(ev.error)) return null;
  const legacy = await rpc("validate_discount_code", args);
  if (legacy.error) return null;
  const r = Array.isArray(legacy.data) ? legacy.data[0] : legacy.data;
  if (!r) return null;
  return {
    status: r.is_valid ? "applied" : "invalid",
    discountType: r.discount_type ?? null,
    discountValue: r.discount_value ?? null,
    message: r.message ?? "",
    applicableNames: r.applicable_room_names ?? [],
    scopeEmpty: false,
  };
}

/** 套進 computeDiscountedRoomCharge 的折扣參數：只有 applied 才有折扣 */
export function discountChargeParams(ev: Pick<DiscountEvaluation, "status" | "discountType" | "discountValue"> | null): {
  discountKind: "percentage" | "fixed" | null;
  discountValue: number | null;
} {
  if (!ev || ev.status !== "applied") return { discountKind: null, discountValue: null };
  return { discountKind: ev.discountType === "percentage" ? "percentage" : "fixed", discountValue: ev.discountValue };
}

/** not_applicable 時給客人看的訊息 */
export function notApplicableMessage(ev: Pick<DiscountEvaluation, "applicableNames" | "scopeEmpty">): string {
  if (ev.scopeEmpty) return "此碼為推薦碼，不提供折扣，已記錄";
  const names = (ev.applicableNames ?? []).filter(Boolean);
  return names.length > 0
    ? `此方案不適用折扣（折扣僅適用：${names.join("、")}），已記錄推薦碼`
    : "此方案不適用折扣，已記錄推薦碼";
}
