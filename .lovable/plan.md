# 方案 A：一般訂房 TapPay 獨立測試專案｜建置清單

本輪 0 施工。以下全部為唯讀盤點結果與建置規劃。

---

## A. 測試專案所需元件

| 元件 | 來源 | 可自動重建 | 需人工 |
|---|---|---|---|
| 前端程式碼 | 本 repo（同一份） | ✅ 複製專案 | — |
| 後端專案（Cloud/Supabase） | 全新 | — | ✅ 需建立**第二個 Lovable 專案並啟用其自己的 Cloud 後端**（本專案無法在同一 project 下開第二個後端） |
| DB schema | `supabase/migrations`（813 檔） | ✅ | 少數缺口見 C |
| Edge Functions | `supabase/functions`（156 支） | ✅ 隨新專案自動部署 | — |
| Storage buckets | 現有 9 個：room-photos / logos / backups / og-images / custom-sections / transfer-receipts / email-assets / member-avatars / ai-assets | ❌ 不在 migration | ✅ 手動建立（訂房只需 room-photos、logos、og-images） |
| Auth 設定 | — | ❌ | ✅ 手動（第一階段只用 Guest，可最小化） |
| Secret（43 組） | — | ❌ | ✅ 手動，只補測試必需的少數 |
| Cron（22 個 job） | 6 個 migration 內含 `cron.schedule`，其餘為線上手動建立 | 部分 | ✅ 見 L |
| RLS / policies（664 條）、functions（178）、triggers（195） | migration | ✅ | — |
| extensions | migration 內有 uuid-ossp / pgcrypto / pg_net / pgmq / pg_cron / supabase_vault | ✅ | pg_stat_statements 由平台預設 |

---

## B. Schema 可否完全靠 migrations 重建

**大致可以。** 比對結果：線上 public schema 有 **230 張表**，migration 檔中出現的 CREATE TABLE 名稱去重後 **231 個**（含 1 個已刪表殘留）。表層級覆蓋率視為 100%。
function 178、trigger 195、policy 664 亦均以 migration 累積產生。

但「可重建」不等於「重建後與線上完全一致」——長期以 migration 疊代的專案常有線上手改殘留，建議建置後執行 C 的差異驗證，而不是預設相等。

---

## C. 缺失 / 需人工補的部分

1. **Storage buckets 與其 policy**：`storage.buckets` 的建立不在 migration（平台限制），需手動建 bucket，`storage.objects` 的 policy 才會生效。
2. **Cron jobs**：線上 22 個，只有 6 個 migration 帶 `cron.schedule`；其餘（如 `daily-auto-backup`、`send-daily-performance`、`sync-meta-ad-*`、`push-checkin-reminders`）是線上建立，migration 重建後不會有——**這對測試環境反而是好事**。
3. **cron 內硬編正式 functions URL**：6 個 cron migration 全部寫死 `https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/...`。若直接套 migration，**測試環境的 cron 會去打正式 Edge Function**。⚠️ 最高風險項，見 O。
4. **資料型 migration**：部分 migration 內含正式資料（例：`20260821161153`、`20260821163750` 寫入正式館別 room-photos 絕對 URL）。套用時會塞入不存在的圖檔連結，無害但需知悉。
5. **Auth providers / email templates / SMTP**：完全不在 migration。
6. **Vault secrets**（`email_infra` 用到 supabase_vault）：需重新建立。
7. **schema 差異驗證方法**（建置後執行）：比對測試 vs 正式的 `information_schema.tables`、`pg_proc`、`pg_trigger`、`pg_policies` 數量與名稱清單，列出 diff 再逐項補。

**不採用正式 DB dump**：正式庫含旅客個資與真實交易，符合你的指示，只走 migration 重建。

---

## D. 測試資料最小集合（一般訂房 E2E）

必要：
- `accommodation_info` × 1（測試館，`is_active=true`，alias 自訂）
- `booking_settings`（訂金模式 / `deposit_percentage` / 付款方式開關）
- `room_types` × 1–2
- `room_units`（若該館用房間單元制）
- `room_inventory_pricing`（日期區間庫存＋價格）
- `pricing_templates` + `pricing_rules`（若測價格模板路徑）
- `public_holidays`（平日／假日價驗證）

