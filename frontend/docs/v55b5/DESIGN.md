# V5.5B.5 — orders.member_id 身分綁定（設計稿，未施工）

## 0. 已查證事實

| 項目 | 事實 |
| --- | --- |
| 目前 policy | `Public can insert orders`，`polcmd=a`(INSERT)，roles=`{-}`(public，含 anon+authenticated)，`USING = NULL`（INSERT policy 本來就沒有 USING），`WITH CHECK` md5 = `2c9e9abb1e00e039588d1e35c940e138` |
| 影響範圍 | Edge Function 用 service_role，**繞過 RLS**；policy 只約束 `BookingFlow.tsx` 的未付款／ATM 直接 insert |
| 串接欄位 | `platform_members.user_id = auth.uid()`，`orders.member_id = platform_members.id` |
| 三支函式 | 皆 `member_id: body.memberId \|\| null`（create-paid-order:269、create-card-bound-order:188、complete-3ds-booking:307），皆未解析 Authorization |
| **3DS 導回路徑** | `frontendRedirectUrl = ${window.location.origin}/payment-result?source=booking-paid`（原生 App 為 `NATIVE_3DS_RETURN_URL` 深連結回同一 WebView）。銀行是把**使用者瀏覽器**導回我們自己的網址，回到 `PaymentResult.tsx` 後由**前端** `supabase.functions.invoke()` 呼叫函式 → 會自動帶上 localStorage 內的使用者 JWT。3DS 前後同一 origin（`window.location.origin`），session 不會遺失。 |
| 為何 verify_jwt=false | 不是因為銀行直接呼叫，而是**未登入訪客也能訂房**：無 session 時 supabase-js 只會帶 anon key，若 verify_jwt=true 會 401 擋掉所有訪客訂單。 |
| 結論（第 3 題） | **維持 verify_jwt=false**，改在程式內「有 JWT 就驗、沒有就當訪客」。不會擋掉正常 3DS 流程。 |
| 另一條必須放行的路徑 | `tappay-notify` webhook 在瀏覽器中斷時，用 **service_role key** 直接 `fetch` `create-paid-order` 補建訂單（tappay-notify:269）。這條沒有使用者 JWT，若一律強制 null 會讓補建訂單掉失會員歸屬。 |

> 因此驗證規則採三分支：**service_role 呼叫 → 沿用 body.memberId**；**合法使用者 JWT → 以 JWT 反查、只接受自己的 member_id**；**其餘（anon key／無 header／無效 token） → 強制 null**。

---

## 1. RLS policy 新版全文

INSERT policy 無 USING，只改 WITH CHECK（在既有條件尾端追加一段）。

```sql
ALTER POLICY "Public can insert orders" ON public.orders
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND guest_name IS NOT NULL
    AND (length(btrim(guest_name)) >= 1 AND length(btrim(guest_name)) <= 120)
    AND guest_phone IS NOT NULL
    AND (length(btrim(guest_phone)) >= 6 AND length(btrim(guest_phone)) <= 30)
    AND check_in_date IS NOT NULL
    AND check_out_date IS NOT NULL
    AND check_in_date < check_out_date
    AND guest_count IS NOT NULL
    AND guest_count >= 1 AND guest_count <= 30
    AND total_price IS NOT NULL AND total_price >= 0
    AND final_price IS NOT NULL AND final_price >= 0
    AND order_source = 'website'::text
    AND COALESCE(payment_status, 'unpaid'::text) = ANY (ARRAY['unpaid'::text, 'pending_payment'::text])
    AND COALESCE(paid_amount, 0) = 0
    -- V5.5B.5：member_id 必須屬於呼叫者本人
    AND (
      member_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.platform_members pm
        WHERE pm.id = orders.member_id
          AND pm.user_id = auth.uid()
      )
    )
  );
```

### migration 骨架（比照今日格式）

```sql
BEGIN;

-- PRECHECK：確認目前是未修改版本
DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_expr(polwithcheck, polrelid)) INTO v_md5
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='orders'
    AND pol.polname='Public can insert orders';
  IF v_md5 IS DISTINCT FROM '2c9e9abb1e00e039588d1e35c940e138' THEN
    RAISE EXCEPTION 'V5.5B.5 PRECHECK FAILED: md5=%', v_md5;
  END IF;
END $$;

-- 變更（上方 ALTER POLICY 全文）

-- POSTCHECK：新條件確實存在，且其他條件未被動到
DO $$
DECLARE v_expr text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_expr
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='orders'
    AND pol.polname='Public can insert orders';
  IF v_expr NOT LIKE '%platform_members%' OR v_expr NOT LIKE '%order_source = ''website''%' THEN
    RAISE EXCEPTION 'V5.5B.5 POSTCHECK FAILED: %', v_expr;
  END IF;
END $$;

COMMIT;
```

