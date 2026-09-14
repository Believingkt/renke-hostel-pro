# accommodation_notification_settings 跨館 RLS 漏洞：唯讀調查與修正設計稿（未施工）

本批未新增/修改/執行任何 migration，未動任何資料，未碰 `supabase/functions/send-order-confirmation/index.ts`。

## 一、現況 policy SQL 原文（共 4 條，皆 TO authenticated）

```sql
CREATE POLICY "Managers can view accommodation notification settings"
  ON public.accommodation_notification_settings FOR SELECT TO authenticated
  USING (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can insert accommodation notification settings"
  ON public.accommodation_notification_settings FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can update accommodation notification settings"
  ON public.accommodation_notification_settings FOR UPDATE TO authenticated
  USING (is_admin_or_super() OR is_hotel_admin_of(accommodation_id))
  WITH CHECK (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can delete accommodation notification settings"
  ON public.accommodation_notification_settings FOR DELETE TO authenticated
  USING (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));
```

漏洞成因（函式原文查證）：

```sql
-- is_admin_or_super()：不看 accommodation_id
SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('super_admin','hotel_admin'));
```

即「任一館的 hotel_admin」→ 對全表所有館別皆 true，讀寫刪都成立。

## 二、歷史原因調查（依實際檔案，非推測）

- 建表 migration：`supabase/migrations/20260822053810_...sql` 第 1-33 行，四條 policy 自建表當天即寫成 `is_admin_or_super() OR is_hotel_admin_of(accommodation_id)`，**檔內沒有任何註解說明為何用 is_admin_or_super()**。
- 同一支 migration 第 35 行起建的 `group_buy_campaign_notification_settings` 用了完全相同的 `is_admin_or_super() OR ...` 前綴，顯示這是當時的**樣板複製習慣**，不是為了規避遞迴。
- 遞迴規避證據不成立：`is_admin_or_super()`、`is_hotel_admin_of()`、`is_super_admin()` 三者皆為 `SECURITY DEFINER` + `SET search_path = public`，查 `user_roles` 時一律繞過 RLS。既然同一條 policy 裡已經在用 `is_hotel_admin_of()`（同樣查 user_roles），就不可能是為了避開 user_roles 遞迴才多加 `is_admin_or_super()`。
- 結論：這是「super_admin 全域放行」的便宜寫法，副作用是把 hotel_admin 一起全域放行，屬設計疏漏。
- 後續 migration `20260913162343_...sql` 只加 `booking_confirmation_emails` 欄位與兩欄註解，未動 policy。

## 三、is_super_admin(auth.uid()) 可否替換

可以，無遞迴風險：

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin(user_uuid uuid)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = user_uuid AND role = 'super_admin'); $$
```

- SECURITY DEFINER 讓它以 owner 身分讀 `user_roles`，不觸發 user_roles 自身的 RLS（user_roles 的 SELECT policy 本身也在呼叫 `is_super_admin`／`can_view_user_roles`，若無 DEFINER 才會遞迴）。
- 語意差異：只認 `super_admin`，不含 `hotel_admin`，正是本次要收斂的部分。
- 唯一需注意：`is_super_admin` 未標 `STABLE`（`is_admin_or_super`/`is_hotel_admin_of` 有）。這只影響 planner 快取，不影響正確性；本批不改動該函式定義。

## 四、修正後 SQL 設計稿（逐條，未執行）

```sql
-- 1) SELECT
DROP POLICY "Managers can view accommodation notification settings"
  ON public.accommodation_notification_settings;
CREATE POLICY "Managers can view accommodation notification settings"
  ON public.accommodation_notification_settings FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id));

-- 2) INSERT
DROP POLICY "Managers can insert accommodation notification settings"
  ON public.accommodation_notification_settings;
CREATE POLICY "Managers can insert accommodation notification settings"
  ON public.accommodation_notification_settings FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id));

-- 3) UPDATE
DROP POLICY "Managers can update accommodation notification settings"
  ON public.accommodation_notification_settings;
CREATE POLICY "Managers can update accommodation notification settings"
  ON public.accommodation_notification_settings FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))
  WITH CHECK (is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id));

-- 4) DELETE
DROP POLICY "Managers can delete accommodation notification settings"
  ON public.accommodation_notification_settings;
CREATE POLICY "Managers can delete accommodation notification settings"
  ON public.accommodation_notification_settings FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id));