選用：
- `accommodation_packages` + `package_date_prices`（測套餐）
- `addon_settings` / `addon_sales`（測加購）
- `discount_codes`（測折扣，第一階段建議不建）

流程自動產生（不需預建）：
`orders`、`order_rooms`、`order_meta`、`customers`、`pending_paid_order_drafts`、`tappay_webhook_events`、`payment_status_history`、`deposit_charges`。

會員 E2E（第二階段）才需要 `platform_members` / `member_*`。

---

## E. Sandbox Secret 清單（同名、測試值）

必要：
- `TAPPAY_ENV = sandbox`
- `TAPPAY_APP_ID`
- `TAPPAY_APP_KEY`
- `TAPPAY_PARTNER_KEY`
- `TAPPAY_MERCHANT_ID`（Sandbox 信用卡商店）

ATM 測試才需要：
- `TAPPAY_ATM_MERCHANT_ID`（未設會 fallback 到信用卡 merchant）
- `TAPPAY_ATM_MAX_AMOUNT`（選用；**正式目前也未設定**，程式 fallback 30000）

Webhook：
- `TAPPAY_WEBHOOK_SECRET`（`tappay-payment-webhook` 未設則不驗來源；`tappay-refund-notify` 未設會 503 → 要測退款通知就必須設，且值必須與正式不同）