Rollback：同格式，precheck 驗新版 md5（執行後才算得出）、`ALTER POLICY` 還原為上表原文、postcheck 驗回 `2c9e9abb1e00e039588d1e35c940e138`。0 業務資料異動。

---

## 2. 三支 Edge Function 的驗證邏輯

新增共用檔 `supabase/functions/_shared/resolveMemberId.ts`：

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * 回傳可安全寫入 orders.member_id 的值。
 * - service_role 呼叫（tappay-notify 補單）→ 沿用 body 值
 * - 合法使用者 JWT → 只接受屬於該 auth.uid() 的 platform_members.id
 * - 其他（anon key / 無 header / 無效 token）→ null
 */
export async function resolveMemberId(
  req: Request,
  admin: ReturnType<typeof createClient>,
  requestedMemberId?: string | null,
): Promise<string | null> {
  if (!requestedMemberId) return null;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) return requestedMemberId;          // 伺服器補單路徑

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (token === anonKey) return null;                           // 未登入訪客

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: pm } = await admin
    .from("platform_members")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  // 塞別人的 id → 退回自己的 id（不是 null），避免誤傷登入者
  return pm?.id ?? null;
}
```

三處 diff 完全同形，只差行號：

```diff
+import { resolveMemberId } from "../_shared/resolveMemberId.ts";
...
+    const safeMemberId = await resolveMemberId(req, supabase, body.memberId ?? null);
+    if (safeMemberId !== (body.memberId ?? null)) {
+      console.warn("[<fn>] memberId overridden", { requested: body.memberId, applied: safeMemberId });
+    }
...
-        member_id: body.memberId || null,
+        member_id: safeMemberId,
```

- `create-paid-order/index.ts`：269 行
- `create-card-bound-order/index.ts`：188 行
- `complete-3ds-booking/index.ts`：307 行
- `supabase/config.toml`：**不動**，三支維持 `verify_jwt=false`。

---

## 3. 測試設計

### T1 RLS：訪客亂塞（BEGIN…ROLLBACK，真 RLS）
```sql
BEGIN;
SET LOCAL role anon;
-- 預期：new row violates row-level security policy
INSERT INTO public.orders (accommodation_id, room_type_id, member_id, order_number, guest_name,
  guest_phone, check_in_date, check_out_date, guest_count, total_price, final_price,
  order_status, payment_status, order_source)
VALUES ('<acc>', '<room>', '<任一 platform_members.id>', '', 'T1', '0900000000',
  '2099-01-01','2099-01-02',1,1000,1000,'pending','pending_payment','website');
ROLLBACK;
```
再跑一次 `member_id = NULL` 版本，預期成功（訪客訂單不受影響）。

### T2 RLS：會員 A 塞會員 B 的 id
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<A 的 auth uid>","role":"authenticated"}';
-- member_id = B 的 platform_members.id → 預期 violates RLS
ROLLBACK;
```

### T3 RLS：會員 A 帶自己的 id（不能誤傷）
同 T2 但 `member_id = A 的 platform_members.id` → 預期 INSERT 成功、`ROLLBACK` 後 orders 筆數不變。

### T4 Edge Function 單元測試（`resolveMemberId` 純邏輯，`supabase/functions/_shared/resolveMemberId_test.ts`）
| 情境 | Authorization | body.memberId | 預期 |
| --- | --- | --- | --- |
| 訪客 | anon key | B 的 id | `null` |
| 無 header | 無 | B 的 id | `null` |
| 會員 A 冒充 B | A 的 JWT | B 的 id | A 自己的 id |
| 會員 A 正常 | A 的 JWT | A 的 id | A 的 id |
| webhook 補單 | service key | A 的 id | A 的 id（原值） |
| 未帶 memberId | 任意 | null | `null` |

### T5 3DS 既有測試
repo 內**沒有** complete-3ds-booking / create-paid-order 的 3DS 整合測試（只有 `create-paid-order/index_test.ts` 測手機格式與 TapPay 錯誤碼對照，與本次改動無關），會照跑確認不受影響。另外以測試卡在預覽環境走一次完整 3DS：登入會員一次、未登入訪客一次，確認兩者都建單成功且 member_id 分別為本人 id 與 null。

---

## 4. 風險與不做的事
- 不改 `verify_jwt`，不改 config.toml，不動任何既有訂單資料。
- 既有 4456 筆訂單、39 筆 member_id 一律不回填、不清理（本案只擋新資料）。
- 唯一行為改變：登入者 email 與訂房 email 不一致時前端本來就送 null，維持不變。
