/**
 * 台灣（Asia/Taipei, UTC+8）今日日期（yyyy-MM-dd）。
 *
 * 全站團購頁「入住日不可早於今天」一律使用此 helper，
 * 不要在各元件內自行使用 new Date().toISOString().slice(0,10)（那是 UTC 日期，
 * 台灣凌晨 00:00–08:00 會少一天）。
 *
 * 後端（Deno）對應實作：supabase/functions/_shared/taipeiToday.ts，
 * 兩者公式相同，並由 src/lib/__tests__/taipeiToday.test.ts 做 parity 驗證。
 */
export function taipeiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default taipeiToday;
