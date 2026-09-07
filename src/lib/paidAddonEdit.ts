/**
 * 已付款訂單「額外加購」修改 — 權限判定、參數組裝與唯一 RPC 入口。
 *
 * 寫入唯一路徑：public.update_paid_order_addons_v2（v5.5A 已安裝）。
 * 前端不得直接 orders.update()、不得寫 order_rooms、不得自行補寫變更紀錄。
 */

import type { OrdersModuleLevel } from "@/lib/paidDiscountEdit";
import {
  isValidSettlement,
  type PaidAmountRpcResult,
  type SettlementHandling,
} from "@/lib/paidAmountSettlement";

export const PAID_ADDON_RPC = "update_paid_order_addons_v2";
export const PAID_ADDON_SOURCE = "/admin 修改已付款訂單額外加購（v5.5）";

export interface PaidAddonOrderLike {
  accommodation_id?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  refund_status?: string | null;
  refunded_amount?: number | null;
  refunded_at?: string | null;
  paid_amount?: number | null;
}

const PAID_STATUSES = ["paid", "fully_paid"];
const REFUND_IN_PROGRESS = ["pending", "pending_manual", "processing", "refunding", "refunded"];

/** 本流程僅適用 paid / fully_paid（與 RPC 相同判定） */
export function isPaidAddonFlowOrder(order: PaidAddonOrderLike | null | undefined): boolean {
  return !!order && PAID_STATUSES.includes((order.payment_status || "").toLowerCase());
}

export interface PaidAddonPermissionInput {
  ordersLevel: OrdersModuleLevel;
  currentAccommodationId: string | null | undefined;
  order: PaidAddonOrderLike | null | undefined;
}

export interface PaidAddonPermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 是否可修改此訂單的加購（fail-closed）。
 * 唯一權限來源：/admin 同館「訂單」模組 = editable。
 */
export function canEditPaidAddon({
  ordersLevel,
  currentAccommodationId,
  order,
}: PaidAddonPermissionInput): PaidAddonPermissionResult {
  if (!order) return { allowed: false, reason: "訂單資料尚未載入" };
  if (ordersLevel !== "editable") {
    return { allowed: false, reason: "您對「訂單」模組沒有編輯權限，無法修改加購。" };
  }
  if (!currentAccommodationId || !order.accommodation_id) {
    return { allowed: false, reason: "無法確認館別，無法修改加購。" };
  }
  if (order.accommodation_id !== currentAccommodationId) {
    return { allowed: false, reason: "此訂單不屬於目前館別，無法修改加購。" };
  }
  if (!isPaidAddonFlowOrder(order)) {
    return { allowed: false, reason: "此訂單尚未結清，請使用一般編輯流程。" };
  }
  return { allowed: true };
}

export type PaidAddonRiskKind = "none" | "refund" | "cancelled" | "refund_and_cancelled";

/** 高風險狀態偵測（與 RPC 相同判定）：不阻擋，改為紅色提醒 + 額外確認 */
export function getPaidAddonRisk(order: PaidAddonOrderLike | null | undefined): PaidAddonRiskKind {
  if (!order) return "none";
  const refundStatus = (order.refund_status || "none").toLowerCase();
  const refunding =
    REFUND_IN_PROGRESS.includes(refundStatus) ||
    ["refunded", "partial_refunded"].includes((order.payment_status || "").toLowerCase()) ||
    Number(order.refunded_amount ?? 0) > 0 ||
    !!order.refunded_at;
  const cancelled = (order.order_status || "").toLowerCase() === "cancelled";
  if (refunding && cancelled) return "refund_and_cancelled";
  if (refunding) return "refund";
  if (cancelled) return "cancelled";
  return "none";
}

export function riskMessage(kind: PaidAddonRiskKind): string | null {
  switch (kind) {
    case "refund":
      return "此訂單已退款或退款處理中，修改加購屬高風險操作。";
    case "cancelled":
      return "此訂單已取消，修改加購屬高風險操作。";
    case "refund_and_cancelled":
      return "此訂單已取消且已退款／退款處理中，修改加購屬高風險操作。";
    default:
      return null;
  }
}

export interface PaidAddonRpcInput {
  orderId: string;
  expectedUpdatedAt: string;
  reason: string;
  settlement: SettlementHandling | "";
  confirmed: boolean;
  /** 額外現場加購金額；undefined = 不變更 */
  onsiteAmount?: number;
  /** 額外現場加購備註；undefined = 不變更 */
  onsiteNote?: string;
  /** 已收金額；undefined = 不變更（不自動收款、不自動退款） */
  paidAmount?: number;
  reduceAcknowledged?: boolean;
  riskAcknowledged?: boolean;
}

/** 純函式：組 RPC 參數；任何必填缺漏一律 throw，確保 0 mutation */
export function buildPaidAddonRpcArgs(input: PaidAddonRpcInput): Record<string, unknown> {
  if (!input.orderId) throw new Error("缺少訂單編號，未做任何修改");
  if (!input.expectedUpdatedAt) throw new Error("訂單版本資訊尚未載入，請重新整理後再試");
  if ((input.reason || "").trim().length < 2) throw new Error("請填寫修改原因");
  if (!isValidSettlement(input.settlement)) throw new Error("請選擇差額處理方式");
  if (input.confirmed !== true) throw new Error("尚未完成二次確認，未做任何修改");
  return {
    p_order_id: input.orderId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason.trim(),
    p_settlement_handling: input.settlement,
    p_confirmed: true,
    p_addons: null,
    p_pet_plan_price: null,
    p_onsite_amount: input.onsiteAmount ?? null,
    p_onsite_note: input.onsiteNote ?? null,
    p_paid_amount: input.paidAmount ?? null,
    p_reduce_acknowledged: input.reduceAcknowledged === true,
    p_risk_acknowledged: input.riskAcknowledged === true,
  };
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** 唯一寫入入口。錯誤一律原樣拋出後端訊息，不做 fallback。 */
export async function callUpdatePaidOrderAddonsV2(
  client: RpcClient,
  input: PaidAddonRpcInput,
): Promise<PaidAmountRpcResult> {
  const args = buildPaidAddonRpcArgs(input);
  const { data, error } = await client.rpc(PAID_ADDON_RPC, args);
  if (error) throw new Error(error.message || "加購修改失敗");
  return data as unknown as PaidAmountRpcResult;
}
