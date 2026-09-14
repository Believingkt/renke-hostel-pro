# 多館範圍金鑰（設計稿，未施工）

## 一、查證結論：all-availability 確實只有一把不分館別的平台主金鑰

證據（`supabase/functions/all-availability/index.ts`）：

- 第 36 行：`const MASTER_KEY = Deno.env.get("PLATFORM_MASTER_API_KEY") ?? "";` —— 金鑰來自單一環境變數，全平台只有一把，不掛在任何館別上。
- 第 59–66 行：認證只是把來訪 header 與這串常數比對（`safeEqual(provided, MASTER_KEY)`），成功後不查任何資料表、不取得任何館別範圍。
- 第 88–98 行：`accommodation_ids` 只是把 `accommodation_info` 的查詢加上 `.in("id", ids)`。**沒帶這個參數就回傳全部館別**（第 89–91 行的 query 無任何館別條件）。

因此 `accommodation_ids` 百分之百是「查詢篩選」，不是權限邊界；任何人拿到那把主金鑰即可省略該參數取得全 15 家的房型、逐日價與空房。你的判斷正確，不應交給外部廠商。

對照組：`accommodation-api` 的 `authenticate()`（`index.ts` 第 52–86 行）把金鑰雜湊後交給 RPC `verify_accommodation_api_key`，**accommodation_id 由該列資料回傳**，呼叫端無從指定；`/availability` 路由第 323 行直接 `.eq("accommodation_id", accommodationId)`。這才是正確範式，新設計沿用它。

---

## 二、多館範圍金鑰設計

### 1. Schema

不動 `accommodation_api_keys` 既有語義，新增一張關聯表：

```sql
CREATE TABLE public.accommodation_api_key_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.accommodation_api_keys(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, accommodation_id)
);
```

共存規則：
- `accommodation_api_keys.accommodation_id` 保留為「主館別」（既有兩把金鑰行為完全不變）。
- 金鑰的**有效範圍 = 主館別 ∪ scopes 表內該金鑰的所有館別**。沒有 scope 列＝行為與今天一模一樣，單館。
- `is_read_only` 沿用，不新增旗標。**多館金鑰在後台建立時強制唯讀**（勾選框鎖定為勾選、不可取消），並在 Edge Function 端再做一次 fail-closed 檢查：只要該金鑰有任何 scope 列，一律當唯讀處理，即使 DB 欄位被人改成 false。理由與你的傾向一致，且雙重保險。

### 2. 承載端點：延伸 `accommodation-api`，不碰 `all-availability`

建議作法：`accommodation-api` 的 `/availability` 新增可選參數 `accommodation_id`（單一或逗號分隔）。

- 未帶 → 沿用金鑰主館別，既有兩把金鑰零變化。
- 有帶 → 每個值都必須落在金鑰有效範圍內。

為什麼不改 `all-availability`：那支目前是內部 BI 在用，改成金鑰範圍版等於要同時搬遷內部呼叫端與那把主金鑰的所有使用者，屬於已上線功能的破壞性變更，風險遠高於收益。本批建議 `all-availability` 0 行變更；若日後要收掉主金鑰，另案提案。

風險：`accommodation-api` 現有 `/availability` 一次只查一館，改多館要把 `.eq("accommodation_id", …)` 換成 `.in(...)`，並把回傳包成 `accommodations[]` 陣列。為避免破壞既有呼叫端，**只有在呼叫端明確傳了 `accommodation_id` 參數時才回傳陣列格式**；沒傳時維持今天的單館物件格式。

### 3. 權限判斷位置與超範圍處理

放在 `authenticate()`：RPC 驗證成功後，同一個 service-role client 多查一次 scopes 表，組出 `allowedAccommodationIds: Set<string>`（含主館別），連同 `isReadOnly` 一起回傳。

路由層只做一件事：

```
requested = 參數解析結果（未帶則 = [主館別]）
outOfScope = requested.filter(id => !allowed.has(id))
if (outOfScope.length) -> 403 { error, out_of_scope: [...] }
```

**整批拒絕，不自動過濾。** 靜默過濾會讓呼叫端誤以為某館「沒有房型／沒有空房」，AI 客服可能據此回覆客人「無法訂房」，是比報錯更糟的失敗模式；403 明確可除錯。

館別隔離完全靠金鑰那一列＋scopes 表，呼叫端傳的 ID 只能「縮小」範圍、永遠不能擴大，不存在通知信箱那種「權限判斷沒綁 accommodation_id」的路徑。

### 4. Migration（僅列出，不執行）

1. 建立上述 `accommodation_api_key_scopes` 表。
2. `GRANT SELECT, INSERT, DELETE ON public.accommodation_api_key_scopes TO authenticated; GRANT ALL TO service_role;`（不給 anon）
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
4. RLS 政策比照 `accommodation_api_keys`：只有對該 `api_key_id` 所屬館別具管理角色者可讀寫（用既有 `user_has_role` 判斷，**條件必須綁 accommodation_id**）。

不改任何既有欄位、不改既有 RLS、不刪任何東西。

### 5. 流量限制技術債（明確提醒）

新機制**會完全繼承**既有技術債：`_shared/apiRateLimit.ts` 是記憶體 Map 計數，雲端函式多執行個體不共用，已實測 62 次連打未觸發 429。多館金鑰只會讓單把金鑰的查詢量更大（一次掃多館），暴露面比單館金鑰更高。

因此：**多館金鑰上線後，在資料庫計數版流量限制完工並實測 429 生效之前，同樣不得核發正式金鑰給外部廠商。** 本設計不處理這筆債，已記於 `.lovable/memory/technical/accommodation-api-rate-limit-db-redesign.md`。

---

## 三、預計施工範圍（核准後才動）

會改：
- `supabase/functions/accommodation-api/index.ts`（authenticate 取 scopes、availability 多館參數與範圍檢查）
- `src/components/headquarters/AccommodationApiKeysManagement.tsx`（建立金鑰時可多選館別、列表顯示範圍、多館強制唯讀）
- 一支 migration（上述新表）

不會動：
- `all-availability/index.ts`、`kol-api/index.ts` 及其他所有 Edge Function
- `_shared/availability.ts`、`accommodation-api/availability.ts`
- `BookingFlow.tsx`、`validate-order-prices/index.ts`、`packageDatePrice.ts`、`use-room-pricing.tsx`、`use-accommodation-packages.tsx`
- 既有任何 RLS 政策、觸發程序、RPC（含 `verify_accommodation_api_key`）

## 待裁示
1. 範圍表作法（主館別 ∪ scopes）是否同意，或你偏好新型態金鑰完全不用 `accommodation_id` 主欄位。
2. 承載端點選擇：延伸 `accommodation-api`（建議）vs 改造 `all-availability`。
3. 超範圍一律 403 整批拒絕是否同意。
4. 多館金鑰強制唯讀、不可取消勾選，是否同意。
