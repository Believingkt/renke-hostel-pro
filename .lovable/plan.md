# 一般訂房通知信箱（新）＋通知信箱架構整理 — 唯讀調查與設計稿

狀態：僅調查與設計，未施工。未建立／未執行任何 migration，未修改任何檔案或資料。
（上架引導 A–F 那批已暫停，等本案欄位定案後再回頭定案第 13 步。）

---

## 第一部分：唯讀調查結果（附證據）

### 1. `accommodation_notification_settings` 完整欄位

建表 migration：`supabase/migrations/20260822053810_d9607c28-037a-4e34-842c-ebb2b383da5a.sql:1-9`

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `accommodation_id` | uuid NOT NULL **UNIQUE** | FK → `accommodation_info(id)` ON DELETE CASCADE |
| `booking_notification_emails` | `text[]` NOT NULL DEFAULT `'{}'` | 唯一的收件人欄位 |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | 有 updated_at trigger |

欄位就這五個，沒有任何「一般訂房 vs 團購」的區分欄位。型別檔同步佐證：`src/integrations/supabase/types.ts:879-909`。

關鍵事實：**同一個 migration 檔同時建立了 `accommodation_notification_settings` 與 `group_buy_campaign_notification_settings`（同檔 line 34 起），且 `group_buy_campaign_notification_settings` 的 RLS 全部以 `group_buy_campaigns` 做權限判定。** 也就是說這張「民宿層」表從出生第一天起就是團購那條路徑的 fallback 層，不是先為一般訂房設計、後來被團購借用。

RLS（同檔 line 14-30）：SELECT/INSERT/UPDATE/DELETE 皆為 `is_admin_or_super() OR is_hotel_admin_of(accommodation_id)`。

資料現況（即時查詢）：`accommodation_notification_settings` **0 列**（15 間館別全空）；`group_buy_campaign_notification_settings` 1 列且有收件人；`suppressed_emails` 0 列。→ 目前正式環境「民宿端通知信」實際上一封都沒在寄。

### 2. `_shared/notifyRecipients.ts` 完整邏輯

檔案 70 行，兩個 export：

- `normalizeEmails(list)`（line 7-16）：`String().trim().toLowerCase()` → 過濾空值／長度 >254／不符 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → 去重 → `slice(0, 10)`。
- `resolveOrderNotifyEmails(admin, { accommodationId, campaignId })`（line 22-70），解析順序：
  1. 有 `campaignId` → 讀 `group_buy_campaign_notification_settings.notification_emails`，正規化後若非空即採用，`source = "campaign"`（line 31-41）。
  2. 上一步為空且有 `accommodationId` → 讀 `accommodation_notification_settings.booking_notification_emails`，非空即採用，`source = "accommodation"`（line 43-54）。
  3. **兩者不合併**（檔頭註解 line 19 明寫）。
  4. 最後以 `suppressed_emails` 過濾退信名單（line 56-63）。
  5. 任何例外 → 回傳 `{ emails: [], source: "none" }`，永不 throw（line 64-67）。

呼叫端（全部 5 支、100% 團購）：
- `group-buy-create-order/index.ts:173`
- `group-buy-resend-notification/index.ts:243`
- `group-buy-order-lookup/index.ts:145 / 490 / 595`
- `_shared/groupBuyCreditCompletion.ts:197`

**`send-order-confirmation` 從未 import 這支模組。**

### 3. `send-order-confirmation/index.ts` 收件人組成脈絡

- 收件人 `built.to` 由 `_shared/orderConfirmationEmail.ts` 的 `buildOrderConfirmationEmail()` 產生，來源是訂單本身的 `guest_email`；缺 email 回 `no_email`（`index.ts:94-102`）。
- 實際寄送 `index.ts:116-128`：`to: [built.to]`，`from: "人客多通知 <noreply@lakeze.com>"`，**沒有 cc、沒有 bcc、沒有 reply_to**。
- 團購訂單在 `index.ts:80-83` 直接 return，不寄共用確認信。
- 權限：service_role 呼叫直接放行；帶使用者 JWT 時比對 `guest_email`（`index.ts:66-92`）。
- 限流：`rateMap`，同一訂單 60 秒最多 3 封（`index.ts:17-32, 60-62`）。注意這是 **per-instance in-memory**，多實例不共用。

