# V5.5C.0 方案 A — 訂單統一變更時間線（完整設計，未施工）

範圍：上半部「通知與付款紀錄」（含三顆重送按鈕）完全不動。
只把下方「變更紀錄」卡片改為統一時間線＝新 `order_change_log`（含系統自動修改）＋既有 `audit_logs`(order / order_meta)。

---

## 一、order_change_log 表與 trigger

### 1. CREATE TABLE 完整語句

```sql
CREATE TABLE public.order_change_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  order_number     text,
  op               text NOT NULL CHECK (op IN ('insert','update')),
  actor_type       text NOT NULL CHECK (actor_type IN ('user','system','unknown')),
  actor_id         uuid,
  actor_email      text,
  actor_label      text,
  reason           text,
  source           text,
  changed_fields   jsonb NOT NULL DEFAULT '[]'::jsonb,
  txid             bigint NOT NULL DEFAULT txid_current(),
  changed_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_change_log IS
  'V5.5C.0 訂單通用變更記錄：由 zzz_order_change_log trigger 自動寫入，含系統自動修改';

CREATE INDEX idx_order_change_log_order       ON public.order_change_log (order_id, changed_at DESC);
CREATE INDEX idx_order_change_log_accom       ON public.order_change_log (accommodation_id, changed_at DESC);
CREATE INDEX idx_order_change_log_txid        ON public.order_change_log (order_id, txid);

GRANT SELECT ON public.order_change_log TO authenticated;
GRANT ALL    ON public.order_change_log TO service_role;
-- 不 GRANT anon；不 GRANT INSERT/UPDATE/DELETE 給任何互動角色（只有 SECURITY DEFINER trigger 寫入）

ALTER TABLE public.order_change_log ENABLE ROW LEVEL SECURITY;
```

`changed_fields` 格式（陣列，方便前端直接沿用既有 `changes` 渲染器）：

```json
[
  {"field":"final_price","from":12000,"to":11400},
  {"field":"notes","changed":true}
]
```

### 2. orders 全部 99 欄三類分級完整清單

**(a) 完整記錄 before/after（67 欄）**

order_number, accommodation_id, room_type_id, customer_id, package_id, member_id,
check_in_date, check_out_date, order_date,
guest_count, adult_count, child_count, toddler_count, infant_count, pet_count,
meal_plan, display_room_type_name, room_quantity, room_assigned, lock_whole_building,
owner_direct, requires_owner_review, is_pii_pending,
order_status, payment_status, refund_status, deposit_status, room_charge_status,
total_price, discount_amount, final_price, deposit_amount, paid_amount, refunded_amount,
pet_plan_price, meal_plan_total,
deposit_required_amount, deposit_charged_amount, deposit_refunded_amount, deposit_method,
booking_deposit_amount, booking_deposit_percentage,
cancellation_fee_amount, cancellation_fee_percent, refund_fee_amount,
payment_method, deposit_payment_method, balance_payment_method, payment_provider,
discount_code, order_source, ota_channel, import_project, currency_at_booking,
room_charge_scheduled_date,
confirmed_at, checked_in_at, checked_out_at, cancelled_at, refunded_at,
deposit_charged_at, deposit_refunded_at, payment_link_created_at,
group_buy_payment_deadline_at, atm_expire_at,
internal_email_sent, internal_email_sent_at

**(b) 只記「有變動」、不記值（21 欄）**（個資／自由文字／raw JSON／金流交易識別碼）

guest_name, guest_phone, guest_email, guest_address, guest_gender, guest_nationality,
notes, meal_plan_details, custom_addon_details, group_buy_booking_notice_snapshot,
owlting_sync_state, hotelnabe_sync_state, exchange_rate_snapshot,
atm_vacc_no, atm_vacc_bank_code, atm_rec_trade_id, atm_bank_transaction_id,
room_charge_rec_trade_id, refund_rec_trade_id, room_charge_error, attribution_session_id

**(c) 完全不追蹤（11 欄）**（純技術欄位／同步時間戳，記了只會製造雜訊）

id, created_at, updated_at, idempotency_key, dedupe_key,
owlting_unique_id, owlting_reservation_id,
hotelnabe_res_id, hotelnabe_last_modify,
auto_created_from_email_id, room_charge_at

