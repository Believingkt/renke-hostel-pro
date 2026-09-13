# 新手業主上架引導流程 ＋ 後台入口整理（唯讀調查報告／設計稿，未施工）

全部重新核實，未沿用任何舊結論。以下皆附真實行號／查詢結果。

## 0. 風險規模（真實資料）

- `accommodation_info` 共 **15 間**（`is_active=false` 3 間：奧丁丁測試、旅行日-心齋之翼、旅行日-十一鳴）。
- 帳號：`user_roles` 中 `hotel_admin` 77 列／12 人、`staff` 82 列／24 人、`super_admin` 9 列／6 人。**`owner` 角色目前 0 列**。
- `accommodation_owners` 僅 3 間有資料（森山寫照、淞湘卉館、雲岫海景）。
- 近 90 天有訂單者 15 間全部有，最高雲岫 423 筆。→ 這不是空系統，任何導覽改動都在營運中系統上。

## 1. 新增一間民宿目前實際經過的路徑

| 步驟 | 誰 | 位置 |
|---|---|---|
| 建立館別（`accommodation_info` insert） | 總部 | `src/components/headquarters/AccommodationManagement.tsx:241`、`:579`；同時自動建 `booking_settings:284`、`about_section:296`、`location_info:303`、`pricing_templates:681`、`faqs:698`、`accommodation_facilities:715`、`room_amenities:749`、`addon_settings:769` |
| 建立／綁定管理帳號 | 總部 | `AccommodationManagement.tsx:270`（寫 `user_roles`）、`AccommodationOwnersManagement.tsx:145`（寫 `accommodation_owners`） |
| 付款／訂金／押金／退款級距 | 總部 | `src/components/headquarters/AccommodationDialog.tsx:251-330`（`deposit_percentage`、`security_deposit_amount`、`manual_refund_fee_amount`、`free_cancel_days`、`payment_methods`） |
| 合作條件／分潤 | 總部 | `/hq/bonus-settings` → `src/components/team/BonusSettingsTab.tsx:1349,1470,2004` |
| 之後老闆自行操作 | 老闆 | `/admin/*`（見第 2 節） |

路由總表：`/admin/*` 共 40+ 條，定義於 `src/App.tsx:443-697`；`/hq/*` 定義於 `src/App.tsx:731-846`。

## 2. 13（實為 14）項設定 → 資料表／欄位／寫入點

所有寫入皆為前端 supabase client 直寫，**沒有 RPC／Edge Function**（唯一例外：清除模板日期覆蓋 `PricingTemplateManager.tsx:788`）。

1. 基本資料 → `accommodation_info`（name/description/hero_*/og_*/social）— `src/pages/WebsiteContent.tsx:2364`
2. 介紹與照片 → `about_section`、`about_features`、`accommodation_photos` — `WebsiteContent.tsx:3112`、`3158`、`2650/2693/2707`
3. 設施 → `accommodation_facilities`（category/facility_name/room_scope）— `WebsiteContent.tsx:1443`
4. 房型與照片 → `room_types`、`room_photos` — `src/components/RoomTypeForm.tsx:354-416`
5. 入住人數 → `room_types.capacity`、`room_count` — `RoomTypeForm.tsx:333`
6. 房價 → `pricing_templates`（weekday/weekend/peak_price、room_type_ids）— `src/components/PricingTemplateManager.tsx:683-696`。`room_types.base_price` 被硬寫 0（`RoomTypeForm.tsx:333`）；`pricing_rules` 表全 src 無引用＝疑似遺留。
7. 庫存與開放日 → `room_inventory_pricing`（date/price/available_rooms/is_available）— `InventoryManagement.tsx:300-502`（註：該檔無 import 端，實際走 `/admin/room-price-calendar`）、模板套用 `PricingTemplateManager.tsx:450-565`
8. 訂房方案 → `accommodation_packages` — `src/pages/AdminPackages.tsx:532`
9. 前台顯示價格 → `package_date_prices` — `src/pages/PackagePriceCalendar.tsx:170-263`
10. 付款方式 → `booking_settings.payment_methods` — `WebsiteContent.tsx:1531`
11. 訂金比例 → `booking_settings.deposit_percentage`/`use_deposit` — **只有** `AccommodationDialog.tsx:413`（總部）
12. 入住押金 → `booking_settings.security_deposit_amount` — **只有** `AccommodationDialog.tsx:288`（總部）
13. 取消退款政策 → `booking_settings.cancellation_policy`/`free_cancel_days`/`pet_policy`/`other_notes` — `WebsiteContent.tsx:1531`（政策文字，老闆）＋`AccommodationDialog.tsx`（天數，總部）→ **同一件事被切成兩處**
14. 通知設定 → (a) `accommodation_info.email_*` `WebsiteContent.tsx:1741`；(b) `accommodation_notification_settings.booking_notification_emails` `src/components/admin/BookingNotificationEmailsCard.tsx:44`。**實測 15 間全部 0 筆**（無人設定過收件信箱）。

