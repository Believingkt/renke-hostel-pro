/**
 * 一般訂房「付款摘要」單一真實來源（會員中心 / ATM 完成頁 / 訂單確認信共用）。
 *
 * 規則：
 * - 訂房訂金一律以 orders.booking_deposit_amount / booking_deposit_percentage 為準（下單當下快照）。
 * - 舊訂單沒有快照時，才回退解析 notes 內的「訂金 NT$ x（… n%）」（legacy fallback）。
 * - 絕對不可使用 deposit_required_amount（那是「入住押金 / security deposit」，與訂房付款無關）。
 */

export interface PaymentSummaryOrder {
  final_price?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  notes?: string | null;
  atm_vacc_no?: string | null;
  atm_expire_at?: string | null;
  booking_deposit_amount?: number | null;
  booking_deposit_percentage?: number | null;
}

export interface PaymentSummary {
  totalAmount: number;
  bookingDepositAmount: number;
  bookingDepositPercentage: number | null;
  paidAmount: number;
  /** 尚未支付的訂房訂金（例如 ATM 待匯款） */
  pendingBookingDeposit: number;
  /** 入住現場應付尾款 */
  accommodationBalance: number;
  isFullPayment: boolean;
  isLegacyDepositFallback: boolean;
  /** 摘要區塊要凸顯的金額與標題 */
  payAmount: number;
  payTitle: string;
  atmExpired: boolean;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 舊訂單相容：從備註解析訂金金額 */
export function parseLegacyDepositFromNotes(notes?: string | null): { amount: number; percentage: number | null } {
  const amount = Number(notes?.match(/訂金\s*NT\$\s*([\d,]+)/)?.[1]?.replace(/,/g, "") || 0);
  const pct = notes?.match(/的\s*(\d+)%/)?.[1];
  return { amount: amount > 0 ? amount : 0, percentage: pct ? Number(pct) : null };
}

export function resolvePaymentSummary(order?: PaymentSummaryOrder | null, now: number = Date.now()): PaymentSummary {
  const totalAmount = Math.max(0, Math.round(num(order?.final_price)));
  const paidAmount = Math.max(0, Math.round(num(order?.paid_amount)));
  const isPaid = order?.payment_status === "paid";

  const snapshot = Math.round(num(order?.booking_deposit_amount));
  const legacy = parseLegacyDepositFromNotes(order?.notes);
  const isLegacyDepositFallback = snapshot <= 0 && legacy.amount > 0;

  const bookingDepositAmount = Math.min(totalAmount, snapshot > 0 ? snapshot : legacy.amount);
  const snapshotPct = order?.booking_deposit_percentage;
  const bookingDepositPercentage =
    snapshot > 0 && snapshotPct != null && Number.isFinite(Number(snapshotPct))
      ? Number(snapshotPct)
      : isLegacyDepositFallback
        ? legacy.percentage
        : null;

  const atmExpired =
    !!order?.atm_vacc_no &&
    !!order?.atm_expire_at &&
    !isPaid &&
    order.payment_status !== "deposit_paid" &&
    new Date(order.atm_expire_at).getTime() <= now;

  // 尚待支付的訂房訂金＝訂金 − 已付（已全額付清時為 0）
  const pendingBookingDeposit = isPaid
    ? 0
    : Math.max(bookingDepositAmount - paidAmount, 0);

  // 入住現場尾款＝總額 −（訂金與已付金額取大者）；與「未補足訂金」是兩件事
  const accommodationBalance = Math.max(
    totalAmount - Math.max(bookingDepositAmount, paidAmount),
    0,
  );
  const isFullPayment = bookingDepositAmount <= 0 || bookingDepositAmount >= totalAmount;

  const depositSettled = bookingDepositAmount > 0 && paidAmount >= bookingDepositAmount;

  const payAmount = isPaid
    ? totalAmount
    : pendingBookingDeposit > 0
      ? pendingBookingDeposit
      : depositSettled
        ? paidAmount
        : totalAmount;
  const payTitle = isPaid
    ? "已付款"
    : pendingBookingDeposit > 0
      ? atmExpired
        ? "訂金已逾期未付"
        : paidAmount > 0
          ? "待補足訂金"
          : "待匯款訂金"
      : depositSettled
        ? "已付訂金"
        : "待付款";

  return {
    totalAmount,
    bookingDepositAmount,
    bookingDepositPercentage,
    paidAmount,
    pendingBookingDeposit,
    accommodationBalance,
    isFullPayment,
    isLegacyDepositFallback,
    payAmount,
    payTitle,
    atmExpired,
  };
}
