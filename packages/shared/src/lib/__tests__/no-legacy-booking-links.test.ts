import { describe, it, expect } from "vitest";

/**
 * 守門測試：全站禁止手寫前台訂房頁路徑字串。
 * 任何新連結一律使用 src/lib/frontendUrl.ts 的 openFrontendBooking() /
 * bookingPath() / bookingAbsoluteUrl()，避免再度連到舊版 /booking/{uuid}。
 */
const ALLOWLIST = [
  "/src/lib/frontendUrl.ts", // 唯一實作
  "/src/lib/recentViews.ts", // 舊路徑正規化 regex
  "/src/components/LegacyBookingRedirect.tsx", // 舊路徑轉址本體
  "/src/components/AliasResolver.tsx", // alias → villa 轉址本體
  "/src/pages/Index.tsx", // 子網域根路徑轉址本體
  "/src/pages/BookingAccommodation.tsx", // 已停用的舊頁（僅保留轉址）
  "/src/lib/memberPreviewMock.ts", // 預覽模式假資料
  "/src/App.tsx", // 路由定義
];

// monorepo：掃描 packages/shared 與 apps/*（路徑以檔案相對位置表示，ALLOWLIST 以結尾比對）
const modules = Object.fromEntries(
  Object.entries({
    ...import.meta.glob("../../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("../../../../apps/*/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  }).map(([key, source]) => [new URL(key, import.meta.url).pathname, source]),
) as Record<string, string>;

describe("前台訂房頁連結守門", () => {
  it("不得手寫 /booking/${...} 動態路徑", () => {
    const offenders: string[] = [];

    for (const [file, source] of Object.entries(modules)) {
      if (ALLOWLIST.some((a) => file.endsWith(a)) || /\.test\.(ts|tsx)$/.test(file)) continue;
      source.split("\n").forEach((line, i) => {
        if (/["'`]\/booking\/\$\{/.test(line) || /`\/booking\/villa\/\$\{/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `請改用 openFrontendBooking() / bookingPath():\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
