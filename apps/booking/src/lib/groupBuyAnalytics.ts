// 團購銷售分析：畫面 / Excel / PDF / 列印共用的唯一資料來源
//
// 分潤唯一 Source of Truth = group_buy_commissions（建單當下快照）。
// 嚴禁在任何輸出端用「活動目前 commission_rate × final_price」重新推算歷史訂單。

import { depositState, refundState, type DepositState, type RefundState } from "@lakeze/shared/lib/groupBuyPayment";

export interface AnalyticsOrder {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  final_price: number;
  deposit_amount: number;
  paid_amount: number | null;
  order_date: string;
  order_status: string;
  payment_status: string;
  refund_status: string | null;
  refunded_amount: number | null;
  payment_provider?: string | null;
  reported?: boolean;
}

export interface CommissionRecord {
  order_id: string;
  revenue_base: number;
  commission_rate: number;
  commission_amount: number;
  status: string; // pending | settled | void
  manual_eligibility?: "include" | "exclude" | null;
  manual_note?: string | null;
  price_snapshot?: { package_name?: string | null } | null;
}

export type CommissionState =
  | "included"
  | "pending"
  | "cancelled"
  | "special_included"
  | "special_excluded";

export const COMMISSION_STATE_LABEL: Record<CommissionState, string> = {
  included: "已列入分潤",
  pending: "尚未列入",
  cancelled: "不列入分潤",
  special_included: "特例退款・列入分潤",
  special_excluded: "特例退款・不列入分潤",
};

export const COMMISSION_STATE_VARIANT: Record<
  CommissionState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  included: "default",
  pending: "outline",
  cancelled: "destructive",
  special_included: "secondary",
  special_excluded: "destructive",
};

export interface GroupBuyAnalyticsRow {
  order: AnalyticsOrder;
  commission: CommissionRecord | null;
  state: CommissionState;
  stateLabel: string;
  stateReason: string;
  eligible: boolean;
  /** 分潤比例（來自快照，無紀錄為 null） */
  commissionRate: number | null;
  /** 分潤基準（快照 revenue_base） */
  revenueBase: number;
  /** 實際計入的分潤金額（不符資格為 0） */
  commissionAmount: number;
  packageName: string;
  deposit: DepositState;
  refund: RefundState;
  isSpecialRefund: boolean;
  manual: "include" | "exclude" | null;
}

const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

/** 未取消但已發生退款＝特例退款（不自動 void，需人工判定） */
export function isSpecialRefundOrder(o: AnalyticsOrder): boolean {
  if (o.order_status === "cancelled") return false;
  if (num(o.refunded_amount) > 0) return true;
  return ["refunded", "partial_refunded", "pending_manual", "pending", "failed"].includes(
    String(o.refund_status ?? "none"),
  );
}

export function buildAnalyticsRows(
  orders: AnalyticsOrder[],
  commissions: CommissionRecord[],
): GroupBuyAnalyticsRow[] {
  const byOrder = new Map(commissions.map((c) => [c.order_id, c]));
  return orders.map((order) => {
    const commission = byOrder.get(order.id) ?? null;
    const deposit = depositState(order);
    const refund = refundState(order);
    const special = isSpecialRefundOrder(order);
    const manual = (commission?.manual_eligibility ?? null) as "include" | "exclude" | null;

    let state: CommissionState;
    let stateReason = "";

    if (order.order_status === "cancelled" || commission?.status === "void") {
      state = "cancelled";
      stateReason = "訂單已取消";
    } else if (manual === "exclude") {
      state = "special_excluded";
      stateReason = commission?.manual_note || "人工設定不列入分潤";
    } else if (manual === "include") {
      state = "special_included";
      stateReason = commission?.manual_note || "人工設定列入分潤";
    } else if (deposit === "unpaid") {
      state = "pending";
      stateReason = "訂金尚未確認";
    } else if (special) {
      state = "special_included";
      stateReason = "訂單發生退款，目前仍列入分潤";
    } else {
      state = "included";
      stateReason = "";
    }

    const eligible = state === "included" || state === "special_included";

    return {
      order,
      commission,
      state,
      stateLabel: COMMISSION_STATE_LABEL[state],
      stateReason,
      eligible,
      commissionRate: commission ? Number(commission.commission_rate) : null,
      revenueBase: commission ? num(commission.revenue_base) : num(order.final_price),
      commissionAmount: eligible && commission ? num(commission.commission_amount) : 0,
      packageName: commission?.price_snapshot?.package_name || "—",
      deposit,
      refund,
      isSpecialRefund: special,
      manual,
    };
  });
}

