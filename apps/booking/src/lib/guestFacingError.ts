/**
 * 客人可見頁面的錯誤訊息轉譯層。
 *
 * 固定安全規範：客人前台永遠不得看到程式碼、JSON、raw metadata、API/Edge Function/Supabase/SQL
 * 原始錯誤、stack trace、內部欄位或 table/column 名稱、UUID 等內部 ID、storage path、debug 資訊。
 * 只有「業務語意」的中文訊息可以原樣顯示，其餘一律換成友善 fallback。
 * 技術細節請留在 console / server log / 稽核紀錄，不要傳到 UI。
 */

export const GUEST_GENERIC_ERROR = "目前無法完成操作，請稍後再試或聯繫客服。";

/** 一旦命中就視為技術資訊，不可對客顯示 */
const TECHNICAL_PATTERNS: RegExp[] = [
  /[{}[\]<>]/, // JSON / HTML / 物件片段
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // UUID
  /https?:\/\//i, // URL / endpoint
  /\b(supabase|postgres|postgrest|pgrst\d*|sql|rls|jwt|edge function|functions\.invoke|non-2xx|status code|fetch|network error|typeerror|referenceerror|syntaxerror|undefined|null pointer|stack|traceback|exception|constraint|duplicate key|violates|relation|column|table|schema|rpc|payload|metadata|internal_error|timeout of|econn|http \d{3})\b/i,
  /\b\w+_(id|at|key|url|token|status|type)\b/i, // 內部欄位名（order_id / created_at / campaign_id…）
  /\b(select|insert|update|delete)\s+(from|into|table)\b/i,
  /\bat\s+\w+\s*\(/, // stack frame
];

/** 允許對客顯示的業務訊息：需含中文，且長度合理，且不含技術特徵 */
export function isGuestSafeMessage(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const msg = raw.trim();
  if (msg.length === 0 || msg.length > 120) return false;
  if (!/[\u4e00-\u9fff]/.test(msg)) return false; // 純英文一律視為技術訊息
  return !TECHNICAL_PATTERNS.some((re) => re.test(msg));
}

/**
 * 將任意錯誤來源（Error、Edge Function payload.error、字串）轉為客人可見文案。
 * 只有通過白名單檢查的業務訊息會原樣回傳，其餘回傳 fallback。
 */
export function toGuestMessage(raw: unknown, fallback: string = GUEST_GENERIC_ERROR): string {
  if (isGuestSafeMessage(raw)) return raw.trim();
  return fallback;
}
