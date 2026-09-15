/**
 * 已結清訂單「折扣」修改 — 單一權限判定與變更記錄組裝。
 *
 * 權限唯一來源：/admin 同館「訂單」模組 = editable（super_admin / hotel_admin 由
 * useStaffPermissions 直接回傳 editable）。
 * 不使用 /team 角色、closer、finance、分潤權限，亦不使用任何舊的折扣特殊名單。
 */

export type OrdersModuleLevel = "hidden" | "readonly" | "editable" | null | undefined;

export const PAID_DISCOUNT_SOURCE = "/admin 修改已結清折扣";

export interface PaidDiscountOrderLike {
  accommodation_id?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  refund_status?: string | null;
  refunded_amount?: number | null;
  refunded_at?: string | null;
  paid_amount?: number | null;
  /** 保證金退還欄位「不」納入判斷，避免誤擋 */
  deposit_refunded_amount?: number | null;
  deposit_status?: string | null;
}

const PAID_STATUSES = ["paid", "fully_paid", "partial_paid", "deposit_paid"];
const REFUNDED_PAYMENT_STATUSES = ["refunded", "partial_refunded"];
const REFUND_IN_PROGRESS = ["pending", "pending_manual", "processing", "refunding", "refunded"];

/**
 * 「已結清」判定唯一來源：payment_status ∈ (paid, fully_paid)。
 * fully_paid 僅為既有相容值；不得以 paid_amount 比較、入退房狀態或任何舊權限替代。
 */
export const SETTLED_PAYMENT_STATUSES = ["paid", "fully_paid"] as const;

export function isSettledPaymentStatus(status: string | null | undefined): boolean {
  return SETTLED_PAYMENT_STATUSES.includes(
    (status || "").toLowerCase() as (typeof SETTLED_PAYMENT_STATUSES)[number],
  );
}

/** /admin 訂單詳情「修改已結清折扣」入口的顯示條件（fail-closed） */
export function canShowPaidDiscountEntry({
  ordersLevel,
  currentAccommodationId,
  order,
}: PaidDiscountPermissionInput): boolean {
  if (!order) return false;
  if (!isSettledPaymentStatus(order.payment_status)) return false;
  if (ordersLevel !== "editable") return false;
  if (!currentAccommodationId || !order.accommodation_id) return false;
  return order.accommodation_id === currentAccommodationId;
}


/** 房費退款中／已退款的訂單不得再走一般折扣修改（保證金退還不算） */
export function isDiscountRefundLocked(order: PaidDiscountOrderLike | null | undefined): boolean {
  if (!order) return false;
  const refundStatus = (order.refund_status || "").toLowerCase();
  if (refundStatus && refundStatus !== "none" && REFUND_IN_PROGRESS.includes(refundStatus)) return true;
  if (REFUNDED_PAYMENT_STATUSES.includes((order.payment_status || "").toLowerCase())) return true;
  if (Number(order.refunded_amount ?? 0) > 0) return true;
  if (order.refunded_at) return true;
  const cancelled = (order.order_status || "").toLowerCase() === "cancelled";
  const everPaid =
    Number(order.paid_amount ?? 0) > 0 ||
    PAID_STATUSES.includes((order.payment_status || "").toLowerCase());
  if (cancelled && everPaid) return true;
  return false;
}

export interface PaidDiscountPermissionInput {
  ordersLevel: OrdersModuleLevel;
  currentAccommodationId: string | null | undefined;
  order: PaidDiscountOrderLike | null | undefined;
}

export interface PaidDiscountPermissionResult {
  allowed: boolean;
  reason?: string;
}

/** 是否可修改此訂單的折扣（fail-closed） */
export function canEditPaidDiscount({
  ordersLevel,
  currentAccommodationId,
  order,
}: PaidDiscountPermissionInput): PaidDiscountPermissionResult {
  if (!order) return { allowed: false, reason: "訂單資料尚未載入" };
  if (ordersLevel !== "editable") {
    return { allowed: false, reason: "您對「訂單」模組沒有編輯權限，無法修改折扣。" };
  }
  if (!currentAccommodationId || !order.accommodation_id) {
    return { allowed: false, reason: "無法確認館別，無法修改折扣。" };
  }
  if (order.accommodation_id !== currentAccommodationId) {
    return { allowed: false, reason: "此訂單不屬於目前館別，無法修改折扣。" };
  }
  if (isDiscountRefundLocked(order)) {
    return { allowed: false, reason: "此訂單已退款或退款處理中，無法修改折扣。" };
  }
  return { allowed: true };
}

export interface PaidDiscountSnapshot {
  discount_amount: number;
  discount_code: string | null;
  final_price: number;
}

