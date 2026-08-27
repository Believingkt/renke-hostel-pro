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

export interface ResolvePayoutMonthInput {
  /** 請求 body（未知型別，容忍任意輸入） */
  body: Record<string, unknown> | null | undefined;
  /** 執行當下台北時區的年 */
  payoutYear: number;
  /** 執行當下台北時區的月（1-12） */
  payoutMonth: number;
}

export type ResolvePayoutMonthResult =
  | { ok: true; payoutMonthStr: string; source: "override" | "execution_month" }
  | { ok: false; status: 400; error: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function resolvePayoutMonth({
  body,
  payoutYear,
  payoutMonth,
}: ResolvePayoutMonthInput): ResolvePayoutMonthResult {
  const testMode = (body as Record<string, unknown> | null)?.test_mode === true;
  const raw = (body as Record<string, unknown> | null)?.payout_month;
  const override =
    typeof raw === "string" && PAYOUT_MONTH_PATTERN.test(raw) ? raw : null;

  if (testMode && !override) {
    return { ok: false, status: 400, error: PAYOUT_MONTH_REQUIRED_ERROR };
  }

  if (override) {
    return { ok: true, payoutMonthStr: override, source: "override" };
  }

  return {
    ok: true,
    payoutMonthStr: `${payoutYear}-${pad2(payoutMonth)}`,
    source: "execution_month",
  };
}