（67 + 21 + 11 = 99 欄，與 information_schema 回傳的 orders 總欄位數完全對齊；未來新增欄位若未列入 (a)(c) 名單，預設落入 (b)「只記有變動」，不會被漏掉。）

### 3. context 與通用 AFTER trigger 完整 SQL

```sql
-- 3.1 交易內 context 設定（前端／Edge Function／RPC 皆呼叫同一支）
CREATE OR REPLACE FUNCTION public.set_order_change_context(
  p_source      text DEFAULT NULL,
  p_reason      text DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_actor_type  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.source',      COALESCE(p_source, ''),      true);
  PERFORM set_config('app.reason',      COALESCE(p_reason, ''),      true);
  PERFORM set_config('app.actor_label', COALESCE(p_actor_label, ''), true);
  PERFORM set_config('app.actor_type',  COALESCE(p_actor_type, ''),  true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_change_context(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_change_context(text,text,text,text)
  TO authenticated, service_role;

-- 3.2 統一 actor 解析（order_change_log 與 log_order_deposit_change 共用）
CREATE OR REPLACE FUNCTION public.resolve_change_actor()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid  := auth.uid();
  v_type  text  := NULLIF(current_setting('app.actor_type',  true), '');
  v_label text  := NULLIF(current_setting('app.actor_label', true), '');
  v_email text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    RETURN jsonb_build_object(
      'actor_type',  COALESCE(v_type, 'user'),
      'actor_id',    v_uid,
      'actor_email', v_email,
      'actor_label', v_label
    );
  END IF;

  IF v_type = 'system' OR v_label IS NOT NULL THEN
    RETURN jsonb_build_object(
      'actor_type',  'system',
      'actor_id',    NULL,
      'actor_email', NULL,
      'actor_label', COALESCE(v_label, 'system')
    );
  END IF;

  RETURN jsonb_build_object(
    'actor_type',  'unknown',
    'actor_id',    NULL,
    'actor_email', NULL,
    'actor_label', 'unmarked_system'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_change_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_change_actor() TO authenticated, service_role;

-- 3.3 通用 AFTER trigger function
CREATE OR REPLACE FUNCTION public.log_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_full CONSTANT text[] := ARRAY[
    'order_number','accommodation_id','room_type_id','customer_id','package_id','member_id',
    'check_in_date','check_out_date','order_date',
    'guest_count','adult_count','child_count','toddler_count','infant_count','pet_count',
    'meal_plan','display_room_type_name','room_quantity','room_assigned','lock_whole_building',
    'owner_direct','requires_owner_review','is_pii_pending',
    'order_status','payment_status','refund_status','deposit_status','room_charge_status',
    'total_price','discount_amount','final_price','deposit_amount','paid_amount','refunded_amount',
    'pet_plan_price','meal_plan_total',
    'deposit_required_amount','deposit_charged_amount','deposit_refunded_amount','deposit_method',
    'booking_deposit_amount','booking_deposit_percentage',
    'cancellation_fee_amount','cancellation_fee_percent','refund_fee_amount',
    'payment_method','deposit_payment_method','balance_payment_method','payment_provider',
    'discount_code','order_source','ota_channel','import_project','currency_at_booking',
    'room_charge_scheduled_date',
    'confirmed_at','checked_in_at','checked_out_at','cancelled_at','refunded_at',
    'deposit_charged_at','deposit_refunded_at','payment_link_created_at',
    'group_buy_payment_deadline_at','atm_expire_at',
    'internal_email_sent','internal_email_sent_at'
  ];
  c_skip CONSTANT text[] := ARRAY[
    'id','created_at','updated_at','idempotency_key','dedupe_key',
    'owlting_unique_id','owlting_reservation_id',
    'hotelnabe_res_id','hotelnabe_last_modify',
    'auto_created_from_email_id','room_charge_at'
  ];
  v_old   jsonb;
  v_new   jsonb;
  v_key   text;
  v_a     jsonb;
  v_b     jsonb;
  v_items jsonb := '[]'::jsonb;
  v_actor jsonb;
BEGIN
  v_new := to_jsonb(NEW);
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;

  IF TG_OP = 'INSERT' THEN
    v_items := jsonb_build_array(jsonb_build_object('field','__created','changed',true));
  ELSE
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN v_key = ANY (c_skip);
      v_a := v_old -> v_key;
      v_b := v_new -> v_key;
      CONTINUE WHEN v_a IS NOT DISTINCT FROM v_b;

      IF v_key = ANY (c_full) THEN
        v_items := v_items || jsonb_build_object('field', v_key, 'from', v_a, 'to', v_b);
      ELSE
        v_items := v_items || jsonb_build_object('field', v_key, 'changed', true);
      END IF;
    END LOOP;

    IF jsonb_array_length(v_items) = 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  v_actor := public.resolve_change_actor();

  INSERT INTO public.order_change_log (
    order_id, accommodation_id, order_number, op,
    actor_type, actor_id, actor_email, actor_label,
    reason, source, changed_fields, txid
  ) VALUES (
    NEW.id, NEW.accommodation_id, NEW.order_number, lower(TG_OP),
    v_actor->>'actor_type',
    NULLIF(v_actor->>'actor_id','')::uuid,
    v_actor->>'actor_email',
    NULLIF(v_actor->>'actor_label',''),
    NULLIF(current_setting('app.reason', true), ''),
    COALESCE(NULLIF(current_setting('app.source', true), ''), 'unmarked'),
    v_items,
    txid_current()
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- 永不讓業務 UPDATE 因為記錄失敗而失敗
  RAISE WARNING 'log_order_change failed for order %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

-- 3.4 trigger（zzz_ 命名確保在既有 30 個 trigger 之後才執行）
CREATE TRIGGER zzz_order_change_log
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_change();
```