export interface GroupBuyAnalyticsSummary {
  totalOrders: number;
  validOrders: number;
  cancelledOrders: number;
  pendingTransfer: number;
  awaitingCheck: number;
  /** 未取消訂單 final_price 合計（＝有效訂單總額） */
  validRevenue: number;
  collected: number;
  commissionTotal: number;
  commissionOrders: number;
}

export function summarizeAnalytics(rows: GroupBuyAnalyticsRow[]): GroupBuyAnalyticsSummary {
  const valid = rows.filter((r) => r.order.order_status !== "cancelled");
  const eligible = rows.filter((r) => r.eligible);
  return {
    totalOrders: rows.length,
    validOrders: valid.length,
    cancelledOrders: rows.length - valid.length,
    pendingTransfer: valid.filter((r) => r.deposit === "unpaid").length,
    awaitingCheck: valid.filter((r) => r.order.reported && r.deposit === "unpaid").length,
    validRevenue: valid.reduce((s, r) => s + num(r.order.final_price), 0),
    collected: valid
      .filter((r) => r.deposit !== "unpaid")
      .reduce((s, r) => s + num(r.order.paid_amount), 0),
    commissionTotal: eligible.reduce((s, r) => s + r.commissionAmount, 0),
    commissionOrders: eligible.length,
  };
}

export type AnalyticsFilterKey =
  | "all"
  | "valid"
  | "unpaid"
  | "commission_in"
  | "commission_out"
  | "cancelled_refund";

export const ANALYTICS_FILTERS: { key: AnalyticsFilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "valid", label: "有效訂單" },
  { key: "unpaid", label: "待付款／待核對" },
  { key: "commission_in", label: "已列入分潤" },
  { key: "commission_out", label: "未列入分潤" },
  { key: "cancelled_refund", label: "取消／退款" },
];

export const analyticsFilterLabel = (key: AnalyticsFilterKey) =>
  ANALYTICS_FILTERS.find((f) => f.key === key)?.label ?? "全部";

export interface AnalyticsDateFilter {
  field: "order_date" | "check_in_date";
  from: string | null;
  to: string | null;
}

const dayOf = (iso: string) => String(iso ?? "").slice(0, 10);

export function filterAnalyticsRows(
  rows: GroupBuyAnalyticsRow[],
  key: AnalyticsFilterKey,
  date?: AnalyticsDateFilter,
): GroupBuyAnalyticsRow[] {
  let out = rows;
  if (key === "valid") out = out.filter((r) => r.order.order_status !== "cancelled");
  else if (key === "unpaid")
    out = out.filter((r) => r.order.order_status !== "cancelled" && r.deposit === "unpaid");
  else if (key === "commission_in") out = out.filter((r) => r.eligible);
  else if (key === "commission_out") out = out.filter((r) => !r.eligible);
  else if (key === "cancelled_refund")
    out = out.filter((r) => r.order.order_status === "cancelled" || r.isSpecialRefund);

  if (date && (date.from || date.to)) {
    out = out.filter((r) => {
      const v = dayOf(date.field === "order_date" ? r.order.order_date : r.order.check_in_date);
      if (date.from && v < date.from) return false;
      if (date.to && v > date.to) return false;
      return true;
    });
  }
  return out;
}

/** 每筆分潤顯示（畫面／Excel／PDF 共用文案） */
export function commissionCellText(row: GroupBuyAnalyticsRow): { rate: string; amount: string; note: string } {
  if (row.state === "pending") return { rate: "—", amount: "—", note: "尚未列入" };
  if (row.state === "cancelled") return { rate: "—", amount: "NT$0", note: "已取消，不列入" };
  const rate = row.commissionRate != null ? `${row.commissionRate}%` : "—";
  if (row.state === "special_excluded") return { rate: "—", amount: "NT$0", note: "特例退款・不列入" };
  if (row.state === "special_included")
    return { rate, amount: twdPlain(row.commissionAmount), note: "特例退款・列入" };
  return { rate, amount: twdPlain(row.commissionAmount), note: "" };
}

export const twdPlain = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

export const ORDER_STATUS_TEXT = (o: AnalyticsOrder) =>
  o.order_status === "cancelled" ? "已取消" : o.order_status === "confirmed" ? "已確認" : "待處理";

/** 歷史分潤同步調整：只影響尚未正式結算、未取消、未人工排除的紀錄 */
export function commissionsAdjustable(rows: GroupBuyAnalyticsRow[]): GroupBuyAnalyticsRow[] {
  return rows.filter(
    (r) =>
      r.commission &&
      r.commission.status === "pending" &&
      r.order.order_status !== "cancelled" &&
      r.manual !== "exclude",
  );
}
