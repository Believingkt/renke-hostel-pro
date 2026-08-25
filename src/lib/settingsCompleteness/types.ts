/**
 * 設定完整性檢查｜共用型別。
 *
 * 三個檢查群組共用同一組結果結構，UI 才能共用矩陣、修補彈窗與統計卡。
 */

export type CheckLevel = "ok" | "warn" | "error";

export interface CheckResult {
  level: CheckLevel;
  /** 格子上顯示的短文字 */
  label: string;
  /** 點擊後導向的設定頁（相對路徑）；沒有就不掛連結 */
  href?: string;
  /** 修補指引：說明為什麼缺漏、要做什麼 */
  hint?: string;
  /** 目標頁面名稱（彈窗顯示） */
  target?: string;
  /** 需要補齊的欄位清單（彈窗顯示） */
  fields?: string[];
}

/** 館別維度：一列一館，多欄檢查 */
export interface VenueCheckRow {
  accId: string;
  accName: string;
  checks: Record<string, CheckResult>;
}

/** 全站維度：一列一個設定項 */
export interface GlobalCheckRow {
  key: string;
  label: string;
  /** 這個設定在算式裡的角色（取自 bonusSettingImpact） */
  role?: string;
  /** 受影響的獎金名稱 */
  affects: string[];
  result: CheckResult;
}

export interface CheckColumn {
  key: string;
  label: string;
}

export type CheckGroupKey = "ragic" | "bonus-venue" | "bonus-global";

export const OK: CheckResult = { level: "ok", label: "已設定" };

export function levelOf(row: VenueCheckRow, columns: readonly CheckColumn[]): CheckLevel {
  const levels = columns.map((c) => row.checks[c.key]?.level ?? "ok");
  if (levels.includes("error")) return "error";
  if (levels.includes("warn")) return "warn";
  return "ok";
}
