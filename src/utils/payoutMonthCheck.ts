/**
 * 手動重新試算的「回填前置檢查」。
 *
 * 目的：避免再次發生 payout_month 缺失或被寫成「執行當月」，
 * 造成 snapshot_month === payout_month 的錯誤期別。
 */

export const PAYOUT_MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** 資料月 +1 = 預期發放月 */
export function nextMonthKey(monthKey: string): string | null {
  if (!PAYOUT_MONTH_PATTERN.test(monthKey)) return null;
  const [y, m] = monthKey.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export interface PayoutPrecheckInput {
  /** 資料月（快照月），格式 YYYY-MM */
  snapshotMonth: string;
  /** 畫面上選擇的發放年 */
  selectedYear: number;
  /** 畫面上選擇的發放月（1-12） */
  selectedMonth: number;
}

export interface PayoutPrecheckResult {
  /** 是否可以送出（blocked 時必須中止） */
  ok: boolean;
  /** blocked = 必須中止；warn = 需二次確認；clear = 正常 */
  level: "clear" | "warn" | "blocked";
  /** 實際會送出的發放月（blocked 時為 null） */
  payoutMonth: string | null;
  /** 預期發放月（資料月 +1） */
  expectedPayoutMonth: string | null;
  /** 給使用者看的明確訊息 */
  message: string | null;
}

export function precheckPayoutMonth({
  snapshotMonth,
  selectedYear,
  selectedMonth,
}: PayoutPrecheckInput): PayoutPrecheckResult {
  const expected = nextMonthKey(snapshotMonth);

  if (!expected) {
    return {
      ok: false,
      level: "blocked",
      payoutMonth: null,
      expectedPayoutMonth: null,
      message: `無法判定資料月（取得「${snapshotMonth}」，需為 YYYY-MM 格式），已中止重新試算以免快照被寫入錯誤發放月。請重新選擇年月後再試。`,
    };
  }

  if (
    !Number.isInteger(selectedYear) ||
    !Number.isInteger(selectedMonth) ||
    selectedMonth < 1 ||
    selectedMonth > 12
  ) {
    return {
      ok: false,
      level: "blocked",
      payoutMonth: null,
      expectedPayoutMonth: expected,
      message: "畫面選擇的發放年月無效，已中止重新試算。請重新選擇年月後再試。",
    };
  }

  const selected = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  if (selected === snapshotMonth) {
    return {
      ok: false,
      level: "blocked",
      payoutMonth: null,
      expectedPayoutMonth: expected,
      message: `發放月（${selected}）與資料月（${snapshotMonth}）相同，這正是先前造成快照期別錯誤的情況，已中止。正確發放月應為 ${expected}。`,
    };
  }

  if (selected !== expected) {
    return {
      ok: true,
      level: "warn",
      payoutMonth: selected,
      expectedPayoutMonth: expected,
      message: `即將把資料月 ${snapshotMonth} 的快照寫入發放月 ${selected}，但依規則（資料月 +1）預期應為 ${expected}。確認要以 ${selected} 送出嗎？`,
    };
  }

  return {
    ok: true,
    level: "clear",
    payoutMonth: selected,
    expectedPayoutMonth: expected,
    message: null,
  };
}
