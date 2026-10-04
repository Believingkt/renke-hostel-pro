/**
 * 前台／後台顯示用的「是否為信用卡收款訂單」判定。
 *
 * 規則本體已抽到唯一 Source of Truth：
 *   supabase/functions/_shared/cardPaymentRule.ts → isCardPaidOrderRule()
 * server 端 _shared/orderRefund.ts → isCardPaidOrder() 亦 re-export 同一份實作，
 * 因此前後端不可能再漂移（測試 src/test/group-buy-card-cancel-ui.test.ts 仍逐一比對）。
 */

import {
  ATM_METHODS,
  type CardPaymentOrderShape,
  isCardPaidOrderRule,
} from "../../../../supabase/functions/_shared/cardPaymentRule";

export { ATM_METHODS };
export type CardDisplayOrderShape = CardPaymentOrderShape;

/** 與 server isCardPaidOrder 相同規則（ATM／轉帳／現金一律 false） */
export const isCardPaidOrderDisplay = isCardPaidOrderRule;

/** TapPay 線上刷卡訂單（provider = tappay 且付款方式為信用卡）→ 退款必須走原卡退刷 */
export function isTappayCardOrder(order: CardDisplayOrderShape | null | undefined): boolean {
  if (!order) return false;
  return order.payment_provider === "tappay" && isCardPaidOrderDisplay(order);
}
