/**
 * 後端 create-commission-snapshots 回傳 400 時的可機讀錯誤代碼對應。
 * 前端依代碼顯示「原因 + 建議操作」，並在 UI 上阻止重複送出。
 */

export type PayoutMonthErrorCode =
  | "PAYOUT_MONTH_MISSING"
  | "PAYOUT_MONTH_INVALID_FORMAT"
  | "PAYOUT_MONTH_EQUALS_SNAPSHOT"
  | "PAYOUT_MONTH_ROLLOVER_MISMATCH";

export interface PayoutMonthErrorBody {
  error?: string;
  error_code?: string;
  error_category?: string;
  snapshot_month?: string | null;
  expected_payout_month?: string | null;
  received_payout_month?: string | null;
}

export interface PayoutErrorPresentation {
  code: string;
  title: string;
  reason: string;
  action: string;
  /** true = 相同參數重送一定再失敗，UI 需阻止重送 */
  blockResend: boolean;
  snapshotMonth: string | null;
  expectedPayoutMonth: string | null;
  receivedPayoutMonth: string | null;
}

const MAP: Record<PayoutMonthErrorCode, { title: string; action: string }> = {
  PAYOUT_MONTH_MISSING: {
    title: "缺少發放月（payout_month）",
    action: "請關閉此視窗，重新選擇發放年月後再試算；系統不會沿用「執行當月」。",
  },
  PAYOUT_MONTH_INVALID_FORMAT: {
    title: "發放月格式錯誤",
    action: "發放月需為 YYYY-MM（月份 01-12）。請重新選擇年月後再送出。",
  },
  PAYOUT_MONTH_EQUALS_SNAPSHOT: {
    title: "發放月與資料月相同",
    action: "請把發放月改為「資料月 +1」後再送出，否則 TeamHome 與統計 Tab 金額會對不上。",
  },
  PAYOUT_MONTH_ROLLOVER_MISMATCH: {
    title: "跨年發放月推算錯誤",
    action: "跨年時發放月的年度需 +1（例：資料月 2026-12 → 發放月 2027-01）。請修正年份後再送出。",
  },
};

export function presentPayoutMonthError(
  body: PayoutMonthErrorBody | null | undefined,
): PayoutErrorPresentation | null {
  const code = body?.error_code;
  if (!code) return null;
  const known = MAP[code as PayoutMonthErrorCode];
  return {
    code,
    title: known?.title ?? "重新試算被後端拒絕",
    reason: body?.error ?? "後端未提供錯誤說明。",
    action: known?.action ?? "請調整參數後再送出，或聯繫系統管理員。",
    blockResend: true,
    snapshotMonth: body?.snapshot_month ?? null,
    expectedPayoutMonth: body?.expected_payout_month ?? null,
    receivedPayoutMonth: body?.received_payout_month ?? null,
  };
}

/** 從 cron-dispatcher-commission 的 results 陣列中挑出 400 失敗步驟 */
export function extractPayoutMonthError(
  results: Array<{ fn: string; ok?: boolean; status?: number | null; body?: unknown }> | undefined,
): PayoutErrorPresentation | null {
  for (const r of results ?? []) {
    if (r?.ok === false && r?.status === 400) {
      const presented = presentPayoutMonthError(r.body as PayoutMonthErrorBody);
      if (presented) return { ...presented, code: presented.code };
    }
  }
  return null;
}
