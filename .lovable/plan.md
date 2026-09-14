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

## 六、測試計畫 v2（本批不執行；已移除對真實營運館的寫入）

### 6.1 測試館查證結果（實查，非看名稱）

| 館別 | is_active | 全部訂單 | 非取消訂單 | notification_settings 列 | 判定 |
|---|---|---|---|---|---|
| 奧丁丁測試 | false | 1（DY7C72S2，客名「測試客人」，order_source=manual，已取消、未付款） | 0 | 0 | **sandbox，可用** |
| 旅行日-十一鳴 | false | 2（GF8N78S8、HV9A58D5，KOL 單，客名為真實姓名） | 0 | 0 | **含真實客人資料，不可寫入** |
| 旅行日-心齋之翼 | false | 5（皆真實 KOL/LINE 客名） | 0 | 0 | 不可寫入 |
| 其餘 12 家 | 多為 true | 4～3376 | 皆 >0 | 森山寫照 1 列、其餘 0 | 正式營運，不可寫入 |

結論：**全庫沒有第二家零訂單、非營運的 sandbox 館**。唯一安全的是「奧丁丁測試」，且它的唯一訂單是已取消的手動測試單。因此改採第 3 案：**交易內測試、全程 ROLLBACK，不對任何真實館別留下寫入**。

### 6.2 替代做法：單一交易內模擬身分 + 強制 ROLLBACK

用 `psql "$SUPABASE_DB_URL"` 直連（sandbox 已確認可用），整段包在 `BEGIN; ... ROLLBACK;` 內，並以 `SET LOCAL ROLE authenticated` + `SET LOCAL request.jwt.claims` 模擬指定使用者，讓 RLS 真正生效。

- **不需要新增 auth 使用者**：`is_hotel_admin_of()` / `is_super_admin()` 只讀 `user_roles`，身分由 jwt claims 的 `sub` 決定，因此直接沿用資料庫既有的真實 hotel_admin user_id 即可（純讀，不改他們的角色）。
- A 館身分 = 只綁單一館別的既有 hotel_admin（挑選時以 `user_roles` 查證該 user 沒有 super_admin、且沒有 B 館角色）。
- B 館 = 奧丁丁測試（`0a3d6160-…`）。其 `accommodation_notification_settings` 目前 0 列，測試用的列在交易內建立、交易結束即消失。
- 全程 `ROLLBACK`，不使用還原步驟；即使腳本中途失敗或連線中斷，Postgres 也會自動回滾，資料庫不可能留下殘留。
- 交易期間對真實訂單流程零影響：`send-order-confirmation` 讀的是 committed 資料，看不到未提交的變更。

骨架（示意，實跑時才填 uuid）：

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<A館 hotel_admin uuid>","role":"authenticated"}';

-- T3 INSERT 越權
INSERT INTO public.accommodation_notification_settings(accommodation_id, booking_confirmation_emails)
VALUES ('0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', ARRAY['rlstest@example.invalid']);
-- T1 SELECT 越權
SELECT count(*) FROM public.accommodation_notification_settings
 WHERE accommodation_id = '0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8';
-- T2 UPDATE 越權 / T4 DELETE 越權（看 ROW_COUNT）
...
ROLLBACK;
```

### 6.3 測試矩陣

| # | 身分 | 動作 | 修正前預期 | 修正後預期 |
|---|---|---|---|---|
| T1 | A 館 hotel_admin | SELECT B 館列 | 看得到（漏洞成立） | 0 列 |
| T2 | A 館 hotel_admin | UPDATE B 館列 | ROW_COUNT=1 | ROW_COUNT=0 |
| T3 | A 館 hotel_admin | INSERT B 館 accommodation_id | 成功 | 42501 violates RLS |
| T4 | A 館 hotel_admin | DELETE B 館列 | ROW_COUNT=1 | ROW_COUNT=0 |
| T5 | A 館 hotel_admin | 對**自己 A 館**列 SELECT/UPDATE | 成功 | 仍成功（不得退化） |
| T6 | super_admin | 讀寫任一館 | 成功 | 仍成功（不得退化） |
| T7 | service_role（`SET LOCAL ROLE service_role`） | SELECT booking_confirmation_emails（複製 send-order-confirmation 的查詢） | 有資料 | 仍有資料，證明寄信路徑不被擋 |

### 6.4 為什麼這樣一樣算真實驗證

- RLS 是在 SQL 執行當下由 planner 套用，與是否 COMMIT 無關：交易內的 INSERT 被 42501 擋下、UPDATE/DELETE 回 ROW_COUNT=0，都是 policy 真的生效的結果，不是程式碼推論。
- T1-T4 會在**同一個資料庫、同一組 policy、真實角色身分**下各跑兩次（套 migration 前 / 後），拿到可貼出的實際輸出差異。
- 唯一與線上不同的是「不 commit」，而 RLS 判斷不看提交狀態，因此結論等價，風險則降為 0。

### 6.5 執行順序（待核准後）

1. 修正前：跑一次 6.2 腳本，貼出 T1-T4 輸出＝漏洞存證，ROLLBACK。
2. 套用第四節 migration（四條 policy DROP/CREATE）。
3. 修正後：同一份腳本重跑，加跑 T5-T7，貼出輸出。
4. Postcheck：貼出 `pg_policies` 即時查詢，確認四條 policy 已不含 `is_admin_or_super()`；貼出 `accommodation_notification_settings` 全表即時查詢，確認列數與內容與修正前完全一致（森山寫照 1 列、其餘 0 列）。
