import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * 守門測試：全站禁止手寫前台訂房頁路徑字串。
 * 任何新連結一律使用 src/lib/frontendUrl.ts 的 openFrontendBooking() /
 * bookingPath() / bookingAbsoluteUrl()，避免再度連到舊版 /booking/{uuid}。
 */
const ALLOWLIST = [
  "src/lib/frontendUrl.ts", // 唯一實作
  "src/lib/recentViews.ts", // 舊路徑正規化 regex
  "src/components/LegacyBookingRedirect.tsx", // 舊路徑轉址本體
  "src/components/AliasResolver.tsx", // alias → villa 轉址本體
  "src/pages/Index.tsx", // 子網域根路徑轉址本體
  "src/pages/BookingAccommodation.tsx", // 已停用的舊頁（僅保留轉址）
  "src/lib/memberPreviewMock.ts", // 預覽模式假資料
  "src/App.tsx", // 路由定義
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("前台訂房頁連結守門", () => {
  const files = walk("src").filter((f) => !ALLOWLIST.includes(f.replace(/\\/g, "/")));

  it("不得手寫 /booking/${...} 動態路徑", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (/["'`]\/booking\/\$\{/.test(line) || /`\/booking\/villa\/\$\{/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders, `請改用 openFrontendBooking()／bookingPath():\n${offenders.join("\n")}`).toEqual([]);
  });
});
