/**
 * 保留單判斷（統一入口）。
 *
 * 權威依據為 orders.order_status = 'hold'（CreateHoldOrderDialog 建單時寫入）。
 * 不再使用 guest_name = '保留單' — 該字串會在客服補填客人姓名後消失，
 * 也可能殘留在已轉正的訂單上，造成獎金／營收口徑誤判。
 *
 * 語意：只有「當下仍在保留中」才排除；轉為其他狀態＝已成交，
 * 是否納入獎金池改由各獎金池的訂單來源白名單決定。
 */
export const HOLD_ORDER_STATUS = "hold";

export function isHoldOrder(o?: { order_status?: string | null } | null): boolean {
  return String(o?.order_status ?? "") === HOLD_ORDER_STATUS;
}
