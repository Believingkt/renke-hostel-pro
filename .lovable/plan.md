# 業主上架引導流程（A–F）— 最終統一施工計畫（僅計畫，未施工）

狀態：未建立任何檔案、未執行任何 migration、未修改任何既有程式。等核准。

---

## 0. 通知信箱子專案完工後的適用性重新確認（第 2 點）

逐項重驗結果：

| 原設計項目 | 現況重驗 | 是否需調整 |
| --- | --- | --- |
| 新表 `accommodation_onboarding_steps` 結構 | 全庫仍無 onboarding/checklist 類表 | **不變** |
| 第 13 步（通知設定）判定 | `accommodation_notification_settings` 已新增 `booking_confirmation_emails text[] NOT NULL DEFAULT '{}'`（型別檔 `src/integrations/supabase/types.ts:882` 已同步） | **改為 A 型純讀既有表**（原本因無欄位只能列 B 型確認制） |
| Onboalding 15 步驟卡片 | 第 13 步從「無法自動判定」變成可自動判定 → 需讀新表的步驟由 4 項降為 3 項 | **調整** |
| 側邊欄第 14 項「訂房確認信」連結 | `src/config/adminMenu.ts:93` 已由「訂房確認通知」改名為「訂房確認信」 | 引導頁連結文案沿用新名 |
| 團購通知卡位置 | 已搬至團購管理→通知設定，不再出現在訂房確認信頁 | 引導頁不再把團購通知列為上架步驟 |
| Dashboard 橫幅 | `src/pages/Dashboard.tsx` 仍存在、仍是登入後預設頁（`getAdminPath()` 無角色分支） | **不變** |
| 孤兒路由改 Navigate | 重驗 `admin/user-roles`（App.tsx:593）與 `admin/public-holidays`（App.tsx:627）全庫無任何連結指向 | **不變** |
| Postcheck 計畫 | 需補一項：新欄位判定的真實資料驗證 | **微調** |

結論：整份設計仍適用，只有第 13 步的判定方式與 postcheck 多一項要調整，其餘一致。

---

## 1. 第 13 步完成度判定（第 1 點）

- 判定型：**A 型（純讀既有表，不寫新表）**
- 資料來源：`accommodation_notification_settings.booking_confirmation_emails`（以 `accommodation_id` 查，`maybeSingle`）
- 規則：陣列長度 > 0 → `completed`；空陣列或整列不存在 → `pending`
- 性質：**選填**。不計入上架完成度分母，不會讓現有 12 家已營運館別被打回「未完成」；卡片右側顯示灰色「選填」標籤而非紅色警示。
- 團購通知信箱（`booking_notification_emails`）**不納入**此判定。

---

## 2. 15 步驟完成度判定總表

A 型＝純讀既有表自動推導；B 型＝讀 `accommodation_onboarding_steps` 的業主確認狀態；HQ＝唯讀顯示「請聯絡總部」。

| # | 步驟 | 型 | 判定 |
| --- | --- | --- | --- |
| 1 | 基本資料 | A | `accommodation_info` 名稱／地址／電話／簡介皆非空 |
| 2 | 介紹與照片 | A | `about_section` 有內容且 `accommodation_photos` ≥ 3 |
| 3 | 設施服務 | A | `accommodation_facilities` 中該館別 **`is_available IS NOT false`** 的列 ≥ 1（讀設施自己的欄位，**不讀** `accommodation_info.is_active`） |
| 4 | 房型與房間照片 | A | `room_types` ≥ 1，且每個房型 `room_photos` ≥ 1 |
| 5 | 入住人數 | A | 所有房型 `capacity` > 0 |
| 6 | 房價設定 | A | `pricing_templates` ≥ 1 且綁到現有房型 |
| 7 | 庫存 | A | 未來 30 天中，`room_inventory_pricing` 有 **≥ 7 個不重複日期**且該日 `available_rooms > 0` |
| 8 | 訂房方案 | A | `accommodation_packages` ≥ 1 且 `enabled = true` |
| 9 | 前台價格 | A | 未來 30 天中，`package_date_prices` 對應啟用方案有 **≥ 7 個不重複日期**且價格 > 0 |
| 10 | 付款方式 | A | `booking_settings.payment_methods` 非空 |
| 11 | 訂金比例 | HQ | 唯讀顯示現值＋「請聯絡總部調整」 |
| 12 | 入住押金 | HQ | 唯讀顯示現值＋「請聯絡總部調整」 |
| 13 | 通知信箱 | A（**本次接上**） | `booking_confirmation_emails` 非空＝完成；空＝待確認；**選填** |
| 14 | 取消政策與注意事項 | B | 文字欄位有預設種子值，無法用非空判斷 → 由業主按「我已確認」寫入新表；退款天數本身仍為 HQ 唯讀 |
| 15 | 上架前最終確認 | B | **1–10 全綠且第 14 步已確認**才可按；第 13 步選填不列入。按下寫入新表，僅作紀錄，不自動改 `is_active` |

HQ 三項（11、12、以及 14 內的退款天數）呈現方式：卡片底色 `bg-muted`、欄位唯讀、右上角標「總部設定」、底部一行「需要調整請聯絡總部」，不計入完成度分母。

---

## 3. 建表 migration SQL（僅列出，未執行）

