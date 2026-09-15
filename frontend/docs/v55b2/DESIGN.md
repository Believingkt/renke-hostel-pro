# V5.5B.2 設計：order_attributions 綁定訂單 session（設計階段，未施工）

## 0. 前置事實查證

| 項目 | 結果 |
|---|---|
| `analytics_session_id` 產生時機 | `src/hooks/use-page-analytics.tsx:7-17`，任一頁面載入即寫入 `sessionStorage`。**早於**訂單 insert，`BookingFlow.tsx:3609` 當下必定拿得到。 |
| 訂單 insert | `src/pages/BookingFlow.tsx:3609`（匿名走 `Public can insert orders`）；3DS 卡單走 `create-paid-order`（service role） |
| attribution 寫入 | `src/lib/attribution.ts:103-142`，訂單成立後同一 async 函式內立即呼叫，已帶 `session_id` |
| 現行 policy | `order_attributions_insert_public`：`WITH CHECK (order_id IS NOT NULL)`，無角色限制（含 anon） |
| 現有資料 | `order_attributions` 5 筆，`session_id` 全非空；4455 筆訂單無 attribution row |
| anon 能否 SELECT orders | **不能**（模擬測試 b4 實測 `42501 permission denied for table orders`）→ policy 不可直接子查詢 orders，必須用 SECURITY DEFINER 函式 |
| `Public can insert orders` WITH CHECK | 不限制欄位清單，新增欄位可由匿名 insert 直接帶入，policy 無需修改 |

---

## 1. 測試可行性（回應「能不能包在交易內測」）

可以，且**已實測完成**。限制在於 exec 的 psql 以 `sandbox_exec` 角色連線，對 `public.orders` 沒有 owner 權限（實測 `must be owner of table orders`），所以 DDL 不能從 psql 發。改用 migration 通道，在**同一個交易**內依序做 ADD COLUMN → CREATE FUNCTION → GRANT → 換 policy → 跑情境 → 最後 `RAISE EXCEPTION` 讓整批交易中止，結果由例外訊息帶回。

### 實測輸出（原文）

```
=== V5.5B.2 SIMULATION (all rolled back) ===
[setup] new order tagged TEST-SESS-A; old order left NULL
(a) anon insert w/ correct session -> OK, rows=1
(b1) anon insert w/ guessed session -> BLOCKED 42501 new row violates row-level security policy for table "order_attributions"
(b2) anon insert w/ NULL session -> BLOCKED 42501 new row violates row-level security policy for table "order_attributions"
(b3) legacy order insert -> BLOCKED 42501 new row violates row-level security policy for table "order_attributions"
(b4) helper probe error 42501 permission denied for table orders
(c) order_attributions total rows now=6 (5 original + test rows)
(c) legacy orders with NULL attribution_session_id=4455
```

### 回滾驗證（測試後獨立查詢）

```
col_exists = 0
fn_exists  = 0
with_check = (order_id IS NOT NULL)
order_attributions rows = 5
```

欄位、函式、policy、資料全部回到原狀，零殘留。

---

## 2. Migration A：新增欄位

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='orders'
               AND column_name='attribution_session_id') THEN
    RAISE EXCEPTION 'PRECHECK FAIL: column already exists';
  END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN attribution_session_id text;

COMMENT ON COLUMN public.orders.attribution_session_id IS
  '前端 analytics_session_id，僅供驗證 order_attributions 寫入來源，不得對外回傳';

DO $$
DECLARE v int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='orders'
                   AND column_name='attribution_session_id') THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: column missing';
  END IF;
  SELECT count(*) INTO v FROM public.orders WHERE attribution_session_id IS NOT NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'POSTCHECK FAIL: unexpected data %', v; END IF;
  RAISE NOTICE 'POSTCHECK PASS (0 business rows changed)';
END $$;
```

Rollback：`ALTER TABLE public.orders DROP COLUMN attribution_session_id;`

---

## 3. 比對函式

```sql
CREATE OR REPLACE FUNCTION public.attribution_session_matches(_order_id uuid, _session_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id
      AND o.attribution_session_id IS NOT NULL
      AND o.attribution_session_id = _session_id
  );
$fn$;

REVOKE ALL ON FUNCTION public.attribution_session_matches(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attribution_session_matches(uuid, text) TO anon, authenticated, service_role;
```

為何要 SECURITY DEFINER：anon 對 `orders` 沒有 SELECT 權限也沒有 RLS 通道（實測 42501），policy 內若直接查 orders，所有合法客戶端也會被擋。函式以擁有者身分執行才能完成比對。

外洩面評估：
- 回傳型別 `boolean`，函式體只有一個 `EXISTS`，不回傳任何 orders 欄位內容。
- 兩個參數都必須由呼叫者提供，等於「拿已知的 order_id + 已知的 session 字串問是不是這組」，不能列舉、不能反查。
- 唯一可推導的資訊是「某訂單有沒有被設過某個 session 值」。session 值是 `${Date.now()}-${11碼亂數}`，猜中機率可忽略；且此資訊本身無商業價值。
- `REVOKE ALL FROM PUBLIC` + 具名 GRANT，避免預設 PUBLIC EXECUTE。
- `SET search_path = public` 防搜尋路徑劫持。

---

## 4. 新版 policy 全文 + precheck/postcheck

```sql
-- precheck
DO $$
DECLARE v_wc text; v_rows int;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_wc
  FROM pg_policy WHERE polrelid='public.order_attributions'::regclass
    AND polname='order_attributions_insert_public';
  IF v_wc IS DISTINCT FROM '(order_id IS NOT NULL)' THEN
    RAISE EXCEPTION 'PRECHECK FAIL: unexpected policy: %', v_wc;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='attribution_session_matches') THEN
    RAISE EXCEPTION 'PRECHECK FAIL: helper function missing (run stage 1 first)';
  END IF;
  SELECT count(*) INTO v_rows FROM public.order_attributions;
  RAISE NOTICE 'PRECHECK PASS: attribution rows=%', v_rows;