**觸發點共 4 類**（加 bcc 的重複寄送風險就在這裡）：
1. `_shared/sendBookingEmail.ts:78` — 所有付款方式（信用卡／3DS／LINE Pay／ATM）的自動寄信總入口，由 `create-paid-order:404`、`complete-3ds-booking:441`、`tappay-notify:529`、`tappay-atm-create:335`、`create-card-bound-order:317`、`admin-resend-booking-email:103`、`notify-booking-confirmation:23` 呼叫。
2. `change-order-dates/index.ts:298` — 管理端改期後重寄。
3. `member-order-manage/index.ts:586` — 會員自行改期後重寄。
4. `src/pages/MemberOrderDetail.tsx:735` — 會員在訂單詳情頁手動按「重新傳送信件」。

風險評估：
- **對客人收信邏輯零影響**：Resend 的 `bcc` 是獨立欄位，`to` 陣列不變、信件內容不變。
- **重複寄送風險：有，且不可忽略。** 上面 2/3/4 每次都會重跑整支函式，若無條件加 bcc，民宿端會在每次改期、每次會員手動重寄時都收到一封完整客人版確認信（含遮罩前的訂單細節）。第 4 點是會員可自行無限觸發的（僅受 60 秒 3 封限流保護）。
- **既有邏輯混用風險：有一處。** `_shared/sendBookingEmail.ts:41-45` 與 `send-order-confirmation:80-83` 兩層都擋掉 `order_source = 'group_buy'`，所以新欄位若走這條路徑，天然不會碰到團購；但若未來有人把新欄位塞進 `resolveOrderNotifyEmails`，就會和團購 fallback 混在一起——設計上必須明確禁止。
- `booking_email_log` 表存在（`types.ts:2161`，有 `order_id`、`email_type`），可作為民宿副本的去重依據，目前 `send-order-confirmation` 未寫入。

### 4. `?tab=email-notification` 頁面現況

入口：`src/config/adminMenu.ts:93` 「訂房確認通知」→ `/admin/website-content?tab=email-notification`。
內容在 `src/pages/WebsiteContent.tsx:4280-4430`，左欄由上到下：

1. `PageHeader「訂房確認通知」`（:4281）
2. Card「⚠️ 重要提醒」— 信件內容（:4285）
3. Card「📞 聯絡方式」— 電話／LINE／Email／客服時間，信件內容（:4313）
4. Card「🏦 入住押金提醒」— 開關＋標題＋內容，信件內容（:4376）
5. **`<BookingNotificationEmailsCard />`（:4417）— 唯一的收件人設定，卻是團購專用**
6. `SaveButtonContainer`（:4419）— 只儲存 1–4，卡 5 有自己的儲存按鈕
右欄：`BookingConfirmationEmailPreview`（sticky 即時預覽）。

→ 混淆確認：整頁四張卡有三張在講「信件長什麼樣」，第四張在講「寄給誰」，而且那個「誰」其實只服務團購。卡片本身有小字免責（`BookingNotificationEmailsCard.tsx:66, 74`），但標題「📥 訂房通知」＋頁面標題「訂房確認通知」的脈絡壓過小字。另有兩套儲存按鈕語意不一致。

`HeaderFooterSection.tsx:359/366/373` 有三處 `goToTab('email-notification')` 的跳轉入口。

### 5. 團購「通知設定」tab 資料流

`src/pages/AdminGroupBuy.tsx:1186`（TabsTrigger）→ `:1194-1196`（TabsContent）→ `<GroupBuyNotificationSettings campaignId={activeId} accommodationId={accommodationId} />`。

元件 `src/components/admin/GroupBuyNotificationSettings.tsx`：
- 讀民宿層 fallback（:28-32）與活動層覆寫（:42-48）
- `override` 開關＝活動層陣列是否非空（:52）
- 存檔走 `writeWithRowCheck` upsert `group_buy_campaign_notification_settings`（:74-80）；關閉 override 即存空陣列＝回退民宿層
- 面板明確顯示「目前實際收件人（來源：…）」（:101-124）

寄送端：`group-buy-create-order/index.ts:173-216` 取得 `venueEmails` 後以 `sendGroupBuyEmail` 寄團購專屬模板 `renderVenueNewOrder`，並寫 `group_buy_payment_events` 稽核。**與 `send-order-confirmation` 完全不同的函式、模板與表。**

→ 結論：只要新欄位不被塞進 `resolveOrderNotifyEmails`，兩者在程式層完全獨立、互不影響。

### 6. 新欄位需不需要支援多收件人

