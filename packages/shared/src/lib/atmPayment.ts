import { format } from "date-fns";
import { resolvePaymentSummary } from "@lakeze/shared/lib/paymentSummary";

/**
 * ATM 虛擬帳號共用邏輯：確保會員端、後台訂單列表與訂單明細顯示一致。
 */

export interface AtmSourceOrder {
  notes?: string | null;
  final_price?: number | null;
  paid_amount?: number | null;
  atm_vacc_no?: string | null;
  atm_vacc_bank_code?: string | null;
  atm_expire_at?: string | null;
  payment_status?: string | null;
  booking_deposit_amount?: number | null;
  booking_deposit_percentage?: number | null;
}

/**
 * ATM 應繳（訂房訂金）金額。
 * SoT 順序：orders.booking_deposit_amount 快照 → notes legacy parser → 未付餘額。
 * 一律不使用 deposit_required_amount（入住押金）或當前 booking_settings。
 */
export function getAtmTransferAmount(order?: AtmSourceOrder | null): number {
  const s = resolvePaymentSummary(order);
  if (s.bookingDepositAmount > 0) {
    return s.pendingBookingDeposit > 0 ? s.pendingBookingDeposit : s.bookingDepositAmount;
  }
  return Math.max(0, (order?.final_price || 0) - (order?.paid_amount || 0));
}

/** 訂金比例（快照優先，其次備註 legacy） */
export function getAtmDepositPercent(order?: AtmSourceOrder | null): number | null {
  return resolvePaymentSummary(order).bookingDepositPercentage;
}

export function getAtmExpireDate(order?: AtmSourceOrder | null): Date | null {
  return order?.atm_expire_at ? new Date(order.atm_expire_at) : null;
}

/** 是否已超過繳費期限（且尚未付款） */
export function isAtmExpired(order?: AtmSourceOrder | null, now: number = Date.now()): boolean {
  if (!order?.atm_vacc_no || !order?.atm_expire_at) return false;
  if (order.payment_status === "paid" || order.payment_status === "deposit_paid") return false;
  return new Date(order.atm_expire_at).getTime() <= now;
}

export function formatAtmExpire(date: Date | null, pattern = "yyyy/MM/dd HH:mm"): string {
  return date ? format(date, pattern) : "—";
}

/** 一次取得顯示用資訊 */
export function getAtmDisplayInfo(order?: AtmSourceOrder | null, now: number = Date.now()) {
  const hasAtm = !!order?.atm_vacc_no;
  const expireAt = getAtmExpireDate(order);
  return {
    hasAtm,
    amount: getAtmTransferAmount(order),
    depositPercent: getAtmDepositPercent(order),
    expireAt,
    expireText: formatAtmExpire(expireAt),
    expired: isAtmExpired(order, now),
  };
}
