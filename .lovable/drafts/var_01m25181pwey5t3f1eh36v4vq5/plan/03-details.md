## 技術細節

### 1. 改由建置外掛產生（解決連線設定拿不到）
- 新增 `scripts/vite-plugin-sitemap.ts`，作法完全比照現有的 `scripts/vite-plugin-seo-prerender.ts`：
  由 `vite.config.ts` 的 `loadEnv()` 把 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` 以參數傳入，
  不再依賴獨立行程的 `process.env`。
- `vite.config.ts` 的 plugins 陣列加入 `sitemap({ url, key })`（與 `seoPrerender` 相同的來源值）。
- 產出時機：`closeBundle`，寫入 `dist/sitemap.xml`（與 seoPrerender 一致，直接產生最終檔）。

### 2. 移除靜默覆蓋
- `package.json` 移除 `predev` 與 `prebuild` 兩條指令，`scripts/generate-sitemap.ts` 刪除（邏輯搬進外掛）。
  這樣 `public/sitemap.xml` 不再被任何流程蓋掉，仍作為「撈不到資料時」的保底內容。
- 外掛內守則：
  - 缺少連線設定、HTTP 非 200、或回傳館別數為 0 → **不寫檔**，改印 `[sitemap] 略過：<原因>`，
    建置繼續，`dist/sitemap.xml` 沿用 `public/sitemap.xml`（Vite 會自動複製 public）。
  - 成功時才覆寫 `dist/sitemap.xml`。

### 3. 格式調整（方案 A）
- 主預約頁：`daily` / `1.0`（不變）。
- 館別頁：`changefreq` 由 `daily` → `weekly`，`priority` 由 `0.9` → `0.8`。
- 保留 `image:image`（標題／說明／預覽圖），保留短網址 canonical 規則
  （有 alias 用 `/{alias}`，否則 `/booking/villa/{id}`），與 `src/lib/canonicalUrl.ts` 一致。

### 4. 驗證方式
- 本機執行一次建置，檢查 `dist/sitemap.xml`：
  - `<url>` 數量 = 1（主頁）+ 啟用館別數（目前 13）= 14。
  - 館別項皆為 `weekly` / `0.8`。
- 額外做一次「模擬撈不到」測試（暫時傳空金鑰），確認不寫檔、印出略過訊息、
  `dist/sitemap.xml` 仍是 public 的 13 筆版本。
- 兩項輸出都會貼給你看。

### 影響範圍
- 只動建置設定與 sitemap 產生邏輯，不影響網站頁面、資料庫、Edge Function。
- 需要 Publish 才會讓線上 sitemap 生效。

### 未來新增館別
設好短網址 alias 並啟用後，下次 Publish 就會自動出現在 sitemap，不需要進後台調整。
