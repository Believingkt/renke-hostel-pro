import { format } from "date-fns";

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
}

/** 從備註取出實際開立的 ATM 轉帳（訂金）金額，取不到則以未付餘額為準 */
export function getAtmTransferAmount(order?: AtmSourceOrder | null): number {
  const fromNotes = Number(
    order?.notes?.match(/訂金\s*NT\$\s*([\d,]+)/)?.[1]?.replace(/,/g, "")
  );
  if (fromNotes > 0) return fromNotes;
  return Math.max(0, (order?.final_price || 0) - (order?.paid_amount || 0));
}

/** 備註中的訂金比例（例如 30） */
export function getAtmDepositPercent(order?: AtmSourceOrder | null): number | null {
  const pct = order?.notes?.match(/的\s*(\d+)%/)?.[1];
  return pct ? Number(pct) : null;
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
