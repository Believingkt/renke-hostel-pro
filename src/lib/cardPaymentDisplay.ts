/**
 * 前台／後台顯示用的「是否為信用卡收款訂單」判定。
 *
 * ⚠️ 規則必須與 server 端唯一 Source of Truth 對齊：
 *    supabase/functions/_shared/orderRefund.ts → isCardPaidOrder()
 *    （測試 src/test/group-buy-card-cancel-ui.test.ts 會逐一比對兩者結果）
 *
 * 本檔只用於 UI 分流顯示，任何實際退款判斷一律以 server 為準。
 */

const CARD_METHODS = new Set(["credit_card", "credit_card_3ds", "card", "信用卡"]);
const ATM_METHODS = new Set(["atm", "ATM", "atm_transfer"]);

export interface CardDisplayOrderShape {
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
  payment_provider?: string | null;
}

/** 與 server isCardPaidOrder 相同規則（ATM／轉帳／現金一律 false） */
export function isCardPaidOrderDisplay(order: CardDisplayOrderShape | null | undefined): boolean {
  if (!order) return false;
  const methods = [
    order.balance_payment_method,
    order.payment_method,
    order.deposit_payment_method,
  ].filter(Boolean) as string[];
  if (methods.some((m) => ATM_METHODS.has(m))) return false;
  if (methods.some((m) => CARD_METHODS.has(m))) return true;
  return !!order.room_charge_rec_trade_id;
}

/** TapPay 線上刷卡訂單（provider = tappay 且付款方式為信用卡）→ 退款必須走原卡退刷 */
export function isTappayCardOrder(order: CardDisplayOrderShape | null | undefined): boolean {
  if (!order) return false;
  return order.payment_provider === "tappay" && isCardPaidOrderDisplay(order);
}