```sql
CREATE TABLE public.accommodation_onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_by uuid,
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_onboarding_steps_status_check
    CHECK (status IN ('pending', 'confirmed', 'not_applicable')),
  CONSTRAINT accommodation_onboarding_steps_unique UNIQUE (accommodation_id, step_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_onboarding_steps TO authenticated;
GRANT ALL ON public.accommodation_onboarding_steps TO service_role;

ALTER TABLE public.accommodation_onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_steps_select"
  ON public.accommodation_onboarding_steps FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "onboarding_steps_insert"
  ON public.accommodation_onboarding_steps FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "onboarding_steps_update"
  ON public.accommodation_onboarding_steps FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "onboarding_steps_delete"
  ON public.accommodation_onboarding_steps FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_accommodation_onboarding_steps_updated_at
  BEFORE UPDATE ON public.accommodation_onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.accommodation_onboarding_steps IS
  '上架引導的「業主已確認」狀態紀錄。純 UI 引導用，不存訂房核心資料，不被訂單／計價／庫存／分潤讀取。';
```

RLS 全部使用既有函式，**不新建任何 SECURITY DEFINER 函式**：
- `public.is_super_admin(uuid)` — 建立於 `20260124102710_*.sql:7`
- `public.is_hotel_admin_of(uuid)` — 建立於 `20260628110514_*.sql:4`（判定該館別的 `super_admin` / `hotel_admin`）
- `public.update_updated_at_column()` — 既有共用 trigger 函式

---

## 4. Dashboard 提醒橫幅（C 節）

- 位置：`src/pages/Dashboard.tsx` 最上方，標題列之下。
- 顯示條件：目前館別的 A 型必要步驟（1–10）**未全綠**時顯示。第 13 步選填、11/12 HQ 項皆不列入。
- 內容：一行文字「上架設定尚未完成（已完成 X／10）」＋進度條＋按鈕「前往上架引導」。
- 關閉：保留「稍後再說」按鈕，按下寫入 `localStorage`（key `onboarding_banner_dismissed_<accommodationId>`，存當日日期字串），**當天不再顯示、隔天自動再出現**；不寫任何資料庫。
- 自動消失條件：1–10 全綠後元件回傳 `null`（比照專案既有「空區塊直接隱藏、不留骨架」原則）。
- 讀取失敗或無館別 → 一律回傳 `null`，不顯示錯誤狀態。

---

## 5. 孤兒路由清理（D 節，重驗後）

本批只動這兩條，兩條皆已重驗全庫（`src`、`supabase`）無任何連結指向：

| 路由 | 現況 | 處理 | 風險 |
| --- | --- | --- | --- |
| `admin/user-roles`（App.tsx:593） | 與 `/admin/accounts` 功能重複，側邊欄未列 | 改為 `<Navigate to="/admin/accounts" replace />` | 低。舊書籤自動轉址，不會 404 |
| `admin/public-holidays`（App.tsx:627） | 與 `/admin/holidays` 重複，側邊欄未列 | 改為 `<Navigate to="/admin/holidays" replace />` | 低。同上 |

其餘孤兒路由（`/admin/faq`、`/admin/permission-templates`、`/admin/notifications`、`/admin/backup`、`/admin/email-test` 等）本批**不動**，另案處理。`InventoryManagement.tsx` 等死碼本批**不刪**。

---

## 6. 檔案異動清單

新增：
- `src/pages/admin/Onboarding.tsx`
- `src/hooks/use-onboarding-progress.tsx`
- `src/lib/onboarding/steps.ts`
- `src/components/admin/OnboardingBanner.tsx`
- 測試：`src/lib/onboarding/__tests__/steps.test.ts`

修改：
- `src/config/adminMenu.ts`（新增「上架引導」入口）
- `src/App.tsx`（掛 `/admin/onboarding` 路由＋兩條 Navigate 轉址）
- `src/pages/Dashboard.tsx`（掛橫幅一行）
- `roadmap.md`

**完全不動**：`RoomTypeForm.tsx`、`PricingTemplateManager.tsx`、`InventoryManagement.tsx`、`AdminPackages.tsx`、`PackagePriceCalendar.tsx`、`RoomPriceCalendar.tsx`、`WebsiteContent.tsx` 寫入邏輯、所有 `/team`、所有分潤／退款／OTA／團購檔、所有 Edge Function、所有既有 RLS／trigger／cron。引導頁一律以連結導向既有頁面，**本身不寫入任何訂房核心資料表**。

---

## 7. Postcheck 計畫（F 節，含本次新增項）

1. **保護檔 diff = 0**（附施工前後 md5）：上列「完全不動」清單全部，外加 `supabase/functions/send-order-confirmation/index.ts`、`_shared/orderConfirmationEmail.ts`。
2. **完整測試套件基準比對**：以施工前 commit `git archive` 實跑，逐項檔名比對，`only-in-base = 0`、`only-in-current = 0`，維持既有 23 項固定失敗。
3. **型別檢查**通過。
4. **新增單元測試**：15 步驟判定函式（含第 13 步空／非空兩種情形）。
5. **真實資料驗證（本次新增）**：對一間館別實際填入 `booking_confirmation_emails` → 第 13 步轉綠；清空 → 回「待確認」且**上架完成度分母與百分比皆不變**（證明選填不擋關）。測試後資料還原。
6. **既有 12 家館別回歸**：附 15 家館別完成度快照，證明沒有任何一家因第 13 步被判為「未完成上架」。
7. **新表零外溢**：查詢證明 `accommodation_onboarding_steps` 僅被引導頁讀寫，訂單／計價／庫存／分潤路徑無任何引用。
8. 過關後**不自動 Publish**，等裁示。
