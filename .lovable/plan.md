# 新手業主上架引導 —— 設計稿 A–F（僅設計，未施工、未建立任何資料庫物件）

依裁示：新表核准、`is_active` 缺口另批、登入導向不改（只加橫幅）、入口整併只清孤兒與死碼、訂金/押金/退款天數標「請聯絡總部」。

---

## E. 通知信現況查證（先回答第 6 點）

**結論：目前 15 家民宿端「訂房通知信」實際上完全沒有寄出，也沒有任何 global 預設或 fallback 收件人。**

證據：
- `accommodation_notification_settings` 實查 **0 筆**（全表）。
- 全 Edge Function 搜尋，讀取 `booking_notification_emails` 的只有 `supabase/functions/_shared/notifyRecipients.ts:43-54`。
- 而 `resolveOrderNotifyEmails()` 的呼叫端**只有團購四支**：`group-buy-create-order/index.ts:24`、`group-buy-resend-notification/index.ts:243`、`group-buy-order-lookup/index.ts:145,490`、`_shared/groupBuyCreditCompletion.ts:197`。
- 一般訂房主流程（`notify-booking-confirmation` → `_shared/sendBookingEmail.ts:78` → `send-order-confirmation/index.ts:124` `to: [built.to]`）**只寄給客人一位**，程式中沒有任何 bcc／cc／民宿端收件人，也沒有讀取任何通知設定表。
- `notifyRecipients.ts:26-27` 的 fallback 順序是「活動覆寫 → 民宿預設 → none」，兩者皆空就回 `source:"none"`，不會改寄他處。
- `email_send_log` 近 60 天只有 `magiclink / signup / recovery / pms_password_recovery` 四類（全是帳號信），**沒有任何訂房通知類紀錄**。
- 民宿端實際收到通知的管道是**站內通知**，不是 email：`notifications` 表近 30 天 652 筆（`new_order` 301、`payment` 162、`status_update` 122…），由 DB trigger `create_new_order_notification` 產生，Header 鈴鐺呈現。

### E-2 追加查證：這個欄位是共用，還是一般訂房有另一個被漏接的欄位？

**結論：不是漏接。`booking_notification_emails` 從建立當下就是為團購設計的，一般訂房從來沒有對應的民宿端 email 欄位存在過。**

**1. 原始設計意圖 —— 建表 migration 本身就是團購配對。**
`supabase/migrations/20260822053810_d9607c28-037a-4e34-842c-ebb2b383da5a.sql` **同一支 migration、同一個 commit（`9a2610ec4`，2026-08-22 05:38 UTC）** 一次建立兩張表：`accommodation_notification_settings`（民宿層預設）與 `group_buy_campaign_notification_settings`（活動層覆寫）。兩張表欄位結構完全對稱（`text[] NOT NULL DEFAULT '{}'`），RLS 也成對撰寫。該 commit 只動了兩個檔案：這支 migration 與自動產生的 `types.ts`，**沒有夾帶任何一般訂房相關程式**。同日 commit `b3b37a9d5` 建立 `_shared/notifyRecipients.ts`，其檔頭註解寫「解析順序：活動覆寫 → 民宿預設。兩者不合併。」——「活動」即團購 campaign，語意上民宿層的存在目的就是**當團購活動沒設定時的 fallback**，不是獨立的一般訂房機制。

現行 UI 文案也已明講（非我推測）：`src/components/admin/BookingNotificationEmailsCard.tsx:66` 寫「目前實際使用情境：團購新訂單、團購匯款回報」，`:74` 寫「一般訂房通知目前尚未啟用 Email，本設定暫供團購使用」。

**2. 有沒有另一個專給一般訂房、但完全沒被引用的欄位？沒有。**
掃描 `information_schema.columns` 全 public schema，欄位名含 `notif / notify / recipient / _emails` 的共 20 個，逐一比對：
- `accommodation_notification_settings.booking_notification_emails` — 團購用（如上）
- `group_buy_campaign_notification_settings.notification_emails` — 團購用
- `accommodation_owners.email` / `notify_priority` — **有被引用，但只用於 OwlTing 補單**：`owlting-change-notify/index.ts:97,101`、`owlting-fillup-remind/index.ts:144,148`、`owlting-fillup-issue/index.ts:177,181`，皆按 `notify_priority` 排序後寄給業主。與一般訂房確認信無關。
- `alert_recipients.notify_*`（6 欄）— 系統監控告警
- `performance_notification_*.notify_time` — 業績通報
- `booking_email_log.recipient` / `email_send_log.recipient_email` / `remarketing_sends.recipient` — 寄送紀錄，非設定
- `kol_profiles.cid_notified`、`owlting_email_parsed_staging.notified_at`、`scout_discount_code_payouts.recipient_*` — 不相關

