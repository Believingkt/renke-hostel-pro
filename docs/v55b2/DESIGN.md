# V5.5B.2 設計：order_attributions 綁定訂單 session（唯讀設計，未施工）

## 0. 前置事實查證

| 查證項目 | 結果 |
|---|---|
| `analytics_session_id` 產生時機 | `src/hooks/use-page-analytics.tsx:7-17`，任一頁面載入時就寫入 `sessionStorage`（`${Date.now()}-${random}`）。**早於**訂單 insert，前端在 `BookingFlow.tsx:3609` insert 當下已可讀到。 |
| 訂單 insert 位置 | `src/pages/BookingFlow.tsx:3609-3660`（匿名走 `Public can insert orders`）；3DS 卡單走 `create-paid-order`（service role） |
| attribution 寫入 | `src/lib/attribution.ts:103-142`，訂單成立後同一 async 函式內立即呼叫，已帶 `session_id` |
| 現行 policy | `order_attributions_insert_public`：`WITH CHECK (order_id IS NOT NULL)`（無角色限制＝含 anon） |
| 現有資料 | `order_attributions` 5 筆，`session_id` 5 筆皆非空；4451/4456 筆訂單無 attribution row |
| anon 能否 SELECT orders | **不能**。`orders` 只有兩條 SELECT policy（AM 團隊、館別／會員／業務），anon 一律讀不到 → policy 內若直接子查詢 `orders`，anon insert 會永遠失敗。**必須用 SECURITY DEFINER 函式。** |
| get-public-order 回傳 | `supabase/functions/get-public-order/index.ts:78-83` 已是**明確白名單** select，不含新欄位（不會外洩） |
| 其他 `orders.select("*")` | `supabase/functions/mcp/index.ts:95`（走使用者 JWT＋RLS）、`group-buy-*` 系列與 `_shared/groupBuy*`（service role，內部用，不回傳整包給公開端）、`src/lib/mcp/tools/get-order.ts:17`。詳見 §3 |

---

## 1. Migration A：新增欄位＋前端一併寫入

```sql
-- precheck
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='orders'
               AND column_name='attribution_session_id') THEN
    RAISE EXCEPTION 'PRECHECK FAIL: column already exists';
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN attribution_session_id text;

COMMENT ON COLUMN public.orders.attribution_session_id IS
  '前端 analytics_session_id，僅用於驗證 order_attributions 寫入來源，不得對外回傳';

-- postcheck
DO $$
DECLARE v_null int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='orders'
                   AND column_name='attribution_session_id') THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: column missing';
  END IF;
  SELECT count(*) INTO v_null FROM public.orders WHERE attribution_session_id IS NOT NULL;
  IF v_null <> 0 THEN RAISE EXCEPTION 'POSTCHECK FAIL: unexpected data %', v_null; END IF;
  RAISE NOTICE 'POSTCHECK PASS (0 business rows changed)';
END $$;
```

Rollback：`ALTER TABLE public.orders DROP COLUMN attribution_session_id;`（需破壞性確認）

`Public can insert orders` 的 WITH CHECK 不需改（未限制欄位清單），新欄位可直接由匿名 insert 帶入。

前端改動（`src/pages/BookingFlow.tsx`，orders insert 物件內新增一行）：

```ts
attribution_session_id: getAnalyticsSessionId(),   // 讀 sessionStorage，讀不到給 null
```

並在 `src/lib/attribution.ts` 匯出共用的 `getAnalyticsSessionId()`（同一支函式供 insert 與 attribution 使用，保證兩邊值一致）。3DS 卡單路徑（`create-paid-order`）需由前端把 `attribution_session_id` 一併放進 payload，後端白名單寫入；若未帶則為 NULL（見 §2 的 NULL 處理）。

---

## 2. Migration B：收緊 order_attributions insert policy

因 anon 讀不到 `orders`，比對邏輯放進 SECURITY DEFINER 函式：

```sql
CREATE OR REPLACE FUNCTION public.attribution_session_matches(_order_id uuid, _session_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id
      AND o.attribution_session_id IS NOT NULL
      AND o.attribution_session_id = _session_id
  );
$$;

REVOKE ALL ON FUNCTION public.attribution_session_matches(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attribution_session_matches(uuid, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS order_attributions_insert_public ON public.order_attributions;

CREATE POLICY order_attributions_insert_public
ON public.order_attributions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_id IS NOT NULL
  AND session_id IS NOT NULL
  AND public.attribution_session_matches(order_id, session_id)
);
```

注意：舊訂單 `attribution_session_id` 為 NULL，函式回傳 false → **舊訂單一律無法再新增 attribution**。這是有意為之（舊訂單本來就沒有合法客戶端能證明身分），影響見 §5(c)。

precheck / postcheck：

