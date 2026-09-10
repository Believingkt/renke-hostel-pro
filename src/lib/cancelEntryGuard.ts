/**
 * 「已取消」不得由通用狀態變更入口設定的防呆判定。
 *
 * 團購訂單與信用卡訂單各自有專屬取消流程（退款、佣金、取消通知信），
 * 直接把狀態改成 cancelled 會全部繞過，因此前端擋下、資料庫 RPC 亦有同規則的最後一道防線。
 */

import { isCardPaidOrderDisplay, type CardDisplayOrderShape } from "@/lib/cardPaymentDisplay";

export interface CancelGuardOrderShape extends CardDisplayOrderShape {
  order_status?: string | null;
  order_source?: string | null;
}

/** 這筆訂單是否禁止用通用狀態變更改成「已取消」 */
export function isCancelBlockedOrder(order: CancelGuardOrderShape | null | undefined): boolean {
  if (!order) return false;
  if (order.order_status === "cancelled") return false;
  return order.order_source === "group_buy" || isCardPaidOrderDisplay(order);
}

/** 對應的導引文字（告訴使用者正確入口） */
export function buildCancelBlockHint(order: CancelGuardOrderShape | null | undefined): string {
  if (order?.order_source === "group_buy") {
    return "團購訂單請改用團購管理的「取消／退款」，才會一併處理退款、佣金與取消通知信。";
  }
  return "信用卡訂單請改用訂單詳情頁的「取消訂單」，才會一併原卡退刷並寄出取消通知信。";
}

/** 資料庫防線丟出的例外 → 轉成看得懂的提示，不顯示原始 SQL 字串 */
export function isCancelBlockedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
  return typeof msg === "string" && msg.includes("ORDER_CANCEL_BLOCKED");
}
