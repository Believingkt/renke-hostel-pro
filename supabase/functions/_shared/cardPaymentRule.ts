/**
 * 「這張訂單是否以信用卡收款」的唯一判定規則。
 *
 * 純 TypeScript、零 import，前端（src/lib/cardPaymentDisplay.ts）與
 * Edge Function（_shared/orderRefund.ts）皆 re-export 本檔，
 * 比照 _shared/refundFee.ts 的跨端共用先例，杜絕兩份實作漂移。
 *
 * 規則順序：三個付款方式欄位中任一為 ATM → 一律不是信用卡；
 *          任一為卡別 → 是信用卡；最後才看是否有刷卡交易編號。
 */

const CARD_METHODS = new Set(["credit_card", "credit_card_3ds", "card", "信用卡"]);
export const ATM_METHODS = new Set(["atm", "ATM", "atm_transfer"]);

export interface CardPaymentOrderShape {
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
  payment_provider?: string | null;
}

export function isCardPaidOrderRule(order: CardPaymentOrderShape | null | undefined): boolean {
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
