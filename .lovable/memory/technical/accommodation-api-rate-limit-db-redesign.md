---
name: Accommodation API 流量限制資料庫計數重設計
description: 記憶體計數在雲端函式多執行個體環境無法真正限流；kol-api 既有 100 次/小時限制同樣從未真正生效，需改用資料庫計數。
type: feature
---

# Accommodation API 流量限制資料庫計數重設計

## 現況

- `accommodation-api` 與 `kol-api` 目前都使用**記憶體內 Map** 做流量限制：
  - `supabase/functions/_shared/apiRateLimit.ts`（新建，accommodation-api 使用）
  - `supabase/functions/kol-api/index.ts` 內建自己的 Map（100 次/小時）
- 2026-09-14 實測發現：連續對 accommodation-api 發出 62 次寫入請求，每次回傳的剩餘額度都停在 59，完全未觸發 429。
- 原因：Supabase Edge Function 每次請求可能落在不同執行個體，記憶體計數不共用。
- 結論：**kol-api 現有的 100 次/小時限制同樣從未真正生效過**，因為使用的是同一套記憶體計數機制。

## 已上線的過渡狀態

- accommodation-api 已經可以正確區分唯讀金鑰，並在方法層攔截寫入（`isReadOnly && req.method !== "GET"` → 403）。
- 流量限制程式碼雖已部署，但目前**無法有效阻擋高頻呼叫**。
- 在資料庫計數實作完成並驗證 429 會真正觸發之前，**不得核發任何正式唯讀金鑰給外部系統**（例如人客多）。

## 建議方向

1. 新增一張小型計數表（例如 `api_key_rate_limit_buckets`）：
   - `key_hash`（或類似識別碼）
   - `window_start` / `window_end` 或 `reset_at`
   - `count`
   - 可視需要區分 `read` / `write` bucket
2. 使用 `INSERT ... ON CONFLICT DO UPDATE` 原子遞增計數，避免競態。
3. 超量時回傳 429 + `Retry-After` + `X-RateLimit-*` 標頭，格式與現有程式碼一致。
4. 同時將 `kol-api` 的記憶體限制也遷移到同一張表，真正統一實作。

## 參考檔案

- `supabase/functions/_shared/apiRateLimit.ts`（本輪新建，日後可改為資料庫實作的包裝）
- `supabase/functions/kol-api/index.ts:30-56`、`361-386`（既有記憶體實作）
- `supabase/functions/accommodation-api/index.ts`（方法層 403 攔截與流量限制呼叫點）
