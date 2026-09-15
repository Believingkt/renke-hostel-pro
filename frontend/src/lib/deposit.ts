/**
 * 押金狀態與金額的共用邏輯（櫃檯接待 / 訂單詳情頁共用）
 *
 * DB 欄位：
 * - deposit_required_amount：應收押金金額
 * - deposit_status：pending | charged | partially_refunded | refunded（另有舊值 cash/card_bound/failed）
 * - deposit_charged_amount / deposit_refunded_amount：實際收取 / 退還金額
 */

export type DepositStatus = "pending" | "charged" | "partially_refunded" | "refunded";

export const DEPOSIT_STATUS_OPTIONS: { value: DepositStatus; label: string; cls: string }[] = [
  { value: "pending", label: "未收押金", cls: "bg-muted text-muted-foreground border-border" },
  { value: "charged", label: "已收押金", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400" },
  { value: "refunded", label: "已退還", cls: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400" },
  { value: "partially_refunded", label: "部分扣押", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" },
];

/** 舊資料狀態 → 顯示用的四種狀態 */
export function normalizeDepositStatus(status: string | null | undefined): DepositStatus {
  switch (status) {
    case "charged":
    case "card_bound":
      return "charged";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partially_refunded";
    default:
      return "pending";
  }
}

export function depositStatusLabel(status: string | null | undefined) {
  const v = normalizeDepositStatus(status);
  return DEPOSIT_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function depositStatusCls(status: string | null | undefined) {
  const v = normalizeDepositStatus(status);
  return DEPOSIT_STATUS_OPTIONS.find((o) => o.value === v)?.cls ?? "bg-muted text-muted-foreground border-border";
}

export interface DepositPatchInput {
  amount: number;
  status: DepositStatus;
  /** 部分扣押時實際扣留的金額（其餘視為已退還） */
  retainedAmount?: number;
}

/** 依狀態推導出要寫入 orders 的完整押金欄位（單一真實來源） */
export function buildDepositPatch({ amount, status, retainedAmount = 0 }: DepositPatchInput) {
  const required = Math.max(0, Math.round(Number(amount) || 0));
  const now = new Date().toISOString();

  if (status === "pending") {
    return {
      deposit_required_amount: required,
      deposit_status: "pending",
      deposit_method: null,
      deposit_charged_amount: 0,
      deposit_refunded_amount: 0,
      deposit_charged_at: null,
      deposit_refunded_at: null,
    };
  }

  const base = {
    deposit_required_amount: required,
    deposit_method: "cash",
    deposit_charged_amount: required,
    deposit_charged_at: now,
  };

  if (status === "charged") {
    return { ...base, deposit_status: "charged", deposit_refunded_amount: 0, deposit_refunded_at: null };
  }
  if (status === "refunded") {
    return { ...base, deposit_status: "refunded", deposit_refunded_amount: required, deposit_refunded_at: now };
  }
  // partially_refunded：扣留 retainedAmount，其餘退還
  const retained = Math.min(required, Math.max(0, Math.round(Number(retainedAmount) || 0)));
  return {
    ...base,
    deposit_status: "partially_refunded",
    deposit_refunded_amount: required - retained,
    deposit_refunded_at: now,
  };
}