其他讓流程跑完的非 TapPay Secret：
- `RESEND_API_KEY`（訂房確認信；不設則寄信步驟失敗但訂單仍成立）
- 明確**不要**設定：`OWLTING_PUSH_MODE`、`HOTELNABE_*`、`RAGIC_API_KEY`、`LINE_*`、`PLATFORM_MASTER_*`、`EXTERNAL_BOOKING_*`、`TAIWAN_TRAVELMAP_*`、`STATIC_IP_PROXY_*`、`APNS_*`、`FACEBOOK_*`。

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` 由新專案自動注入 → callback URL 自動指向測試環境。

不建立 `TAPPAY_SANDBOX_*` 平行命名（依你的指示）。

---

## F. 環境硬編位置完整清單（HEAD 重新確認）

**硬編 production TapPay（不隨 `TAPPAY_ENV` 切換）— 僅 2 處，與前次結論一致：**

1. `supabase/functions/complete-3ds-booking/index.ts:81`
   `await fetch("https://prod.tappaysdk.com/tpc/transaction/query", {`
2. `supabase/functions/tappay-query/index.ts:100`
   `const response = await fetch("https://prod.tappaysdk.com/tpc/transaction/query", {`

**應改法**（本輪不改）：改為沿用既有共用 helper `_shared/tappay.ts` 的 `getTapPayEndpoints()` 推導 base，或就地：
```ts
const base = Deno.env.get("TAPPAY_ENV") === "sandbox"
  ? "https://sandbox.tappaysdk.com" : "https://prod.tappaysdk.com";
await fetch(`${base}/tpc/transaction/query`, ...)
```

**已正確依 `TAPPAY_ENV` 切換（無需修改）：** `_shared/tappay.ts`(6/132/236)、`process-tappay-payment`(204-205)、`tappay-atm-create`(167/221)、`tappay-notify`(53-54)、`refund-deposit`(10-11)、`charge-deposit`(17-18)、`bind-deposit-card`(19-20)、`tappay-sync-refund`(138-139)、`points-booking-api`(827-828)。

**沒有第三處以上的後端 TapPay API 硬編。** 全庫無 `partner.tappaysdk.com`。

**其他固定 base URL（非 TapPay API，需一併知悉）：**
- 前端 SDK `https://js.tappaysdk.com/sdk/tpdirect/v5.x`（6 處：`BookingFlow.tsx:1927`、`AtmPaymentPanel.tsx:97/116`、`PublicPayment.tsx:66`、`OrderPayment.tsx:373`、`InlineChatPayment.tsx:94`、`PaymentTest.tsx:287`）→ **正確，SDK 檔本身不分環境，環境由 `TPDirect.setupSDK` 的第三參數決定，不需改。**
- `src/lib/nativePayment.ts:27` 硬編 `https://booking.lakeze.com/payment-result?...` → **APP deep link 專用，Web 不走此路徑**（第二階段再處理，見 H）。
- `src/utils/paymentDomain.ts:23-28` 正式網域白名單。
- `supabase/functions/send-resend-email/index.ts:8` LOGO_URL 指向正式 storage（無害）。
- `src/pages/team/TeamLineOA.tsx:112` 正式 line-webhook URL（訂房無關）。
- **6 個 cron migration 硬編正式 functions URL**（見 C-3，最高風險）。

---

## G. 必須先修的環境硬編

方案 A 的前提是「正式程式碼 0 改動」，但 F 的兩處硬編會讓**測試環境查到正式 TapPay**，導致 3DS 驗證恆失敗。因此：

- **必修（2 處）**：`complete-3ds-booking:81`、`tappay-query:100`。
- **時機**：可在測試環境驗證前修，因為 production 分支輸出的 URL 與現行硬編字串**完全相同**（`https://prod.tappaysdk.com/tpc/transaction/query`），且 `TAPPAY_ENV` 正式值為 `production` → 正式行為 0 變更。這是安全的先修項。
- **另一必處理**：套 migration 時**跳過或改寫 6 個 cron migration 的硬編 URL**，否則測試 cron 會打正式後端。

---

## H. callback URL 隔離

- `process-tappay-payment` 的 `backend_notify_url` 由 `Deno.env.get('SUPABASE_URL')` 組出（:167/:195-197）→ **測試專案自動指向測試 functions URL，無需改碼。**
  ⚠️ 但 `result_url` 允許**由前端覆寫**；測試前端必須不傳、或傳測試網域。
- `frontend_redirect_url` 由前端傳入 → 測試前端傳自己的 URL 即可（Web 路徑會用 `window.location.origin`）。
- `tappay-atm-create:225/251` 的 `notify_url` 同樣由 `SUPABASE_URL` 組出 → 自動隔離。
- **不會回正式**的前提：測試前端不得使用 `nativePayment.ts`（APP 路徑，硬編 `booking.lakeze.com`）→ 第一階段只測 Web，符合你的十二點。
- TapPay 後台的 Sandbox 商店 `notify_url` 需另外填測試 functions URL（人工，見 P）。

---

## I. 前端部署隔離

測試前端需要（由新專案的 Cloud 連線自動寫入 `.env`）：
- `VITE_SUPABASE_URL`（測試專案）
- `VITE_SUPABASE_PUBLISHABLE_KEY`（本專案用此名，非 `ANON_KEY`）
- `VITE_SUPABASE_PROJECT_ID`

其餘公開設定：`src/utils/paymentDomain.ts` 網域白名單、`src/config/oauth.ts`、`src/config/lvtu.ts` 需確認測試網域被允許（否則測試網域可能被判為非信任來源）。
`tappay-config` 的 origin 白名單已含 `.lovable.app` → 測試部署的 lovable 網域天然通過。

**防呆**：測試專案的 `.env` 只能由其自身 Cloud 連線產生，禁止手貼正式值。

---

## J. Email 隔離

- 旅客信收件者一律取自 `orders.guest_email` → 測試 DB 只有測試訂單，填測試信箱即完全隔離。
- **不需要新增 `disable_guest_email` 欄位。**
- 管理者／民宿通知信取自 `accommodation_notification_settings` 與 `alert_recipients` → 測試館建立時只填測試信箱，並且**不要**建立 `alert_recipients` 資料。
- `RESEND_API_KEY` 若未設，寄信步驟失敗但不影響訂單成立；可作為第一階段的「完全不寄信」模式。

---

## K. 外部同步隔離

不建立 `accommodation_owlting_config`、`accommodation_hotelnabe_config`、`external_hotel_mappings`、`owlting_credentials`、`accommodation_partnership_periods`、`kol_venues`/`kol_profiles`、`discount_codes`/`scout_discount_codes` 任何一筆資料，且不設定 `OWLTING_PUSH_MODE` / `HOTELNABE_*` / `RAGIC_API_KEY`。

效果：
- OwlTing / Hotelnabe 的 enqueue trigger 會因查無 config 而 skip（不外送）。
- 無 partnership / 無 KOL / 無折扣碼 → 不產生 `commission_records`、`closer_commission_snapshots`、`split_records` 等財務資料。
- 額外保險：不啟用相關 cron（見 L），即使 queue 有殘留也不會被 worker 撈走。

---

## L. Cron 策略

**第一階段全部不開，僅視需要開 1 個。**

| Cron | E2E 必要性 |
|---|---|
| `cancel-expired-atm-orders-every-minute` | 選用（只有要驗 ATM 逾期取消才開） |
| `tappay-webhook-retry` | 選用（要驗 webhook 重試才開） |
| `notify-order-status-change-every-min` | 選用（要驗狀態變更通知信才開） |
| `hotelnabe-ari-worker` / `owlting-order-push` / `owlting-fillup-*` / `owlting-cleanup-*` | ❌ 絕不開（外送風險） |
| `charge-deposit-d1` / `charge-room-on-checkin` | ❌ 不開（會自動扣款） |
| `commission-cron-dispatcher-daily` / `send-daily-performance` / `send-kol-publish-reminder` | ❌ 不開 |
| `daily-auto-backup` / `daily-backup-cleanup` / `cron-history-cleanup` / `cleanup-unverified-members` | ❌ 不開 |
| `sync-meta-ad-*` / `lakeze-health-check` / `group-buy-expire-orders` / `push-checkin-reminders` | ❌ 不開 |

原則：先以手動 curl 觸發 Edge Function 取代 cron，確認行為後再決定是否排程。

---

## M. Auth 策略

第一階段一般訂房走 **Guest（未登入）** 路徑，不複製任何正式 Auth 使用者。
只需建立 1 個測試管理員帳號（用於後台驗收訂單），並在 `user_roles` 給予測試館的 `hotel_admin`。
⚠️ 已知安全規則：匿名不得建立付費訂單（先前 Q1 修正），測試時 3DS/ATM 路徑皆由 Edge Function 以 service role 建單，不受影響。
會員 E2E（含 LINE/Facebook 綁定）留第二階段。

---

## N. 建置順序（依實際依賴調整）

1. 建立**第二個 Lovable 專案**（複製本 repo）並啟用其自己的 Cloud 後端 → 取得獨立 project_id / URL / keys。
2. 先修 F 的 2 處硬編（正式行為 0 變更，見 G），讓兩邊 codebase 一致。
3. 處理 6 個 cron migration 的硬編正式 URL（改寫或標記跳過）。
4. 套用 813 個 migration → 建立 schema。
5. 驗證 schema：比對 tables / functions / triggers / policies 數量與名稱 diff，補齊缺口。
6. 手動建立 Storage buckets（room-photos / logos / og-images）。
7. 設定測試 Secret（E 清單），確認 `TAPPAY_ENV=sandbox`。
8. 部署／確認 156 支 Edge Functions 已在測試專案上線。
9. 建立測試館與最小資料集（D）＋測試管理員帳號。
10. 驗證**無付款** BookingFlow（日期、房型、庫存、價格、加購、訂金比例計算）。
11. 驗證信用卡 Sandbox 3DS（成功／失敗／取消／`complete-3ds-booking`／`tappay-notify`／`create-paid-order`／`paid_amount`／Email／後台）。
12. 驗證 ATM Sandbox（prime → 虛擬帳號 → 期限 → `pending_payment` → 模擬入帳 → `deposit_paid`/`paid`）。
13. 驗證退款（部分／全額／重複通知去重 Q3-A / Q3-B）。
14. 驗證 callback 隔離（確認所有 notify 都落在測試 functions，正式庫 `tappay_webhook_events` 零新增）。
15. 回正式 13 家做**無真實付款**回歸驗收（前台、日期、庫存、價格、套餐、加購、訂金比例、付款方式顯示、送出前金額）。
16. 最後才評估是否做少量 production 小額實刷（森山 3D+ATM 30%／淞湘卉館 ATM 50%／天送幸福和苑 ATM 100%）。

---

## O. 風險與防呆

| 風險 | 最可能發生處 | 防呆 |
|---|---|---|
| 誤連 production DB | 測試前端 `.env` 手貼正式值；或本機切錯專案 | `.env` 只由測試專案 Cloud 連線產生；驗收第一步先在測試前端確認 `VITE_SUPABASE_PROJECT_ID` ≠ `dmafqwfynatdvnaeovhz` |
| 誤用 production TapPay | ①`complete-3ds-booking:81`／`tappay-query:100` 硬編 ②`TAPPAY_ENV` 忘了設 sandbox | 先修 2 處硬編；測試專案建好後立刻查 `tappay-config` 回傳的 `env` 必須是 `sandbox`；Sandbox 與正式的 APP_ID 不同，可用回傳值當指紋 |
| callback 回正式環境 | ①套了 6 個硬編正式 URL 的 cron migration ②前端覆寫 `result_url` ③走到 `nativePayment.ts` | cron migration 改寫後才套；測試前端不傳自訂 `result_url`（讓後端用 `SUPABASE_URL`）；第一階段只測 Web，不啟用 APP 路徑 |
| 寄到正式旅客 | `guest_email` 填到真實信箱；`accommodation_notification_settings` 填正式信箱 | 測試館通知設定只填測試信箱；第一階段先不設 `RESEND_API_KEY` 做「零寄信」驗證，確認流程後再開 |
| 外送 OwlTing / Hotelnabe | 建測試館時順手複製了正式 config；或啟用了對應 cron | 測試 DB 完全不建 config 資料表列（K）；不設 `OWLTING_PUSH_MODE`/`HOTELNABE_*`；不開對應 cron |
| 產生正式財務資料 | 複製了 partnership／KOL／折扣碼 | K 所列資料表一律留空 |
| 測試 cron 自動扣款 | `charge-deposit-d1`、`charge-room-on-checkin` | 一律不排程；要測綁卡扣款只用手動觸發 |

---

## P. 需在 TapPay 後台人工完成

1. 確認／申請 **Sandbox 測試商店**（台幣信用卡 + ATM 各一）。
2. 確認**測試信用卡商店是否支援 3D 驗證**——`process-tappay-payment:161` 硬編 `three_domain_secure: true`，不支援則現行程式無法測。
3. 取得 Sandbox 的 APP_ID / APP_KEY / PARTNER_KEY / 信用卡 MERCHANT_ID / ATM MERCHANT_ID。
4. 於 Sandbox 商店設定 `notify_url` 指向**測試** functions URL（不得影響正式商店設定）。
5. 確認 Sandbox ATM 是否可**人工觸發入帳通知**；若否，標記為「需 TapPay 官方測試方式」，第一階段只能驗到開立虛擬帳號。
6. 確認 Sandbox 與正式是否共用同一組 partner_key（若共用，未來任何環境反推邏輯都不可依 key 判定）。
7. 取得 Sandbox 測試卡號與 3DS 驗證碼清單。

---

## Q. 完成後可測的案例

- 無付款 BookingFlow 全段（日期／房型／庫存／價格／套餐／加購／訂金比例／防詐提醒與條款勾選）
- 信用卡 3DS：成功、失敗、使用者取消、逾時
- `pending_paid_order_drafts` → `create-paid-order` 建單一致性、金額伺服器端驗證
- 重複提交／advisory lock 去重
- ATM：開立虛擬帳號、金額上限 30000、期限、`pending_payment`（入帳通知視 P-5）
- 退款：部分／全額／重複通知去重（Q3-A、Q3-B）、`max(cumulative)` 扣減公式
- `tappay-notify` 三種找單策略、`tappay_webhook_events` 落地與重試
- 訂單狀態機、`paid_amount` 累加、後台顯示、Email 內容

---

## R. 還有哪些阻斷

1. **必須先有第二個 Lovable 專案＋其獨立 Cloud 後端**——這是本方案唯一的硬前提，目前尚未存在。
2. **TapPay Sandbox 憑證尚未取得**（P-1~3），在此之前無法做任何付款驗證。
3. **Sandbox 是否支援 3D**（P-2）未確認；若不支援，需另案討論是否讓 `three_domain_secure` 可設定（會動到正式程式）。
4. **Sandbox ATM 入帳模擬**（P-5）未確認；若不支援，ATM E2E 只能做半段。
5. 6 個 cron migration 硬編正式 URL，套 migration 前必須處理。

---

## 最後判定

**【可以開始建立獨立測試專案】**，但需先完成兩項前置：

1. 建立第二個 Lovable 專案並啟用其獨立 Cloud 後端。
2. 向 TapPay 取得 Sandbox 商店憑證，並確認 3D 與 ATM 入帳模擬的支援狀況（P-1、P-2、P-5）。

程式面沒有阻斷：schema 可由 813 個 migration 完整重建，callback URL 全部由 `SUPABASE_URL` 動態產生，僅 2 處硬編需先修（且 production 分支輸出與現行字串完全相同，正式行為 0 變更）。
