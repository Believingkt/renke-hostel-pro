# 設計稿：order_meta / kol_profiles 補稽核 ＋ 收緊 RLS

狀態：**只設計，未施工**。本稿不建立、不執行任何 migration。

---

## 現況查證（本輪即時查詢）

**order_meta_update（UPDATE，USING）**
```
super_admin OR admin OR closer_manager
OR filled_by = auth.uid() OR closer_id = auth.uid()
OR scout_id = auth.uid() OR video_creator_id = auth.uid()
OR (accommodation_id IS NOT NULL AND user_has_access_to_accommodation(auth.uid(), accommodation_id))
```
→ 整列可寫，無欄位級限制。

**既有業務規則已存在，不需另行發明。** 分潤欄位實際上已由 trigger
`trg_enforce_order_meta_commission_fields`（函式 `enforce_order_meta_commission_fields`）把關，語意為：
- `auth.uid() IS NULL`（service_role／背景工作）→ 直接放行
- 巢狀 trigger 自動重算 `team_commission_price` 的唯一白名單路徑 → 放行
- `super_admin / admin / finance` → 全放行
- `scout_commission_rate` / `closer_commission_rate` 任何變動 → 只有上述管理層可改，其餘一律 42501
- `force_*` 欄位 → 需 `closer_manager`
- `team_commission_price` 等定價欄位 → 需「OLD 與 NEW 的 closer_id 都等於自己」

前端 `src/lib/commissionBaseAccess.ts` 與此逐條對齊（檔頭註解即明示契約）。
**結論：RLS 的收緊方向＝把 trigger 既有語意複製到 policy 層，不新增規則。**

**kol_profiles_update（UPDATE，USING）**
```
created_by = auth.uid() OR super_admin OR admin OR scout_manager
OR scout OR venue_manager OR hotel_admin
```
→ 只要具 `scout` 角色即可改全部列。表上有 `scout_id uuid`、`created_by uuid`、`updated_at`，**無 `updated_by`**。

兩表皆無 `updated_by`，稽核僅靠應用層寫 `audit_logs`（只涵蓋後台 UI 路徑）。

---

## 一、補稽核

### 1. 共用 trigger 函式（新建，原子撤權）

```sql
CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- 不需提權，不做 DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();   -- service_role / cron 時為 NULL，代表「系統路徑」
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_by() FROM PUBLIC;
```
說明：SECURITY INVOKER 不涉及提權，但仍依專案規則在同一 migration 內收權。
`auth.uid()` 為 NULL 時寫入 NULL 而非中止 —— 與 deposit trigger 規則一致，
不得因背景工作而擋掉寫入。

### 2. order_meta

```sql
ALTER TABLE public.order_meta ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE TRIGGER trg_order_meta_set_updated_by
BEFORE INSERT OR UPDATE ON public.order_meta
FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
```
觸發順序：trigger 名稱以 `trg_order_meta_s…` 排序，晚於
`trg_enforce_order_meta_commission_fields`（`trg_e…`），故授權檢查先跑、
稽核欄位後寫，不影響既有 `to_jsonb(NEW) - 'team_commission_price'` 比對
（該比對發生在授權 trigger 內、稽核 trigger 之前）。

`updated_by` 不加入任何既有 policy 或 trigger 的判斷式，純記錄。

### 3. kol_profiles

```sql
ALTER TABLE public.kol_profiles ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE TRIGGER trg_kol_profiles_set_updated_by
BEFORE INSERT OR UPDATE ON public.kol_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
```
名稱排序晚於三支既有 `trg_kol_profiles_*`（assign／normalize／sync），不干擾其輸出。

### 4. 既有資料

`updated_by` 對歷史列一律 NULL，**不回填、不猜測**。歷史黑箱維持黑箱，
本批只保證「從上線那一刻起，所有 UPDATE 來源（含直接打 API）都留下操作者」。

---

## 二、收緊 policy

### 5. order_meta_update

RLS 無法做欄位級判斷，因此收緊採「policy 收列級 + trigger 保欄位級」分工，
policy 僅移除「非利害關係人也能改」的破口，欄位級授權仍由既有 trigger 負責（不動）。

```sql
DROP POLICY IF EXISTS "order_meta_update" ON public.order_meta;

CREATE POLICY "order_meta_update"
ON public.order_meta
FOR UPDATE
TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'closer_manager'::public.app_role)
  OR filled_by = auth.uid()
  OR closer_id = auth.uid()
  OR scout_id  = auth.uid()
  OR video_creator_id = auth.uid()
  OR (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
)
WITH CHECK (
  -- 不得把訂單的歸屬人改成別人以外洗權，也不得讓 accommodation_id 漂移
  (
    public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
    OR public.user_has_team_role(auth.uid(), 'finance'::public.app_role)
    OR public.user_has_team_role(auth.uid(), 'closer_manager'::public.app_role)
  )
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_meta.order_id
      AND o.accommodation_id IS NOT NULL
      AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
      AND (order_meta.accommodation_id IS NULL
           OR order_meta.accommodation_id = o.accommodation_id)
  )
  OR filled_by = auth.uid()
  OR closer_id = auth.uid()
  OR scout_id  = auth.uid()
  OR video_creator_id = auth.uid()
);
```

差異說明：
- 原 policy **沒有 WITH CHECK**，代表通過 USING 後可把 `accommodation_id`
  改成任意館別（與 `order_meta_insert` 既有的 payload 一致性契約相牴觸）。本次補上，
  語意直接沿用 `order_meta_insert` 已核准的契約。
- 新增 `finance`（既有 trigger 與前端都視 finance 為管理層，policy 卻漏列，
  finance 目前只靠 accommodation 條件偶然通過）。