```sql
-- precheck
DO $$
DECLARE v_wc text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_wc
  FROM pg_policy WHERE polrelid='public.order_attributions'::regclass
    AND polname='order_attributions_insert_public';
  IF v_wc IS DISTINCT FROM '(order_id IS NOT NULL)' THEN
    RAISE EXCEPTION 'PRECHECK FAIL: unexpected policy %', v_wc;
  END IF;
  IF (SELECT count(*) FROM public.order_attributions) <> 5 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: row count changed';
  END IF;
END $$;

-- postcheck
DO $$
DECLARE v_wc text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_wc
  FROM pg_policy WHERE polrelid='public.order_attributions'::regclass
    AND polname='order_attributions_insert_public';
  IF v_wc NOT LIKE '%attribution_session_matches%' THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: policy not updated';
  END IF;
  IF (SELECT count(*) FROM public.order_attributions) <> 5 THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: data changed';
  END IF;
  RAISE NOTICE 'POSTCHECK PASS (0 business rows changed)';
END $$;
```

Rollback：重建原 policy `WITH CHECK (order_id IS NOT NULL)` 並 `DROP FUNCTION public.attribution_session_matches(uuid,text);`

---

## 3. 新欄位不得外洩：逐處白名單盤點

| 位置 | 目前寫法 | 處置 |
|---|---|---|
| `supabase/functions/get-public-order/index.ts:78-83` | 已是明確欄位白名單 | 不動；**確認不加入新欄位** |
| `supabase/functions/mcp/index.ts:95` | `select("*")` + 使用者 JWT | 改為明確欄位白名單（不含新欄位） |
| `src/lib/mcp/tools/get-order.ts:17` | `select("*")` | 同上改白名單 |
| `group-buy-order-lookup` / `group-buy-*` / `_shared/groupBuy*` | service role `select("*")`，只在後端組信件與內部邏輯 | 逐支確認回應 payload 不整包外送；`group-buy-order-lookup` 的公開回應改明確白名單 |
| Admin / Team 前端訂單查詢 | 皆為明確欄位清單（已查，無 `orders.select("*")`，唯一例外是上表 MCP 工具） | 不動 |
| `supabase/functions/get-public-order` 之外的公開端點 | 無其他整包展開 | — |

施工時的硬性規則：新欄位只出現在 (1) BookingFlow insert、(2) create-paid-order 寫入、(3) policy 函式內部。任何 select 清單一律不加。另建議加一條測試：對 get-public-order 真呼叫後斷言回應 key 不含 `attribution_session_id`。

---

## 4. attribution 寫入失敗要看得到

`src/lib/attribution.ts:141` 改為：失敗時（含 policy 拒絕）除 `console.warn` 外，寫一筆 `error_logs`（沿用既有前端錯誤上報路徑），欄位含 `order_id`、`session_id` 前 8 碼、Postgres error code / message、`landing_path`。不阻擋訂單流程、不對客人顯示 toast。若 error code 為唯一鍵衝突（23505）另標記為 `attribution_conflict`，這正是「有人搶先灌假資料」的偵測訊號，並依 V5.5A.8 的告警開關送內部通知。

---

## 5. 測試情境（真實交易，全程 BEGIN…ROLLBACK）

**(a) 正常流程**：交易內 insert 一筆 orders（帶 `attribution_session_id='TEST-SESS-A'`）→ 以 anon 身分 insert order_attributions（`session_id='TEST-SESS-A'`）→ 預期成功 1 列。

**(b) 攻擊模擬**：同一筆 order_id、`session_id='GUESSED'`（及 `session_id=NULL`）→ 預期 `42501 new row violates row-level security policy`。再測舊訂單（`attribution_session_id IS NULL`）任意 session → 預期同樣被拒。

**(c) 舊訂單影響面**：唯讀確認舊 4451 筆的依賴。目前 `order_attributions` 的讀取端只有 `src/hooks/use-marketing-analytics.tsx:66-77`（廣告成效報表，LEFT 關聯，沒有 row 就顯示無來源），SELECT/UPDATE policy 不變，管理者仍可讀寫。故新 policy 只影響「未來的匿名新增」，不影響任何既有查詢、報表、獎金計算（獎金讀 `order_meta`，與本表無關）。唯一行為改變：舊訂單之後無法再由前端補寫 attribution——實務上不會發生，因為補寫只在下單當下那一次。

三個情境全部在 `BEGIN … ROLLBACK` 內以真實 anon 角色執行，執行後回報實際錯誤碼與列數。

---

## 6. 執行順序

1. Migration A（欄位）
2. 前端／`create-paid-order` 寫入 session（先部署，確保新訂單都有值）
3. 觀察至少 1 天，確認新訂單 `attribution_session_id` 覆蓋率＝100%
4. Migration B（收緊 policy）
5. attribution.ts 錯誤上報（可與步驟 2 同批）
6. select 白名單清理（步驟 2 同批）

先上 policy 再上前端會導致所有新訂單 attribution 全被擋掉，順序不可顛倒。
