# 對外 API 唯讀金鑰 ＋ 流量限制（設計稿，尚未施工）

目標：在把 `accommodation-api` 交給人客多（外部 AI 客服）之前，先做出「只能讀、不能寫」的金鑰，並加上呼叫頻率上限。

---

## 1. 唯讀金鑰怎麼標記與實作

### 資料面
`accommodation_api_keys` 目前欄位：id / accommodation_id / name / key_hash / key_prefix / is_active / last_used_at / created_by / created_at / updated_at，**沒有任何權限範圍欄位**。

建議新增一個布林旗標 `is_read_only boolean NOT NULL DEFAULT false`。

選布林而非 `scope text` 的理由：目前只有「讀 / 讀寫」兩種，布林不需要 CHECK 約束，預設 false 代表既有兩把金鑰行為零變化。

### 判斷邏輯放哪
`accommodation-api/index.ts` 的 `authenticate()`（第 45–62 行）目前只呼叫 RPC `verify_accommodation_api_key`，該 RPC 只回傳 accommodation_id 與 key id。

作法：**不改那支 RPC**（改回傳型別要 DROP + CREATE，風險高）。改在 `authenticate()` 內，於 RPC 驗證成功後，用同一個 service-role client 再做一次極輕量查詢：

```
select is_read_only from accommodation_api_keys where id = <RPC 回傳的 key id> limit 1
```

把 `isReadOnly` 一起回傳給主流程。

### 怎麼擋寫入路由
在 `Deno.serve` 主流程、`authenticate()` 之後、任何路由分支之前，加一道**預設拒絕**的關卡：

```
if (isReadOnly && req.method !== "GET") -> 403 { error: "This API key is read-only" }
```

放在方法層而不是逐條路由判斷，是為了「以後新增任何寫入端點，唯讀金鑰自動被擋」，不會因為漏改某一條路由而破口。`GET /version` 在認證之前就回應，不受影響。

---

## 2. 既有兩把金鑰會不會被影響

目前只有兩把，都在啟用中：

| 館別 | 名稱 | 前綴 | 最後使用 |
|---|---|---|---|
| 森山寫照 | 第三方訂房系統 | acc_68027551… | 從未使用 |
| 旅行日-DAIDODO | 第三方訂房系統 | acc_55113dcc… | 2026-04-21 |

新欄位 `DEFAULT false`，兩把都會是「非唯讀」＝維持現有讀寫權限，行為與現在一字不差，**既有用途不會中斷**。

新欄位只影響「之後勾選唯讀建立的新金鑰」。給人客多的是一把新發的唯讀金鑰，不是沿用這兩把。

（流量限制則會同時套到這兩把，見第 3 點的上限設定說明。）

---

## 3. 流量限制

`kol-api` 現有作法：函式檔內的記憶體 Map，每把金鑰每小時 100 次，回應帶 `X-RateLimit-Limit / Remaining / Reset`，超過回 429 + `Retry-After`（kol-api/index.ts 第 30–56、361–386 行）。

**能不能直接共用同一份實作？**技術上可以抽成 `supabase/functions/_shared/apiRateLimit.ts` 讓兩支共用，但那必須修改 `kol-api/index.ts` —— 你這次明確限定不得動 accommodation-api 以外的 Edge Function。

因此建議分兩階段：

- 本批：**新建** `supabase/functions/_shared/apiRateLimit.ts`，把 kol-api 那套邏輯原樣搬成共用模組（同樣的視窗、同樣的回應標頭格式），`accommodation-api` import 使用。kol-api 一行都不動。
- 之後另開一批（需你另外核准）：把 kol-api 改成 import 這支共用模組，刪掉它自己那份，達成真正單一實作。

這樣不會出現「兩份各自演進」的長期問題，但也不會在這批偷動別支函式。

**上限建議**：AI 客服報價會比人工頻繁，建議 `availability` 類查詢每把金鑰每小時 300 次（非 100），寫入方法維持較嚴格的 60 次。實際數字待你裁示；沿用 100 也可以。

超量回應：429、`{ error, retry_after }`、帶三個 `X-RateLimit-*` 標頭，與 kol-api 一致。

---

## 4. 施工範圍

### 會改動的檔案（3 個）
- `supabase/functions/accommodation-api/index.ts` —— `authenticate()` 多讀 `is_read_only`；主流程加唯讀寫入攔截；加流量限制呼叫與回應標頭；`GET /version` 的 endpoints 清單附註唯讀說明。
- `supabase/functions/_shared/apiRateLimit.ts` —— **新建**。
- `src/components/headquarters/AccommodationApiKeysManagement.tsx` —— 建立金鑰表單加一個「唯讀金鑰」勾選（第 92 行的 insert 多帶一個欄位）、列表顯示唯讀標籤。

（如需，另加 `supabase/functions/accommodation-api/readonly_test.ts` 純函式測試。）

### 資料庫異動：需要一支 migration（僅列出，未執行）

```sql
ALTER TABLE public.accommodation_api_keys
  ADD COLUMN is_read_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.accommodation_api_keys.is_read_only IS
  '為 true 時，該金鑰只允許 GET 查詢，任何寫入方法一律 403';
```

僅新增欄位，不改既有欄位、不改 RLS、不改任何函式或觸發程序、不刪除任何東西。既有兩列自動帶 false。

### 明確不會動到的檔案
- 其他所有 Edge Function，特別是 `kol-api/index.ts`（本批 0 行變更）
- `supabase/functions/accommodation-api/availability.ts` 與 `_shared/availability.ts`（算房算價邏輯）
- 前台訂房／計價／庫存：`BookingFlow.tsx`、`validate-order-prices/index.ts`、`packageDatePrice.ts`、`use-room-pricing.tsx`、`use-accommodation-packages.tsx`
- 任何 RLS 政策、觸發程序、cron、既有 RPC（含 `verify_accommodation_api_key`）

### 權限隔離自檢（比照通知信箱那次教訓）
本設計的館別隔離完全靠「金鑰 → accommodation_id」，呼叫端無法傳入任何館別識別碼，不存在「權限判斷沒綁 accommodation_id」的路徑。唯讀判斷同樣綁在該把金鑰那一列，不是靠呼叫端宣告。

---

## 待你裁示
1. 唯讀標記採 `is_read_only` 布林，是否同意（或你偏好可擴充的 `scope` 文字欄位）。
2. 流量上限數字：查詢 300 次/小時是否可接受，或沿用 100。
3. 流量限制分兩階段（本批不動 kol-api）是否同意。
4. 後台是否要加「唯讀」勾選 UI（不加的話新金鑰只能由我用 SQL 標記）。

核准後才施工，不會自動 Publish。