**沒有任何一個「無程式碼引用」的一般訂房通知收件人欄位。** 亦即漏的不是「接線」，而是這個功能從未被實作。

**3. `accommodation_info.email_*` 的實際用途 —— 是信件內容欄位，不是收件人欄位。**
共 5 欄，全部有被讀取，全部是**塞進信件正文的文字**：
- `email_important_notice`（重要提醒）：`_shared/orderConfirmationEmail.ts:166,413-415`、`send-booking-confirmation/index.ts:150,157`、`preview-booking-confirmation/index.ts:141`
- `email_service_hours`（服務時間）：`send-booking-confirmation/index.ts:158`、`send-final-payment-received/index.ts:90,97`
- `email_show_security_deposit_notice` / `email_security_deposit_notice_title` / `email_security_deposit_notice`（押金說明區塊開關＋標題＋內文）：`orderConfirmationEmail.ts:514-522`
- 後台編輯入口：`src/pages/WebsiteContent.tsx:1242-1252`，預覽 `BookingConfirmationEmailPreview.tsx:81-84`

另有 `accommodation_info.email` 一欄，是**對外聯絡信箱**，在信件裡當「聯絡我們」顯示（`send-booking-confirmation/index.ts:354,364`），同樣不是收件人。

**因此設計稿 B 節第 13 步應拆成兩件不同的事**：
- 13a「信件內容設定」（`accommodation_info.email_*`）— 一般訂房確認信**真的會用到**，可列入引導、可判定完成度。
- 13b「訂房通知信箱」（`accommodation_notification_settings`）— 僅團購適用。

**待你裁示（選項已依上述證據調整）**：(a) 13b 列必填 —— 但除非另批改 `send-order-confirmation`（屬禁區），一般訂房仍不會寄給民宿；(b) 13a 列必填、13b 列選填並標「目前僅團購訂單通知使用」。我建議 (b)。

---

## A. `accommodation_onboarding_steps` migration SQL 草稿（僅供檢視，未執行）