export interface PaidDiscountChange {
  field: string;
  label: string;
  before: string | number | null;
  after: string | number | null;
}

const norm = (v: string | null | undefined) => (v || "").trim().toUpperCase() || null;

/** 產生變更記錄項目；完全相同（no-op）時回傳空陣列，呼叫端不得寫入記錄 */
export function buildPaidDiscountChanges(
  before: PaidDiscountSnapshot,
  after: PaidDiscountSnapshot,
): PaidDiscountChange[] {
  const changes: PaidDiscountChange[] = [];
  if (Number(before.discount_amount ?? 0) !== Number(after.discount_amount ?? 0)) {
    changes.push({
      field: "discount_amount",
      label: "折扣金額",
      before: Number(before.discount_amount ?? 0),
      after: Number(after.discount_amount ?? 0),
    });
  }
  if (norm(before.discount_code) !== norm(after.discount_code)) {
    changes.push({
      field: "discount_code",
      label: "折扣碼",
      before: norm(before.discount_code),
      after: norm(after.discount_code),
    });
  }
  if (Number(before.final_price ?? 0) !== Number(after.final_price ?? 0)) {
    changes.push({
      field: "final_price",
      label: "實收金額",
      before: Number(before.final_price ?? 0),
      after: Number(after.final_price ?? 0),
    });
  }
  return changes;
}

/* ------------------------------------------------------------------
 * v5.5：折扣修改的唯一寫入入口 — public.update_paid_order_discount
 * 前端不得直接 orders.update()，也不得自行補寫變更紀錄。
 * ------------------------------------------------------------------ */

import {
  isValidSettlement,
  type PaidAmountRpcResult,
  type SettlementHandling,
} from "@/lib/paidAmountSettlement";

export const PAID_DISCOUNT_RPC = "update_paid_order_discount_v2";

export type PaidDiscountMode = "manual" | "none" | "code" | "code_override";

export interface PaidDiscountRpcInput {
  orderId: string;
  expectedUpdatedAt: string;
  reason: string;
  mode: PaidDiscountMode;
  settlement: SettlementHandling | "";
  confirmed: boolean;
  discountAmount?: number;
  discountCode?: string;
  /** code_override 模式的實際套用折扣金額 */
  appliedDiscountAmount?: number;
  riskAcknowledged?: boolean;
}

/** 純函式：組 RPC 參數；任何必填缺漏一律 throw，確保 0 mutation */
export function buildPaidDiscountRpcArgs(input: PaidDiscountRpcInput): Record<string, unknown> {
  if (!input.orderId) throw new Error("缺少訂單編號，未做任何修改");
  if (!input.expectedUpdatedAt) throw new Error("訂單版本資訊尚未載入，請重新整理後再試");
  if ((input.reason || "").trim().length < 2) throw new Error("請填寫修改原因");
  if (!isValidSettlement(input.settlement)) throw new Error("請選擇差額處理方式");
  if (input.confirmed !== true) throw new Error("尚未完成二次確認，未做任何修改");
  if (!["manual", "none", "code", "code_override"].includes(input.mode)) {
    throw new Error("折扣模式不正確");
  }
  if (input.mode === "manual" && (input.discountAmount == null || input.discountAmount < 0)) {
    throw new Error("折扣金額不得為負數");
  }
  const usesCode = input.mode === "code" || input.mode === "code_override";
  if (usesCode && !(input.discountCode || "").trim()) {
    throw new Error("請輸入折扣碼");
  }
  if (
    input.mode === "code_override" &&
    (input.appliedDiscountAmount == null || input.appliedDiscountAmount < 0)
  ) {
    throw new Error("實際套用折扣金額不得為空或負數");
  }
  return {
    p_order_id: input.orderId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason.trim(),
    p_mode: input.mode,
    p_discount_amount: input.mode === "manual" ? Math.trunc(input.discountAmount as number) : null,
    p_discount_code: usesCode ? (input.discountCode || "").trim().toUpperCase() : null,
    p_confirmed: true,
    p_settlement_handling: input.settlement,
    p_applied_discount_amount:
      input.mode === "code_override" ? Math.trunc(input.appliedDiscountAmount as number) : null,
    p_risk_acknowledged: input.riskAcknowledged === true,
  };
}

type PaidDiscountRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function callUpdatePaidOrderDiscountV2(
  client: PaidDiscountRpcClient,
  input: PaidDiscountRpcInput,
): Promise<PaidAmountRpcResult> {
  const args = buildPaidDiscountRpcArgs(input);
  const { data, error } = await client.rpc(PAID_DISCOUNT_RPC, args);
  if (error) throw new Error(error.message || "折扣修改失敗");
  return data as unknown as PaidAmountRpcResult;
}