## 3. 依賴順序（實際外鍵／欄位參照）

```text
總部：建館別 → 建帳號/權限 → 付款/訂金/押金/退款天數 → 合作條件
                    ↓
老闆：1 基本資料 ─┬→ 2 介紹照片   3 設施   14 通知
                  └→ 4 房型(+5 人數) → 6 房價模板(room_type_ids)
                                        ├→ 7 庫存(room_inventory_pricing.room_type_id)
                                        └→ 8 訂房方案(room_type_ids) → 9 前台價格(package_id)
                                                                       13 政策文字
                                                                       15 上架前檢查
```
硬依賴：6/7/8 都以 `room_type_id(s)` 為外鍵，**必須先有房型**；9 以 `package_id` 為外鍵，必須先有方案。

## 4. 總部 vs 老闆（依據 RLS，實查 `pg_policies`）

- `accommodation_info` INSERT／DELETE：**僅 `super_admin`**；UPDATE：`super_admin | hotel_admin | staff_can_edit_module('website_content')`。
- `room_types`：`super_admin | hotel_admin | staff_can_edit_module('pricing')`。
- `accommodation_packages`／`pricing_templates`／`room_inventory_pricing`：`..._module('room_price')`。
- `booking_settings` UPDATE：`..._module('website_content')` → **老闆技術上改得動訂金／押金，只是前台 UI 沒開**。
- `accommodation_owners`：`hotel_admin`（自館）或 `super_admin`。
→ 結論：只有「建館別」在 DB 層真的是總部專屬；訂金／押金／合作條件是 **UI 層** 才擋住，不是 RLS。

## 5. 缺什麼會真的賣不出去

**硬擋（程式層）**：無房型／無 `room_inventory_pricing` 資料 → `all-availability` 回傳無可訂日期；方案 `enabled=false` → `groupBuyBooking.ts:199` 直接拒絕；`allow_credit_card_payment=false` → `BookingFlow.tsx:840` 收掉刷卡。
**只是畫面難看**：照片、設施、about、FAQ、政策文字缺 → 只影響顯示，不擋下單。
**重要缺口**：`is_active=false` **不擋下單**。`all-availability/index.ts:91-94` 查 `accommodation_info` 時沒有 `is_active` 過濾；`BookingVilla.tsx`、`BookingFlow.tsx:833`、`create-paid-order`、`process-tappay-payment` 全都不檢查。停用館別只會從搜尋列表消失，直接連結仍可完成付款。

## 6. `is_active` 完整語意

