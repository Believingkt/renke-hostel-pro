---
name: 前台訂房頁連結唯一入口
description: 所有指向前台訂房頁的連結一律用 src/lib/frontendUrl.ts 的 openFrontendBooking()，禁止手寫路徑；canonical/sitemap 統一用 /booking/villa/{id}
type: constraint
---
# 前台訂房頁連結唯一入口

## 連結產生
- 唯一實作：`src/lib/frontendUrl.ts`
  - `openFrontendBooking(target, { navigate, newTab, replace })` — 全站唯一入口
  - `bookingPath(target)` — 站內相對路徑
  - `bookingAbsoluteUrl(target)` — 絕對網址（自訂網域優先，其次 booking.lakeze.com）
- 輸出路徑一律優先短網址 `/{alias}`（alias 由 `src/lib/bookingAliasRegistry.ts` 提供，
  啟動時 `primeBookingAliases()` 預載；查不到 alias 才退回 `/booking/villa/{uuid}`）。
- **禁止**在其他檔案手寫 `/booking/${id}` 或 `/booking/villa/${id}`。
- 守門測試：`src/lib/__tests__/no-legacy-booking-links.test.ts`，新增合法例外請加入該檔 ALLOWLIST。

## SEO 一致性
- canonical（`src/lib/canonicalUrl.ts`）= `https://{custom_domain || booking.lakeze.com}/{alias}`
  （無 alias 才退回 `/booking/villa/{id}`），不帶查詢參數。
- `/{alias}` 由 `AliasResolver` + `AliasVillaEntry` **直接渲染** BookingVilla，不再轉址；
  `/booking/villa/{uuid}` 永久保留為向下相容入口，且 canonical 指向同一組 alias 網址。
- `scripts/generate-sitemap.ts` 與 `scripts/vite-plugin-seo-prerender.ts` 必須與 canonical 規則同步。
- `scripts/generate-sitemap.ts` 列出的網址必須與 canonical 完全一致（不再列 alias / 網域根路徑，因為那兩者會再轉址）。
- alias（`/{alias}`）與網域根路徑僅作為對使用者友善的入口，繼續轉址，但不作為 canonical。
