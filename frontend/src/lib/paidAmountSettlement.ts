/**
 * 已結清訂單金額調整 — 共用「差額處理方式」定義。
 *
 * 與後端 RPC（update_paid_order_discount / update_paid_order_addons_v2）
 * 接受的值完全一致，前端不得自行新增或改寫。
 */

export type SettlementHandling =
  | "collected"
  | "refunded"
  | "offset"
  | "pending"
  | "data_only";

export const SETTLEMENT_OPTIONS: { value: SettlementHandling; label: string }[] = [
  { value: "collected", label: "已完成收款" },
  { value: "refunded", label: "已完成退款／返還" },
  { value: "offset", label: "已完成折抵或其他處理" },
  { value: "pending", label: "尚待處理" },
  { value: "data_only", label: "純資料校正，無實際款項異動" },
];

export const SETTLEMENT_VALUES = SETTLEMENT_OPTIONS.map((o) => o.value);

export function settlementLabel(value: string | null | undefined): string {
  return SETTLEMENT_OPTIONS.find((o) => o.value === value)?.label || "—";
}

export function isValidSettlement(value: unknown): value is SettlementHandling {
  return typeof value === "string" && (SETTLEMENT_VALUES as string[]).includes(value);
}

/** 兩支 RPC 共用的回傳型別（欄位視 RPC 而定，皆為 optional） */
export interface PaidAmountRpcResult {
  changed: boolean;
  order_id: string;
  discount_amount?: number;
  discount_code?: string | null;
  addon_total?: number;
  total_price?: number;
  final_price?: number;
  paid_amount?: number;
  payment_status?: string;
  format?: string;
  risk?: string;
  difference?: number;
  difference_note?: string;
  settlement_handling?: string;
  updated_at?: string;
  audit_log_id?: string | null;
  standard_discount_amount?: number | null;
  applied_discount_amount?: number | null;
  manual_override?: boolean;
  addon_line_changes?: unknown;
  addon_line_merges?: unknown;
  price_corrections?: unknown;
}