`boolean NOT NULL DEFAULT true`（`20251217122107_*.sql:1-9`，註解寫 "can accept bookings"）。**純手動**，唯一寫入點 `AccommodationManagement.tsx:400-404` 的啟用/停用對話框，無 trigger／cron／衍生邏輯。
其他狀態欄位：`show_on_portal`（`20260809031213`，只控前台列表與 `noIndex`，`BookingVilla.tsx:882`）、`display_order`、9 個 `show_*_section` 版面開關、`bundled_lock_inventory`、`package_inventory_as_one`、`allow_credit_card_payment`、`charge_card_immediately`。
**沒有任何審核／草稿／published 狀態欄位。**
既有完成度邏輯只有 `use-settings-completeness.tsx` + `src/lib/settingsCompleteness/*`，檢查的是總部財務面（結算費率、合作期間、獎金級距），**完全不檢查可販售性**。

## 7. 重複／易混淆入口

1. `booking_settings` 同一列被兩處寫：`WebsiteContent.tsx:1531`（政策/付款方式）與 `AccommodationDialog.tsx:251-330`（訂金/押金/退款天數/LINE Pay），兩邊都碰 `payment_methods` → 有互相覆蓋風險。
2. `pricing_templates` 三處寫：建館種子 `AccommodationManagement.tsx:673`、`OwlTingAccommodationConfig.tsx:112,213`、`PricingTemplateManager.tsx:683`。
3. 房價相關入口散在「房型設施」與「房價庫存」兩個選單群：`/admin/pricing`、`/admin/projects`、`/admin/room-price-calendar`、`/admin/packages`、`/admin/package-price-calendar`、`/admin/search-card` 六個。
4. 側邊欄外孤兒路由（`adminMenu.ts` 沒列但可直達）：`/admin/faq`、`/admin/public-holidays`（與 `/admin/holidays` 重複）、`/admin/user-roles`（與 `/admin/accounts` 重複）、`/admin/permission-templates`、`/admin/notifications`、`/admin/analytics`（側欄「營運分析」指向 `/admin` 而非此路徑）、`/admin/backup`、`/admin/packages-preview`、`/admin/email-test`、`/admin/email-preview`、`/admin/owlting-email-ingest`、`/admin/owner-settlement/settings`，另 12 條已改成 `MovedToHQCard` 的殘留 stub。
5. 死碼：`src/components/InventoryManagement.tsx` 無任何 import；`src/pages/hq/HQGoogleBusinessProfile.tsx` 未掛路由。

## 8. 與既有禁區的交集

| 禁區 | 交集 | 處理原則 |
|---|---|---|
| 房型邏輯／房價計算／庫存關房／訂房方案 | **有**（步驟 4-9 只讀其狀態做完成度判定） | 只讀、只導連結，不改任何寫入邏輯 |
| 付款與退款 | **有**（步驟 10-13 讀 `booking_settings`） | 只讀 |
| 訂單流程／OTA 補單／/team／獎金分潤／cron | 無 | 完全不碰 |
| 權限與館別隔離 | **有**（引導頁需判定總部 vs 老闆） | 沿用 `useStaffPermissions` 與既有 RLS，不新增/修改 policy |
| 通知 | 部分（步驟 14 只讀 `accommodation_notification_settings` 是否為空） | 不改寄送邏輯 |

## 9. 可參考的「開賣後鎖定」既有模式

- `src/lib/commissionBaseAccess.ts:44-59` + trigger `enforce_order_meta_commission_fields()`：一旦歸屬確立即鎖定。
- `course_profit_month_locked()`（`20260901021659_*.sql:97-108`）：已付款月份鎖定。
- `can_fix_pricing_rule_date()` + `pricing_rule_min_month()`（`20260817075237_*.sql`）：生效日僅特定角色可修正，且不得早於合作起始月。
- `addon_settings.is_locked`（`20260731063541_*.sql:3`）＋ `BookingFlow.tsx:4058` ＋ `validate-order-prices/index.ts:481`：前後端雙重鎖。

## 10. 老闆登入後看到什麼

