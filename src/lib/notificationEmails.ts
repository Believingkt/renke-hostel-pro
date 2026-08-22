// 訂房通知信箱共用規則（後台 UI 與後端 resolve 使用同一套語意）
export const MAX_NOTIFICATION_EMAILS = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidNotificationEmail(v: string): boolean {
  const s = v.trim();
  return s.length > 0 && s.length <= 254 && EMAIL_RE.test(s);
}

/** trim → lowercase → 過濾空值／無效 → 去重 → 上限 10 筆 */
export function normalizeNotificationEmails(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s || !isValidNotificationEmail(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_NOTIFICATION_EMAILS);
}

/** 儲存前驗證：回傳第一個錯誤訊息，通過則回傳 null */
export function validateNotificationEmails(list: string[]): string | null {
  const nonEmpty = list.map((v) => v.trim()).filter(Boolean);
  const invalid = nonEmpty.find((v) => !isValidNotificationEmail(v));
  if (invalid) return `Email 格式不正確：${invalid}`;
  if (nonEmpty.length > MAX_NOTIFICATION_EMAILS) {
    return `通知信箱最多 ${MAX_NOTIFICATION_EMAILS} 筆`;
  }
  return null;
}