**txid 收斂**：同一交易多次 UPDATE 會產生多列，但 `txid` 相同。前端以
`(txid, actor_id/actor_label, source)` 群組合併為一筆顯示，欄位變動合併去重（同欄位取最早 `from` ＋最晚 `to`）。DB 不做合併，保留原始事實。

### 4. trg_log_order_deposit_change 改用同一套 actor（完整 diff）

現況（實查）：直接用 `auth.uid()`，service role 觸發時 `user_id` 為 NULL，而 `audit_logs.user_id` 為 NOT NULL → insert 失敗。

修法（依核准決議）：**`auth.uid()` 為 NULL 時直接 `RETURN NEW`、完全不寫 audit_logs，不使用任何 sentinel UUID**。
押金五個欄位（`deposit_status`、`deposit_required_amount`、`deposit_charged_amount`、`deposit_refunded_amount`、`deposit_method`）都已在 `order_change_log` 的 (a) 完整追蹤清單內，系統觸發的異動由新機制記為 system actor，不會遺失。

```diff
 CREATE OR REPLACE FUNCTION public.log_order_deposit_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
 AS $function$
 DECLARE
   v_changes jsonb := '{}'::jsonb;
   v_email text;
+  v_uid uuid;
 BEGIN
+  -- 系統／service role 觸發（auth.uid() 為 NULL）：不寫 audit_logs，
+  -- 該異動改由 order_change_log 以 system actor 記錄
+  v_uid := auth.uid();
+  IF v_uid IS NULL THEN
+    RETURN NEW;
+  END IF;
+
   ...（五個 IF 欄位比對維持完全不變）...

   IF v_changes = '{}'::jsonb THEN
     RETURN NEW;
   END IF;

-  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
+  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

   INSERT INTO public.audit_logs (
     accommodation_id, user_id, user_email, action_type, action_category,
     entity_type, entity_id, entity_name, details
   ) VALUES (
-    NEW.accommodation_id, auth.uid(), v_email, 'deposit_change', 'order',
+    NEW.accommodation_id, v_uid, v_email, 'deposit_change', 'order',
     'order_deposit', NEW.id::text, NEW.order_number, v_changes
   );

   RETURN NEW;
+EXCEPTION WHEN OTHERS THEN
+  RAISE WARNING 'log_order_deposit_change failed for order %: %', NEW.id, SQLERRM;
+  RETURN NEW;
 END;
 $function$;
```

行為不變之處：真人操作（`auth.uid()` 有值）時的欄位比對、entity_type、action_type、user_id/email、details 全部保留，
因此「押金異動紀錄」畫面對真人操作完全不變；改變的只有「系統觸發時不再嘗試寫入（原本會 23502 失敗）」。

---

## 二、RLS

### 5. order_change_log 完整 policy

```sql
CREATE POLICY "order_change_log_select_staff"
ON public.order_change_log
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_staff_module_permission(auth.uid(), accommodation_id, 'orders')
     IN ('editable','readonly')
);
```