`src/pages/Auth.tsx:32-40` `getAdminPath()` **完全沒有角色分支**，只看 URL alias／`?next=`；`:84`、`:94`、`:279` 三處都 `navigate(getAdminPath())`。所有人（含 hotel_admin）一律落在 `/admin` = `Dashboard.tsx`。`/hq` 需另外走 `/hq-auth`（`App.tsx:731`）並由 `RequireHQRole`／`HQIndexGate` 守門。→ 新老闆第一眼是營運分析數字，沒有任何「下一步」指引。

## 11. 關鍵問題：現有資料表夠不夠表達「完成度」與「業主已確認」

**不夠。** 理由（皆為實測）：
- 「有資料」≠「老闆確認過」。`booking_settings` 建館時自動塞預設值（`cancellation_policy` 可 NULL 但 `free_cancel_days` 預設 14、`security_deposit_amount` 預設 5000、`deposit_percentage` 預設 30），所以無法用「欄位非空」判斷老闆是否真的看過並同意退款政策。
- 同理 `check_in_time='15:00'`、9 個 `show_*_section` 預設 true、`about_section` 15 間全部有 1 筆（都是建館種子），無法區分「種子值」與「老闆填的」。
- 沒有任何欄位記錄「誰在何時確認了第幾步」，也沒有 `updated_by`。
- 全庫查無 `onboard|setup|checklist|progress|wizard|guide` 相關資料表。

**因此提出（不自行建立，待裁示）**：新增一張輕量輔助表，例如 `accommodation_onboarding_steps(accommodation_id, step_key, status, confirmed_by, confirmed_at, note)`，純記錄 UI 引導狀態與業主主動確認，**不存任何訂房核心資料**，不被訂單／計價／庫存讀取。若不核准，退而求其次只能做「自動推導完成度（純讀既有表）」，缺點是取消政策、押金這類需要主動確認的項目只能顯示「已有預設值」而無法顯示「業主已確認」。

## 12. 修改範圍建議（僅設計）

**預計新增**：`src/pages/admin/Onboarding.tsx`（引導總覽＋15 步驟卡片）、`src/hooks/use-onboarding-progress.tsx`（純讀既有表推導）、`src/lib/onboarding/steps.ts`（步驟定義／依賴／導向連結／總部 vs 老闆標記）。
**預計小幅修改**：`src/config/adminMenu.ts`（新增一個「上架引導」入口＋整併重複入口）、`src/pages/Auth.tsx` 或 `Dashboard.tsx`（未完成時顯示引導橫幅；是否改登入導向另議）。
**完全不動**：`RoomTypeForm.tsx`、`PricingTemplateManager.tsx`、`InventoryManagement.tsx`、`AdminPackages.tsx`、`PackagePriceCalendar.tsx`、`RoomPriceCalendar.tsx`、`WebsiteContent.tsx` 的寫入邏輯、所有 `/team`、所有 Edge Function、所有 RLS／Trigger／cron。引導頁一律以連結導向既有頁面，不複製任何設定表單。

## 13. 需要你裁示的問題

1. **是否核准新增 `accommodation_onboarding_steps` 輔助表**？（不核准就只能做自動推導版，無「業主已確認」語意）
2. **`is_active` 不擋直接連結下單** 是刻意設計還是缺口？要不要在這批一併補（會動到販售路徑，屬禁區，需你明確授權）。
3. **訂金／押金／退款天數** RLS 上老闆改得動、UI 只有總部有。引導流程中這三項要標「請聯絡總部」，還是開放老闆自行設定？
4. **登入導向** 是否改成「未完成上架 → 導到引導頁；已完成 → 維持 `/admin`」？這會影響現有 12 位 hotel_admin 的既有習慣。
5. **後台入口整併** 範圍到哪：只清孤兒路由與死碼（低風險），還是連「房型設施／房價庫存」六個入口也重排（會改變現有使用者肌肉記憶）？
6. `accommodation_notification_settings` 15 間全 0 筆 —— 訂房通知信收件人從未設定，這算引導必填項嗎？