```

逐條差異：四條都只有一處改動 —— `is_admin_or_super()` → `is_super_admin(auth.uid())`。

| 身分 | 修正前 | 修正後 |
|---|---|---|
| super_admin | 全館可讀寫 | 全館可讀寫（不變） |
| A 館 hotel_admin，操作 A 館 | 可 | 可（不變，走 is_hotel_admin_of） |
| A 館 hotel_admin，操作 B 館 | **可（漏洞）** | 被擋 |
| staff / 其他角色 | 不可 | 不可（不變） |
| service_role（Edge Function） | 繞過 RLS | 繞過 RLS（不變） |

本批不動 `group_buy_campaign_notification_settings`（同樣有 `is_admin_or_super()`，另案處理）。

## 五、對既有資料與 send-order-confirmation 的交叉比對

- 只 DROP/CREATE POLICY，無 `ALTER TABLE`、無 DML，`booking_confirmation_emails` 與 `booking_notification_emails` 兩欄的資料與欄位定義完全不受影響。
- `supabase/functions/send-order-confirmation/index.ts` 本批不修改。其查詢路徑（第 157 行建 client、第 81-85 行查表）：
  - `createClient(SUPABASE_URL, SERVICE_KEY)`，SERVICE_KEY = `SUPABASE_SERVICE_ROLE_KEY`；
  - `.from("accommodation_notification_settings").select("booking_confirmation_emails").eq("accommodation_id", ...).maybeSingle()`。
  - service_role 不受 RLS 限制（且建表 migration 已 `GRANT ALL ... TO service_role`），policy 改動對它無效力，寄信副本行為 0 影響。
- 前台/後台以 authenticated 身分存取的兩處也一併確認：
  - `src/components/admin/BookingConfirmationRecipientsCard.tsx`（select + upsert，帶 accommodation_id）；
  - `src/hooks/use-onboarding-progress.tsx`（select，帶 accommodation_id）。
  兩者都是操作「自己目前所在館別」，super_admin 與該館 hotel_admin 修正後皆照常通過。唯一會改變的是「A 館 hotel_admin 硬切到 B 館」這種越權情境。

## 六、測試計畫（本批不執行）

真實資料庫驗證，不做程式碼審查式推論。

前置（全部用臨時資料，測完刪除）：
1. 以 service_role 建兩個測試帳號 `rlstest_a@…`、`rlstest_b@…`（email_confirm）。
2. 在 `user_roles` 各插入一列 `hotel_admin`：A 綁「奧丁丁測試」館、B 綁「旅行日-十一鳴」館（沿用先前批次的低風險測試館）。
3. 若該兩館在 `accommodation_notification_settings` 尚無列，以 service_role 先建空列（`booking_confirmation_emails = '{}'`），並記錄原始值以便還原；已有列則只記錄原值，測試中不做破壞性寫入（UPDATE 測試改寫入原值＋一個 sentinel 後立即還原）。

執行方式：用 anon key 的 supabase-js client 以 A 帳號 `signInWithPassword` 登入（等同真實後台身分，RLS 生效），對 B 館的列發四種操作。

| # | 操作 | 修正前預期 | 修正後預期 |
|---|---|---|---|
| T1 | A 登入 SELECT B 館列 | 回 1 列（漏洞成立） | 回 0 列 |
| T2 | A 登入 UPDATE B 館 `booking_confirmation_emails` | 成功、資料被改 | 影響 0 列（RLS 過濾） |
| T3 | A 登入 INSERT 一列 B 館 `accommodation_id` | 成功 | 42501 new row violates RLS |
| T4 | A 登入 DELETE B 館列 | 成功 | 影響 0 列 |
| T5（不得退化） | A 登入對 **A 館自己**的列 SELECT/UPDATE | 成功 | 仍成功 |
| T6（不得退化） | super_admin 帳號讀寫任一館 | 成功 | 仍成功 |
| T7（不得退化） | 以 service_role 重跑一次 send-order-confirmation 的查詢（純 SELECT，不寄信） | 有資料 | 仍有資料 |

執行順序：先在修正前跑 T1-T4 存證（截圖／回傳原文），並立即還原被改動的資料；再套用第四節 migration；最後重跑 T1-T7。
收尾：刪除兩個測試帳號與其 user_roles 列，還原兩館設定為原始值，附上還原後的即時查詢結果作為證據。