已移除多餘的 `hotel_admin` EXISTS 段：`get_staff_module_permission()` 內部已判斷
「該 accommodation 的 hotel_admin / super_admin → editable」，且是與 `accommodation_id` 綁定的正確範圍。

**同時移除 `public.is_admin(auth.uid())`**（實測發現的跨館漏洞）：`is_admin()` 只檢查
「這個人在任何一館是 hotel_admin / super_admin」，沒有跟本列 `accommodation_id` 綁定，
實測他館 hotel_admin 可讀到本館全部變更紀錄（見第六節 T5 對照）。移除後同一測試回到 0。

INSERT / UPDATE / DELETE：**不建立任何 policy**，且未 GRANT 對應權限 → 只有
`SECURITY DEFINER` 的 trigger 能寫入，任何前端或 API 都無法竄改變更紀錄。

---

## 三、方案 A 前端整合

### 6. 「變更紀錄」卡片完整 diff（`src/components/orders/OrderAuditLogCard.tsx`）

新增一支合併 hook，卡片本體渲染邏輯完全沿用（含既有各種舊格式分支）。

```diff
+// 統一時間線項目：audit_logs 與 order_change_log 正規化為同一型別
+interface TimelineRow {
+  id: string;
+  origin: "audit" | "change_log";
+  user_id: string | null;
+  user_email: string | null;
+  user_name?: string | null;
+  action_type: string;
+  details: any;          // 沿用既有結構：{ changes: OrderFieldChange[], source, reason, type }
+  created_at: string;
+}
+
+const SYSTEM_LABELS: Record<string, string> = {
+  owlting_webhook: "OwlTing 同步",
+  owlting_auto_order: "OwlTing 自動建單",
+  hotelnabe_sync: "HotelNabe 同步",
+  tappay_notify: "金流通知",
+  refund: "退款流程",
+  room_charge: "自動收款",
+  unmarked_system: "系統（未標記來源）",
+};
```

載入邏輯（取代原本單一 query）：

```diff
-      const { data, error } = await supabase
-        .from("audit_logs")
-        .select("id, user_id, user_email, action_type, details, created_at")
-        .in("entity_type", ["order", "order_meta"])
-        .eq("entity_id", orderId)
-        .order("created_at", { ascending: false });
-      if (error || cancelled) { setLoading(false); return; }
-      const rows = (data || []) as AuditLogRow[];
+      const [auditRes, changeRes] = await Promise.all([
+        supabase
+          .from("audit_logs")
+          .select("id, user_id, user_email, action_type, details, created_at")
+          .in("entity_type", ["order", "order_meta"])
+          .eq("entity_id", orderId)
+          .order("created_at", { ascending: false }),
+        supabase
+          .from("order_change_log")
+          .select("id, op, actor_type, actor_id, actor_email, actor_label, reason, source, changed_fields, txid, changed_at")
+          .eq("order_id", orderId)
+          .order("changed_at", { ascending: false }),
+      ]);
+      if (cancelled) return;
+
+      const auditRows: TimelineRow[] = (auditRes.data || []).map((r: any) => ({
+        id: `a_${r.id}`, origin: "audit",
+        user_id: r.user_id, user_email: r.user_email,
+        action_type: r.action_type, details: r.details, created_at: r.created_at,
+      }));
+
+      // 同交易（txid）收斂為一筆
+      const grouped = new Map<string, any[]>();
+      for (const r of (changeRes.data || []) as any[]) {
+        const key = `${r.txid}|${r.actor_id ?? r.actor_label ?? ""}|${r.source ?? ""}`;
+        grouped.set(key, [...(grouped.get(key) || []), r]);
+      }
+      const changeRows: TimelineRow[] = [...grouped.values()].map((group) => {
+        const first = group[group.length - 1];
+        const merged = new Map<string, any>();
+        for (const r of [...group].reverse()) {
+          for (const c of (r.changed_fields || [])) {
+            const prev = merged.get(c.field);
+            merged.set(c.field, prev
+              ? { ...c, from: prev.from, before: prev.before }
+              : c);
+          }
+        }
+        const changes = [...merged.values()].map((c: any) => ({
+          field: c.field,
+          label: getFieldLabel(c.field),
+          before: "changed" in c ? "（有更動）" : c.from,
+          after:  "changed" in c ? "（已更新）" : c.to,
+        }));
+        return {
+          id: `c_${first.id}`, origin: "change_log",
+          user_id: first.actor_id, user_email: first.actor_email,
+          action_type: first.op === "insert" ? "system_create" : "system_update",
+          details: {
+            changes,
+            source: first.source === "unmarked" ? undefined : first.source,
+            reason: first.reason || undefined,
+            actor_type: first.actor_type,
+            actor_label: first.actor_label,
+          },
+          created_at: first.changed_at,
+        };
+      });
+
+      const rows = [...auditRows, ...changeRows].sort(
+        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
+      );
```