需要，**應比照團購用 `text[]` 陣列**。理由：現成的 `NotificationEmailListField.tsx` 與 `src/lib/notificationEmails.ts`（`MAX_NOTIFICATION_EMAILS = 10`、`normalizeNotificationEmails`、`validateNotificationEmails`）已是共用元件，後端 `normalizeEmails` 規則與前端同語意；改單一 string 反而要另寫一套。實務上民宿常需要「老闆＋櫃檯＋管家」多人同時收。

---

## 第二部分：設計稿

### A. 資料架構方案（二選一）

**方案 A1：在現有表新增獨立欄位（建議）**

```
accommodation_notification_settings
  + booking_confirmation_emails  text[]  NOT NULL DEFAULT '{}'
```
既有 `booking_notification_emails` 原封不動，僅在後台改標示為「團購通知信箱」。

- 優點：一間館別一列（既有 UNIQUE 約束），一次查詢拿到兩種設定；RLS/GRANT/updated_at trigger 全部沿用，不需新增任何 policy；`resolveOrderNotifyEmails` 一行都不用改（它只 select 舊欄位）；新舊欄位在 DB 層物理分離，不可能互相覆寫。
- 缺點：表名 `accommodation_notification_settings` 仍是通用名，兩種用途同表；語意靠欄位名與 UI 分區承擔。
- 風險：極低。新增欄位有 DEFAULT，不影響既有 0 列資料與任何既有查詢。

**方案 A2：新建獨立表 `accommodation_booking_notification_settings`**

- 優點：表名即語意，徹底物理隔離。
- 缺點：要新寫一整組 RLS（4 條 policy）＋GRANT＋trigger；多一次查詢；`accommodation_notification_settings` 這個「通用名卻只服務團購」的錯名仍然留著，架構混亂只是換位置；未來兩張幾乎一樣的表更容易被誤用。
- 真要徹底，正解其實是「把舊表改名為 `group_buy_*`」，但那會動到 4 支已上線團購函式，本案明確不碰。

**評估結論：A1 對解決混亂比較徹底，因為真正的混亂來源是 UI 標籤與頁面位置，不是表結構**；A2 付出 schema 成本卻沒消除錯名。建議 A1，搭配 B 節的頁面拆分。

（migration SQL 草稿等你選定方案後再出，本次不建立、不執行。）

### B. 畫面重新設計

**B-1 `?tab=email-notification` 改為兩塊、標題改名**

- 側邊欄 `adminMenu.ts:93` 「訂房確認通知」→ 建議改為「**訂房確認信**」（強調是信）。
- 頁面分成兩個明確區塊，中間有分隔與說明：
  - 區塊一「**這封信長什麼樣**」：重要提醒／聯絡方式／押金提醒＋右側即時預覽（＝現有 1–4 卡，內容一行不改）。
  - 區塊二「**這封信要寄給誰**」：新卡 `BookingConfirmationRecipientsCard`，寫入 `booking_confirmation_emails`。文案明說「客人一定會收到，這裡填的是民宿端要不要也收一份副本；留空＝只寄給客人」。
- **`BookingNotificationEmailsCard`（團購那張）從此頁移除。**

**B-2 團購那張卡移到 AdminGroupBuy**

搬到 `AdminGroupBuy.tsx` 的「通知設定」tab（:1194），放在 `GroupBuyNotificationSettings` 上方，標題改「團購通知信箱（民宿預設）」。這樣「民宿預設」與「活動覆寫」上下相鄰，來源關係一眼看懂，也不再出現在訂房確認信頁面誤導老闆。
元件檔建議重新命名為 `GroupBuyVenueNotificationEmailsCard.tsx`，寫入邏輯（表名、欄位、upsert）**byte-for-byte 不變**。

**B-3 過渡防呆**

`GroupBuyNotificationSettings` 的「目前實際收件人」面板文案加一句「此設定僅用於團購」。舊頁面若有人以書籤直達，仍能正常到達新位置（tab 名不變）。

### C. 新欄位如何安全接進 `send-order-confirmation`

**採「同一封信加 bcc」而非另外寄一封**（Resend 單次 API call 即可，不增加寄送次數、不需新模板）。

具體改動（僅 `send-order-confirmation/index.ts`）：