- **分潤四欄位的授權不在此處改**：維持 trigger 為唯一判準，policy 不重複發明。

### 6. kol_profiles_update

```sql
DROP POLICY IF EXISTS "kol_profiles_update" ON public.kol_profiles;

CREATE POLICY "kol_profiles_update"
ON public.kol_profiles
FOR UPDATE
TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::public.app_role)
  OR scout_id = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::public.app_role)
  OR scout_id = auth.uid()
  OR created_by = auth.uid()
);
```
- 移除無條件的 `scout` / `venue_manager` / `hotel_admin` 三項。
- `scout` 改為「`scout_id` 是本人」；保留 `created_by = auth.uid()`（原本就有，
  避免剛建立但尚未指派 scout_id 的列鎖死自己）。
- WITH CHECK 與 USING 同式 → 無法把別人的 KOL 改成掛到自己名下（改後仍須自己可見的歸屬）。

**上線前必須先做影響評估**：`venue_manager` 與 `hotel_admin` 目前可改，收緊後不行。
需先查這兩類角色實際是否在改 kol_profiles（靠新 `updated_by` 觀察最準，
因此建議「先補稽核、觀察一段時間、再收 kol policy」的兩階段施工，順序見下。）

---

## 三、施工順序建議（待授權）

1. 第一批：只做「一、補稽核」（欄位＋trigger）。零行為變更、零風險。
2. 第二批：`order_meta_update` 收緊（僅補 WITH CHECK 與 finance）。
3. 第三批：`kol_profiles_update` 收緊，前提是第 1 批稽核已觀察到
   `venue_manager` / `hotel_admin` 沒有實際寫入需求。

---

## 四、驗證方案（比照 accommodation_notification_settings 那批）

沙盒連線角色 `rolbypassrls = t`，無法 `SET ROLE authenticated` 模擬身分，
因此沿用上批已核准的**乙案：代入真實 uid 對判斷式求值**。

### A. 修正前存證
對每個測試 uid，直接以 SQL 求值舊 policy 判斷式，記錄 true/false。

### B. 修正後同式重跑
以相同 uid 求值新判斷式，逐條列出前後對照表。

測試矩陣（uid 皆取自 `user_roles` 既有真實帳號，不新建帳號、不寫入資料）：

| # | 身分 | 目標列 | 期望（修正後） |
|---|------|--------|----------------|
| T1 | scout A | `scout_id = A` 的 kol_profiles | 允許 |
| T2 | scout A | `scout_id = B` 的 kol_profiles | 阻擋（修正前：允許） |
| T3 | scout_manager | 任意列 | 允許（不變） |
| T4 | super_admin | 任意列 | 允許（不變） |
| T5 | venue_manager | 非自己的列 | 阻擋（修正前：允許）— 需事前確認無營運需求 |
| T6 | closer A | `closer_id = A` 的 order_meta | 允許（不變） |
| T7 | closer A | 他人訂單 order_meta | 阻擋（不變，USING 即擋） |
| T8 | closer A | 自己訂單但改 `accommodation_id` 成別館 | 阻擋（修正前：允許，WITH CHECK 新增） |
| T9 | finance | 任意 order_meta | 允許（修正前靠館別偶然通過） |

求值範例（純 SELECT，零寫入）：
```sql
SELECT k.id,
       (public.user_has_team_role('<uid>'::uuid,'scout_manager'::public.app_role)
        OR k.scout_id = '<uid>'::uuid
        OR k.created_by = '<uid>'::uuid) AS new_allows
FROM public.kol_profiles k
WHERE k.id IN ('<自己的>','<別人的>');
```

### C. 稽核 trigger 驗證
在非營運館別的測試列上（需先以查詢證明該列無真實訂單關聯），
執行一次無實質意義的自我更新（例如 `SET updated_at = updated_at`），
確認 `updated_by` 被寫入預期 uid；驗證後**原樣保留該列**、不清理、回報結果。
若專案不允許任何寫入，則此項改以「trigger 定義 + pg_trigger 存在性」靜態證明替代，
並明確標註「未做實際寫入驗證」。

### D. Postcheck
- `pg_policy` 即時查詢，貼出兩條 policy 的最終原文。
- `information_schema.columns` 確認 `updated_by` 存在且為 nullable uuid。
- `pg_trigger` 確認兩支新 trigger 存在、`tgenabled = 'O'`、排序在既有 trigger 之後。
- `routine_privileges` / `has_function_privilege` 確認 `set_updated_by`
  的 anon / authenticated / PUBLIC 均無 EXECUTE。
- 兩表列數與抽樣內容與施工前逐字一致。
- 測試套件與基準比對（目前基準：1516 項、23 失敗）。

---

## 五、本批明確不會動到的範圍

- **分潤／獎金計算**：`calc_team_commission_price`、
  `enforce_order_meta_commission_fields`、`set_default_team_commission_price`、
  `create_commission_record`、`closer_commission_*` 相關表與函式 — 全部 diff = 0。
- **前端**：`src/lib/commissionBaseAccess.ts`、`src/pages/team/**`、
  `OrderMetaDrawer` 及任何 `/team` 頁面判斷邏輯 — 零檔案異動。
- **業主月結**：`owner_settlement_pricing_rules`、
  `course_profit_*`、`franchise_*` — 完全不碰。
- **其他表**：除 `order_meta`、`kol_profiles` 外不新增／不修改任何表、欄位、policy，
  包含仍待處理的 `group_buy_campaign_notification_settings` 舊債。
- **不回填** 任何歷史 `updated_by`。
- **不修復、不忽略** 安全掃描中的其他 finding。
- 不 Publish、不部署 Edge Function。