END $$;

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
  RAISE NOTICE 'POSTCHECK PASS: % (0 business rows changed)', v_wc;
END $$;
```

Rollback：
```sql
DROP POLICY IF EXISTS order_attributions_insert_public ON public.order_attributions;
CREATE POLICY order_attributions_insert_public ON public.order_attributions
FOR INSERT WITH CHECK (order_id IS NOT NULL);
```

---

## 5. 新欄位不得外洩

| 位置 | 現況 | 處置 |
|---|---|---|
| `supabase/functions/get-public-order/index.ts:80` | 已是逐欄白名單 | 不動，不加新欄位；加一項回應斷言測試 |
| `supabase/functions/mcp/index.ts:95` | `orders.select("*")` | 改逐欄白名單 |
| `src/lib/mcp/tools/get-order.ts:17` | `orders.select("*")` | 改逐欄白名單（此檔為前者原始碼） |
| group-buy 系列 / `_shared/groupBuy*` | service role `select("*")`，後端內部組信與邏輯 | 確認回應 payload 不整包外送；`group-buy-order-lookup` 公開回應改白名單 |
| Admin / Team 前端 | 全為明確欄位清單，無 `orders.select("*")` | 不動 |

硬性規則：新欄位只出現在 (1) BookingFlow orders insert、(2) create-paid-order 寫入、(3) 比對函式內部。

---

## 6. attribution.ts 錯誤處理

見 §8 diff。要點：insert 失敗改為寫 `error_logs`（`reportFrontendError`），`23505` 唯一鍵衝突另以 `attribution_conflict` 分類並送內部告警（沿用 V5.5A.8 開關），一律不影響訂單流程、不對客人顯示。

---

## 7. 分階段

**第一階段（只寫 session，policy 不動）**
- Migration A（新增欄位）
- `src/lib/attribution.ts`：匯出 `getAnalyticsSessionId()`、錯誤上報
- `src/pages/BookingFlow.tsx`：orders insert 帶 `attribution_session_id`；3DS 路徑傳入 payload
- `supabase/functions/create-paid-order/index.ts`：白名單接收並寫入
- `supabase/functions/mcp/index.ts`、`src/lib/mcp/tools/get-order.ts`：改白名單 select

**第二階段（觀察 1 天、新訂單覆蓋率 100% 後）**
- 比對函式 + policy 收緊（§3、§4）

順序不可顛倒。

---

## 8. attribution.ts diff（設計）

```diff
+const ATTR_SESSION_KEY = "analytics_session_id";
+
+export const getAnalyticsSessionId = (): string | null => {
+  try {
+    return sessionStorage.getItem(ATTR_SESSION_KEY);
+  } catch {
+    return null;
+  }
+};
+
 export const recordOrderAttribution = async (
   orderId: string,
   accommodationId: string | null,
 ) => {
+  const sessionId = getAnalyticsSessionId();
   try {
     const first = readTouch(FIRST_KEY);
     const last = readTouch(LAST_KEY) || first;
     if (!first && !last) return;
-
-    let sessionId: string | null = null;
-    try {
-      sessionId = sessionStorage.getItem("analytics_session_id");
-    } catch {
-      sessionId = null;
-    }
-
-    await supabase.from("order_attributions").insert({
+    const { error } = await supabase.from("order_attributions").insert({
       order_id: orderId,
       session_id: sessionId,
       ...
     });
+    if (error) {
+      const conflict = error.code === "23505";
+      await reportFrontendError({
+        category: conflict ? "attribution_conflict" : "attribution_insert_failed",
+        step: "record_order_attribution",
+        accommodationId,
+        errorCode: error.code,
+        errorMessage: error.message,
+        context: {
+          order_id: orderId,
+          session_prefix: sessionId ? sessionId.slice(0, 8) : null,
+          landing_path: first?.landing_path ?? null,
+          suspected_preemptive_write: conflict,
+        },
+      });
+      console.warn("attribution record failed", error);
+    }
   } catch (e) {
-    console.warn("attribution record failed", e);
+    console.warn("attribution record failed", e);
+    void reportFrontendError({
+      category: "attribution_insert_failed",
+      step: "record_order_attribution",
+      accommodationId,
+      errorMessage: e instanceof Error ? e.message : String(e),
+      context: { order_id: orderId },
+    });
   }
 };
```

`23505` 的意義：該訂單已經有 attribution row，但真實客人此刻才第一次寫入 → 幾乎必然是有人先猜到 UUID 搶插。這類事件寫入 `error_logs` 後由既有告警管道通知內部（不通知客人）。
