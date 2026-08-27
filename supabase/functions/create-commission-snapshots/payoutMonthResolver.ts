// 發放月（payout_month）解析與防呆規則（純函式，供 index.ts 與測試共用）
//
// 規則：
// 1. 手動重算（test_mode = true）必須明確帶入 payout_month（YYYY-MM），否則直接回 400，
//    絕不沿用「執行當月」，避免產生 snapshot_month === payout_month 的錯誤期別，
//    也不會覆寫任何既有快照的 payout_month。
// 2. 排程執行（test_mode = false）維持原本邏輯：payout_month = 執行當月（台北時區）。
// 3. payout_month 格式錯誤一律視為未提供。

export const PAYOUT_MONTH_REQUIRED_ERROR =
  "手動重算必須明確指定發放月 payout_month（格式 YYYY-MM，通常為資料月 +1）。未指定時不會沿用執行當月，請重新送出。";

export const PAYOUT_MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** 可機讀錯誤代碼（前端依代碼顯示對應提示與建議操作） */
export type PayoutMonthErrorCode =
  | "PAYOUT_MONTH_MISSING"
  | "PAYOUT_MONTH_INVALID_FORMAT"
  | "PAYOUT_MONTH_EQUALS_SNAPSHOT"
  | "PAYOUT_MONTH_ROLLOVER_MISMATCH";

/** 錯誤分類（供告警/報表聚合） */
export type PayoutMonthErrorCategory =
  | "missing"
  | "invalid_format"
  | "equals_snapshot"
  | "rollover_mismatch";

export const PAYOUT_MONTH_ERROR_CATEGORY: Record<PayoutMonthErrorCode, PayoutMonthErrorCategory> = {
  PAYOUT_MONTH_MISSING: "missing",
  PAYOUT_MONTH_INVALID_FORMAT: "invalid_format",
  PAYOUT_MONTH_EQUALS_SNAPSHOT: "equals_snapshot",
  PAYOUT_MONTH_ROLLOVER_MISMATCH: "rollover_mismatch",
};

export function payoutEqualsSnapshotError(month: string, expected: string | null): string {
  return `發放月（${month}）與資料月相同，這會造成期別錯誤，已中止。${
    expected ? `正確發放月應為 ${expected}。` : ""
  }`.trim();
}

export function payoutRolloverMismatchError(month: string, expected: string): string {
  return `發放月（${month}）跨年推算錯誤，依規則（資料月 +1）應為 ${expected}，已中止以免快照寫入錯誤年度。`;
}


/** 月份字串是否合法（含 01-12 範圍檢查） */
export function isValidMonthKey(value: unknown): value is string {
  if (typeof value !== "string" || !PAYOUT_MONTH_PATTERN.test(value)) return false;
  const m = Number(value.split("-")[1]);
  return m >= 1 && m <= 12;
}

/** 資料月 +1 = 預期發放月 */
export function nextMonthKey(monthKey: string): string | null {
  if (!isValidMonthKey(monthKey)) return null;
  const [y, m] = monthKey.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export interface ResolvePayoutMonthInput {
  /** 請求 body（未知型別，容忍任意輸入） */
  body: Record<string, unknown> | null | undefined;
  /** 執行當下台北時區的年 */
  payoutYear: number;
  /** 執行當下台北時區的月（1-12） */
  payoutMonth: number;
  /** 本次要產生的資料月（快照月），YYYY-MM；用於期別防呆 */
  snapshotMonth?: string | null;
}

export type ResolvePayoutMonthResult =
  | { ok: true; payoutMonthStr: string; source: "override" | "execution_month" }
  | {
      ok: false;
      status: 400;
      error: string;
      error_code: PayoutMonthErrorCode;
      error_category: PayoutMonthErrorCategory;
      snapshot_month: string | null;
      expected_payout_month: string | null;
      received_payout_month: string | null;
    };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fail(
  code: PayoutMonthErrorCode,
  error: string,
  meta: {
    snapshotMonth: string | null;
    expected: string | null;
    received: string | null;
  },
): ResolvePayoutMonthResult {
  return {
    ok: false,
    status: 400,
    error,
    error_code: code,
    error_category: PAYOUT_MONTH_ERROR_CATEGORY[code],
    snapshot_month: meta.snapshotMonth,
    expected_payout_month: meta.expected,
    received_payout_month: meta.received,
  };
}

export function resolvePayoutMonth({
  body,
  payoutYear,
  payoutMonth,
  snapshotMonth,
}: ResolvePayoutMonthInput): ResolvePayoutMonthResult {
  const testMode = (body as Record<string, unknown> | null)?.test_mode === true;
  const raw = (body as Record<string, unknown> | null)?.payout_month;
  const override = isValidMonthKey(raw) ? raw : null;

  const snap = isValidMonthKey(snapshotMonth) ? snapshotMonth : null;
  const expected = snap ? nextMonthKey(snap) : null;
  const received = typeof raw === "string" ? raw : raw == null ? null : String(raw);
  const meta = { snapshotMonth: snap, expected, received };

  if (testMode && !override) {
    const provided = raw !== undefined && raw !== null && raw !== "";
    return fail(
      provided ? "PAYOUT_MONTH_INVALID_FORMAT" : "PAYOUT_MONTH_MISSING",
      provided
        ? `發放月格式錯誤（收到「${received}」），需為 YYYY-MM 且月份介於 01-12。${PAYOUT_MONTH_REQUIRED_ERROR}`
        : PAYOUT_MONTH_REQUIRED_ERROR,
      meta,
    );
  }

  if (override) {
    if (snap && override === snap) {
      return fail(
        "PAYOUT_MONTH_EQUALS_SNAPSHOT",
        payoutEqualsSnapshotError(override, expected),
        meta,
      );
    }
    // 跨年推算錯誤：月份對、年度錯（例：資料月 2026-12 卻送 2026-01）
    if (expected && override !== expected && override.slice(5) === expected.slice(5)) {
      return fail(
        "PAYOUT_MONTH_ROLLOVER_MISMATCH",
        payoutRolloverMismatchError(override, expected),
        meta,
      );
    }
    return { ok: true, payoutMonthStr: override, source: "override" };
  }

  const execStr = `${payoutYear}-${pad2(payoutMonth)}`;
  if (snap && execStr === snap) {
    return fail("PAYOUT_MONTH_EQUALS_SNAPSHOT", payoutEqualsSnapshotError(execStr, expected), {
      ...meta,
      received: execStr,
    });
  }

  return {
    ok: true,
    payoutMonthStr: execStr,
    source: "execution_month",
  };

}

