# Sitemap 自動化修正（設計稿，未施工）

## 目標
1. 讓 sitemap 在正式建置時真的撈得到館別資料。
2. 撈不到時不要靜默覆蓋成 1 筆，而是保留既有內容並警告。
3. 館別頁格式改為 `weekly` / `0.8`，其餘（自動列出全部啟用館別、保留圖片標籤）維持不變。

## 現況問題
- `package.json` 的 `predev` / `prebuild` 用 `bunx tsx` 獨立執行產生腳本，該環境拿不到資料庫連線設定。
- 腳本內 `fetchAccommodations()` 失敗時 `return []`，接著仍照常寫檔，於是 `public/sitemap.xml` 被覆蓋成只剩主預約頁。
- 結果：線上 `booking.lakeze.com/sitemap.xml` 永遠只有 1 筆。