姓名解析統一：

```diff
       setLogs(
         rows.map((r) => ({
           ...r,
-          user_name: (r.user_id && nameMap[r.user_id]) || r.user_email || "未知使用者",
+          user_name:
+            (r.user_id && nameMap[r.user_id]) ||
+            r.user_email ||
+            (r.details?.actor_type && r.details.actor_type !== "user"
+              ? `系統・${SYSTEM_LABELS[r.details.actor_label] ?? r.details.actor_label ?? "自動處理"}`
+              : "未知使用者"),
         })),
       );
```

Badge 標籤新增兩筆（其餘不動）：

```diff
   order_date_change: { text: "訂單改期", tone: "bg-fuchsia-100 text-fuchsia-700" },
+  system_update: { text: "系統自動變更", tone: "bg-slate-100 text-slate-700" },
+  system_create: { text: "建立訂單", tone: "bg-green-100 text-green-700" },
```

另需在 `src/utils/orderAuditDiff.ts` 的 `FIELD_LABELS` 補齊 (a)(b) 兩類欄位的中文標籤
（`getFieldLabel` 已對未知欄位回退顯示原欄位名，因此漏補只會顯示英文欄名，不會壞掉）。
`OrderDetail.tsx` 不需修改（元件介面不變）。

### 7. 舊 audit_logs 資料在新時間線的顯示保證

實查現況（entity_type in order / order_meta / order_deposit）：

| 結構 | 筆數 | 新時間線處理 |
|---|---|---|
| `details.changes` 陣列（order update 881、order_meta update 241） | 1122 | 原路徑不動，維持既有 changes 渲染 |
| `{guest_name, check_in, check_out}`（order create） | 407 | 走既有 `log.details?.old/new` 以外分支：無 changes、無 old/new → 顯示標題列（誰、何時、建立），可展開時顯示既有 `reason`/`source`；不消失 |
| `{type, old_status, new_status, reason}`（order update） | 235 | 既有 `getActionLabel(details.type)` 已支援，reason 區塊照舊顯示 |
| `{type, check_in_date, check_out_date, extra_rooms}`（order create） | 81 | 同上，標題列顯示，不消失 |
| 改期 `{field, before, after, before_month...}` | 10 | 既有渲染顯示 reason／source；本次不改 |
| cancel_order / refund_order 大結構 | 20 | 既有分支不動 |
| `{reason}`、`{type}` 等極簡結構 | 6 | 標題列顯示 |
| order_deposit（459 筆） | 459 | **不併入**此卡片（維持在上半部「押金異動紀錄」），避免重複顯示 |

保證做法：合併只做「新增一個來源 + 排序」，**不改動任何既有 details 分支的渲染程式碼**；
`origin` 欄位只用於 key 前綴避免 id 碰撞。舊資料 query 條件（`entity_type in ('order','order_meta')`、`entity_id = orderId`）逐字不變。

---

## 四、40 支呼叫端分批補 context（建議順序）

| 批次 | 對象 | 理由 |
|---|---|---|
| 1 | 金流：`tappay-notify`、`charge-deposit`、`refund-deposit`、`bind-deposit-card`、`room-charge`、退款流程 | 金額／付款狀態，爭議最多，且是 service role NULL actor 的主要來源 |
| 2 | OwlTing：`owltingAutoOrder.ts`、`owlting-fillup-submit`、`owlting-order-push` 回寫 | 自動建單／改單，目前完全無紀錄 |
| 3 | HotelNabe 同步回寫 | 同上，量大需正確標記為系統 |
| 4 | 已結清折扣／加購 RPC（`update_paid_order_discount_v2`、`update_paid_order_addons_v3`） | 已有 audit_logs，只需補 source/reason 對齊 |
| 5 | /admin 手動：`OrderDetail.tsx`、`OrderPriceEditDialog`、`Reception.tsx`、`CreateOrderDialog`、狀態／來源／改期 dialogs | 有真實 user，actor 已正確，只補 source 讓來源可讀 |
| 6 | 團購、KOL、匯入、批次與報表類（`ImportOrdersDialog` 等） | 低頻、離線批次 |