1. 在 `buildOrderConfirmationEmail` 成功後、`fetch` 之前，以 service role 讀 `orders.accommodation_id` → 查 `accommodation_notification_settings.booking_confirmation_emails`，經與 `notifyRecipients.normalizeEmails` 同語意的正規化＋`suppressed_emails` 過濾。
2. **不呼叫 `resolveOrderNotifyEmails`**，避免與團購 fallback 鏈混用；新增一支 `resolveBookingConfirmationBccEmails()`，只讀新欄位、無 campaign fallback。
3. 只有在 `triggerSource === "auto"`（首次成交自動寄信）時才帶 bcc。`date_change` / `member_date_change` / 會員手動重寄一律不帶 bcc，直接消除「每次重寄都轟炸民宿」的風險。**若你希望改期也通知民宿，請明講，我會改成白名單 `["auto","date_change"]`。**
4. 額外去重：寄出後寫 `booking_email_log`（`order_id`, `email_type='booking_confirmation_venue_bcc'`），同訂單已有紀錄則不再帶 bcc。
5. 任一步失敗（查不到設定、正規化後為空、寫 log 失敗）一律 **靜默降級為只寄客人**，絕不阻斷客人收信；錯誤只進 `console.error`。
6. `preview === true` 路徑不受影響；團購 early return（:80-83）在 bcc 邏輯之前，順序不變。

對現有客人收信邏輯的影響：`to`、`subject`、`html`、`from`、限流、權限判定全部不變；`built.to` 組成不變。信件內容即客人版，含訂單完整資訊——**請確認民宿端收客人版副本可接受**，若不可接受要改成另寄精簡的民宿版模板（工作量較大，本設計未含）。

回歸測試（新增，不改既有）：
- 未設定新欄位 → Resend payload 無 `bcc` 鍵，且 `to` 不變
- 設定 3 筆 → `bcc` 恰為 3 筆、lowercase、去重、排除 suppressed
- `triggerSource = date_change` / 會員手動重寄 → 無 `bcc`
- `order_source = group_buy` → 仍在 :80-83 return，完全不進 bcc 邏輯
- 同一訂單第二次 auto → 因 `booking_email_log` 去重而無 `bcc`
- 團購路徑 `resolveOrderNotifyEmails` 回傳值與呼叫次數不變（既有 5 個呼叫點快照測試）

### D. Postcheck 計畫（比照既有標準）

1. **保護檔 diff = 0**：`_shared/notifyRecipients.ts`、`_shared/sendBookingEmail.ts`、`_shared/orderConfirmationEmail.ts`、`group-buy-create-order/index.ts`、`group-buy-resend-notification/index.ts`、`group-buy-order-lookup/index.ts`、`_shared/groupBuyCreditCompletion.ts`、`GroupBuyNotificationSettings.tsx`（僅檔名搬移時附逐字 diff 證明寫入段不變）、所有 `/team`、所有分潤／退款／OTA 相關檔。附 md5 對照表。
2. **完整測試套件基準比對**：以施工前 commit `git archive` 實跑，與施工後逐項檔名比對，預期仍為既有 23 項固定失敗，不得新增。
3. **型別檢查**通過（`tsgo`）。
4. **正式環境真實寄信測試（不接受文字保證）**：
   - 在一間測試館別填入可收信的真實信箱，建立一筆真實訂單走完付款 → 附 Resend API HTTP 狀態、`send-order-confirmation` 函式日誌、**客人端與民宿端兩邊實際收到信的截圖**。
   - 對同一筆訂單按「重新傳送信件」→ 證明民宿端**沒有**再收到第二封。
   - 對同一筆訂單執行一次改期 → 證明客人收到改期信、民宿端未收到。
   - 一筆團購訂單 → 證明 `send-order-confirmation` 仍在 :80-83 return，團購民宿信仍由 `group-buy-*` 正常寄出。
   - 新欄位留空的館別 → 客人正常收信、無 bcc。
5. **資料佐證**：附施工前後 `accommodation_notification_settings` 欄位結構與列數對照、`booking_email_log` 新增列查詢結果。
6. 過關後 **不自動 Publish**，等你裁示。

---

## 需要你裁示的問題

1. 資料架構採 **A1（現有表加欄位）** 還是 A2（新建表）？
2. 民宿端副本用 **bcc 同一封客人版信**，還是要另寫民宿專屬精簡模板？
3. bcc 觸發範圍只限首次自動寄信，還是也要包含**改期**？（會員手動重寄建議一律排除）
4. 團購那張卡是否確認**整張搬到** AdminGroupBuy 通知設定 tab？
5. 側邊欄「訂房確認通知」是否改名為「訂房確認信」？
6. 新欄位對老闆是**必填**（上架引導第 13 步擋關）還是選填？
