/**
 * 台灣（Asia/Taipei, UTC+8）今日日期（yyyy-MM-dd）。
 * 與前端 src/lib/taipeiToday.ts 同一套公式（有 parity 測試）。
 */
export function taipeiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default taipeiToday;