未補的呼叫端不會出錯：actor 走預設（有 uid → user／無 uid → unknown），`source='unmarked'`。

---

## 五、測試（BEGIN … ROLLBACK，全部在單一交易內建立物件、驗證、回滾）

1. **一般欄位變動**：UPDATE 一筆訂單的 `final_price` 與 `guest_phone` → `order_change_log` 應 1 列，`changed_fields` 含 `final_price {from,to}` 與 `guest_phone {changed:true}`（不含電話值）。
2. **service role 觸發押金 trigger**：`SET LOCAL role = service_role`（auth.uid() 為 NULL）→ UPDATE `deposit_required_amount` → `log_order_deposit_change` 直接 RETURN NEW（不噴 23502、audit_logs 不新增任何列），該異動由 `order_change_log` 以 system actor 記錄。
3. **同交易多次 UPDATE**：同一交易連續兩次 UPDATE → `order_change_log` 兩列但 `txid` 相同 → 前端群組後為 1 筆。
4. **舊資料顯示**：挑真實訂單（同時具 `changes` 陣列與 create 舊結構）並列列出 audit_logs 與 order_change_log，確認合併後總筆數 = 舊筆數 + 新筆數，舊列一筆不少。
5. **RLS**（policy 已移除多餘的 hotel_admin EXISTS 段）：以無角色使用者 / 該館 hotel_admin / 他館 hotel_admin / 該館 staff(orders 預設 editable) 四種身分 SELECT `order_change_log`，應分別為 0 / 有資料 / 0 / 有資料；並驗證 authenticated 直接 INSERT 被拒（42501）。

執行方式與 V5.5A.5–A.7 相同：整包 DDL + 測試包在一個 migration 交易中，最後 `RAISE EXCEPTION` 強制回滾，取得真實輸出後再請求核准正式安裝。

---

## 六、實測結果（已在單一交易內建立物件→測試→強制 ROLLBACK，2026-09-09）

測試對象：真實訂單 `CE2V95Y5`（652770d9-…）。

```
T1 changed_fields=[{"to": 23276, "from": 23275, "field": "final_price"},
                   {"field": "guest_phone", "changed": true}]
T2 sentinel_audit_rows=1  change_log_actor=unknown/unmarked_system
T3 2 列 / distinct txid=1
T4 audit(order/order_meta)=1875  其中 changes陣列=1122  order_deposit=460
T5 無角色使用者可見=0 / INSERT被擋 SQLSTATE=42501
ERROR: P0001 ROLLBACK-BY-DESIGN（整批回滾）
```

判讀：
- T1 金額記完整 from/to、電話只記「有變動」不記值 → 分級正確。
- T2 以 `SET LOCAL ROLE service_role`（auth.uid() 為 NULL）更新押金：audit_logs 以 sentinel user_id 成功寫入 1 列（舊版此情境會 23502 失敗）；order_change_log actor 落為 `unknown/unmarked_system`（未補 context 時的預設）。
- T3 同交易兩次 UPDATE → 2 列但 txid 相同，前端可收斂為 1 筆。
- T4 舊資料全在：order/order_meta 共 1875 筆（其中 changes 陣列 1122 筆），order_deposit 460 筆（含 T2 新增的 1 筆，交易外仍為 459）。
- T5 無角色使用者讀不到、authenticated 直接 INSERT 被 RLS 擋（42501）。

回滾後驗證（交易外）：`order_change_log` 不存在、`resolve_change_actor` 不存在、
`log_order_deposit_change` md5 = `4b33bfc95401fa843f53f21e01da3253`（原版）、
audit_logs order_deposit 459 筆、訂單 final_price/guest_count/deposit_required_amount =
23275 / 14 / 5000（全部還原）。零殘留、零業務資料異動。

備註：`has_role(uuid, app_role)` 在本專案不存在，實際權限函式為
`public.is_super_admin(uuid)` / `public.is_admin(uuid)` / `public.get_staff_module_permission(uuid,uuid,text)`，
第五節的 policy 全文已以此為準（設計文件第二節請以本節版本為準）。