```sql
CREATE TABLE public.accommodation_onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','not_applicable')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, step_key)
);

COMMENT ON TABLE public.accommodation_onboarding_steps IS
  '純 UI 引導狀態：記錄業主主動確認某上架步驟。不存訂房核心資料，訂單/計價/庫存/分潤邏輯一律不得讀取此表。';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_onboarding_steps TO authenticated;
GRANT ALL ON public.accommodation_onboarding_steps TO service_role;
-- 不授予 anon：前台不需要

ALTER TABLE public.accommodation_onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accommodation members can view onboarding steps"
  ON public.accommodation_onboarding_steps FOR SELECT TO authenticated
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Hotel admins can upsert onboarding steps"
  ON public.accommodation_onboarding_steps FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Hotel admins can update onboarding steps"
  ON public.accommodation_onboarding_steps FOR UPDATE TO authenticated
  USING (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
  WITH CHECK (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Super admins can delete onboarding steps"
  ON public.accommodation_onboarding_steps FOR DELETE TO authenticated
  USING (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role));

CREATE TRIGGER trg_onboarding_steps_updated_at
  BEFORE UPDATE ON public.accommodation_onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

沿用既有 helper（`user_has_access_to_accommodation`、`user_has_role`、`update_updated_at_column`），**不新增任何 SECURITY DEFINER 函式**。

---

## B. `Onboarding.tsx` 畫面設計與 15 步驟判定邏輯

### 版面
`AdminPageShell` + `AdminPageHeader`（沿用既有共用層，不手刻）。頂部一條總進度：`已完成 n / 15`，下方三個分組：
1. **總部準備（4 張，唯讀）** — 綠勾或「請聯絡總部處理」
2. **基本呈現（5 張）**
3. **開賣設定（6 張）**

每張卡片：步驟編號、標題、一句話說明、狀態徽章（已完成／未完成／請聯絡總部／不適用）、「前往設定」按鈕（`PreloadLink` 導向既有頁面，**不內嵌任何設定表單**）、被鎖住時顯示「需先完成第 X 步」。

### 判定邏輯（A＝純讀既有表自動推導；B＝讀新表 confirmed；C＝總部項，唯讀）

| # | 步驟 | 型 | 判定 | 導向 |
|---|---|---|---|---|
| 0a | 館別已建立 | C | `accommodation_info` 該列存在 | — |
| 0b | 管理帳號已建立 | C | `user_roles` 有該館 `hotel_admin` ≥1 | — |
| 0c | 付款／訂金／押金／退款天數 | C | `booking_settings` 有列 → 顯示目前值（訂金 %、押金、免費取消天數），標「請聯絡總部處理」 | — |
| 0d | 合作條件 | C | `accommodation_partnership_periods` 有涵蓋今日的列 | — |
| 1 | 民宿基本資料 | A | `name` 非空 **且** `description` 非空 **且** (`hero_main_title` 或 `og_title` 非空) | `/admin/website-content?tab=basic-info` |
| 2 | 介紹與照片 | A | `about_section.section_description` 非空 **且** `accommodation_photos` ≥3 | `?tab=basic-info` / `?tab=gallery` |
| 3 | 設施 | A | `accommodation_facilities` where `is_available` ≥1 | `?tab=facilities` |
| 4 | 房型與照片 | A | `room_types` ≥1 **且** 每個房型 `room_photos` ≥1 | `/admin/pricing?tab=rooms` |
| 5 | 入住人數 | A | 所有 `room_types.capacity > 0` 且 `room_count > 0` | `/admin/pricing?tab=rooms` |
| 6 | 房價設定 | A | `pricing_templates` ≥1 且其 `weekday_price > 0` 且 `room_type_ids` 非空 | `/admin/projects` |
| 7 | 庫存與開放日 | A | 未來 30 天內 `room_inventory_pricing` 有 `is_available=true 且 available_rooms>0` 的列 ≥1 | `/admin/room-price-calendar` |
| 8 | 訂房方案 | A | `accommodation_packages` where `enabled=true` ≥1 | `/admin/packages` |
| 9 | 前台顯示價格 | A | 未來 30 天內 `package_date_prices.sale_price > 0` ≥1，或方案本身 `sale_price > 0` | `/admin/package-price-calendar` |
| 10 | 付款方式 | A | `booking_settings.payment_methods` 陣列長度 ≥1 | `?tab=booking-info` |
| 11 | 取消與退款政策 | **B** | `cancellation_policy` 非空 **且** 新表 `step_key='cancellation_policy'` `status='confirmed'` | `?tab=booking-info` |
| 12 | 訂房須知／重要事項 | **B** | `other_notes` 或 `check_in_notice` 非空 **且** 新表 confirmed | `?tab=booking-info` |
| 13 | 通知設定 | A(+B) | `accommodation_notification_settings.booking_notification_emails` ≥1；依 E 節裁示決定是否必填 | `?tab=email-notification` |
| 14 | 上架前完整檢查 | **B** | 1–13 全綠 **且** 新表 `step_key='final_review'` confirmed | 本頁 |

**為什麼 11、12、14 必須用新表**：`booking_settings` 建館時就被塞入預設值（`free_cancel_days=14`、`security_deposit_amount=5000`、`deposit_percentage=30`、各 `*_section_title` 皆有預設），「欄位非空」無法區分種子值與業主真的看過並同意。這三項在卡片上提供一個「我已確認」勾選，寫入新表（`confirmed_by = auth.uid()`、`confirmed_at = now()`）。

**「請聯絡總部」呈現**：0c 三項（訂金比例／入住押金／退款天數）與 0a/0b/0d 一律灰底唯讀卡，顯示目前實際值 + 一行「此項由總部設定，如需調整請聯絡總部」+ 複製館別 ID 的小按鈕，**不提供任何編輯控制項**（維持現行 UI 限制，不動 RLS）。

---

## C. Dashboard 提醒橫幅

- 位置：`Dashboard.tsx` 最上方、現有統計卡之上。
- 顯示條件：`completed < 15` 且使用者具該館 `hotel_admin`/`super_admin`（staff 不顯示，避免誤導）。
- 內容：「上架進度 8/15 — 還有 7 項未完成，完成後才建議正式開賣」＋ 主按鈕「查看引導」→ `/admin/onboarding`。
- 15/15 時橫幅**自動消失**（純衍生狀態，不需手動關閉、不需額外欄位）。
- 提供「稍後再說」：僅 `localStorage` 記住當日不再顯示，**不寫資料庫**，隔日恢復。
- 不強制導頁、不攔截任何既有操作。

---

## D. 孤兒路由／死碼清理清單（逐條風險評估）

| 項目 | 現況 | 仍有連結？ | 建議 | 風險 |
|---|---|---|---|---|
| `/admin/public-holidays`（`App.tsx:627`） | 與 `/admin/holidays` 同頁 | 全 src **無任何連結** | 移除路由 | 極低 |
| `/admin/user-roles`（`:593`） | 與 `/admin/accounts` 功能重疊 | 全 src **無任何連結** | 移除路由 | 低（需先確認無人以書籤直達 → 建議改成 `<Navigate to="/admin/accounts" replace />` 而非直接刪） |
| `/admin/packages-preview`（`:533`） | 預覽頁 | **無連結** | 保留但加註，或改 Navigate | 低 |
| `/admin/analytics`（`:674`） | 側欄「營運分析」指向 `/admin` 而非此路徑 | **無連結** | 改 `<Navigate to="/admin" replace />` | 低 |
| `/admin/backup`（`:632`）、`/admin/email-test`（`:664`）、`/admin/email-preview`（`:669`） | 工具頁 | **無連結** | **保留**（維運用），僅在程式碼加註「內部工具，不列選單」 | 保留＝0 風險 |
| 12 條 `MovedToHQCard` stub（`:469-488, 574-619`） | 已搬 HQ 的告示頁 | 無選單連結 | **保留**（舊書籤的導引價值），列為刻意保留 | 刪掉才有風險 |
| `/admin/faq`（`:463`） | — | **有**：`EmptySectionPlaceholder.tsx:130 adminLink:"/admin/faq"` | **不可刪**，維持 | — |
| `/admin/permission-templates`（`:569`） | — | **有**：`Accounts.tsx:555`、`StaffPermissionsDialog.tsx:185` | **不可刪**，建議改列為 `/admin/accounts` 子項 | — |
| `/admin/notifications`（`:622`） | — | **有**：`Header.tsx:157` 鈴鐺 | **不可刪** | — |
| `/admin/owlting-email-ingest`（`:689`） | — | **有**：`OwlTingEmailStatsCards.tsx:225` | **不可刪** | — |
| `/admin/owner-settlement/settings`（`:647`） | — | **有**：`OwnerSettlement.tsx:715` | **不可刪** | — |
| `src/components/InventoryManagement.tsx` | 全 src 無 import | 無 | **不刪除**，僅加檔頭註記「未掛載，勿再引用」 | 直接刪有誤判風險，先標註最安全 |
| `src/pages/hq/HQGoogleBusinessProfile.tsx` | 未掛路由（只掛 Retired 版） | 無 | 同上，僅加註 | 低 |

淨結果：**實際移除/改 Navigate 僅 4 條**（public-holidays、user-roles、packages-preview、analytics），其餘一律保留或僅加註。「房型設施／房價庫存」六個入口**完全不動**（依裁示）。

---

## F. Postcheck 計畫（比照前批標準）

1. **保護檔 diff=0** 清單：`src/pages/BookingFlow.tsx`、`BookingVilla.tsx`、`BookingPortal.tsx`、`RoomTypeForm.tsx`、`PricingTemplateManager.tsx`、`AdminPackages.tsx`、`PackagePriceCalendar.tsx`、`RoomPriceCalendar.tsx`、`WebsiteContent.tsx`、`src/config/adminMenu.ts` 的既有 13 個選單項（僅允許新增一項）、`src/pages/team/**`、`supabase/functions/**` 全數、所有既有 migration。施工前記 md5，完工後逐檔比對。
2. **完整測試套件基準比對**：以施工前 commit `git archive` 跑一次，與完工版逐項檔名比對；既有 23 項固定失敗必須「完全相同」，新增測試須全綠。
3. **新增測試**：15 步驟判定純函式單元測試（含「種子預設值不得算完成」的反向案例）、引導頁在 staff 權限下不顯示總部項、橫幅在 15/15 時不渲染。
4. **RLS 驗證**：以非該館帳號讀寫 `accommodation_onboarding_steps` 應被拒；staff 不得寫入；附實際查詢輸出。
5. **邊界驗證（重點）**：全 repo 搜尋 `accommodation_onboarding_steps`，確認**只有引導頁與其 hook 引用**，訂單／計價／庫存／分潤／Edge Function 零引用，附搜尋結果。
6. **正式環境實測**：以真實館別（建議天送幸福和苑 = 未完成度高、雲岫 = 完成度高）各開一次引導頁，附完成度截圖與每張卡片判定結果對照 DB 實際筆數。
7. **回歸**：確認 `/admin` Dashboard、側邊欄既有 13 項、`/admin/holidays`、`/admin/accounts`、Header 鈴鐺、`OwnerSettlement` 設定連結皆正常。
8. 完工後**不自動 Publish**，等你裁示。

---

## 待你裁示

1. **E 節**：通知信箱要列必填（但實際不會寄出，需另批改 `send-order-confirmation`）還是列選填並註明「目前僅團購使用」？
2. **D 節**：`/admin/user-roles`、`/admin/public-holidays` 要「直接移除」還是「改 Navigate 轉址」？我建議後者。
3. **B 節第 7、9 步**的「未來 30 天」門檻是否合適，還是要改成「未來 90 天」或「至少 N 天有庫存」？
4. 引導頁入口要放在側邊欄**最上方**（第一項，最顯眼）還是**帳號管理旁**（較不干擾現有順序）？
