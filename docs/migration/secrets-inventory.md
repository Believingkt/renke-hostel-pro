# Secrets 盤點：61 個 key 的來源與取得方式

> Lovable 後台的 Secrets 是 write-only（只能 Add / Delete，看不到值），所以要另外想辦法拿到值。
> 來源：`supabase/functions/**` 的 `Deno.env.get()` 全數盤點（2026-09-19）。

## 方案 A（建議）：用暫時性函式一次讀出，10 分鐘

Edge Function 執行時讀得到自己的 secrets。已寫好 `supabase/functions/migration-env-dump`（唯讀、需 `x-migration-key`）：

1. Lovable 後台 → Cloud → Secrets → Add secret：`MIGRATION_KEY` = 一串長亂數（`openssl rand -hex 32`）。
2. 讓函式部署到舊專案：把 `migration-env-dump/` 這個資料夾併進 `main` 推上 GitHub，Lovable 同步後會自動部署；若沒自動部署，在 Lovable 對話請它「部署 migration-env-dump 函式，不要改其他東西」（凍結前做）。
3. 在 Mac 上：
   ```
   curl -sS -H "x-migration-key: <MIGRATION_KEY>" -H "apikey: <舊 anon key>" \
     https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/migration-env-dump \
     -o ~/dev/lakeze-booking/scripts/migration/secrets.env && chmod 600 ~/dev/lakeze-booking/scripts/migration/secrets.env
   ./01-set-secrets.sh --check
   ```
   `secrets.env` 在 gitignore 內；同時把整份內容存進密碼管理器一份。
4. **用完立刻**：Lovable 後台刪掉 `MIGRATION_KEY`，並在下一次同步時移除 `migration-env-dump` 資料夾（切換後一併清）。

方案 A 拿到的是「現值」，切換後各家 key 是否要輪換（rotate）見下表最後一欄。

## 方案 B（備援）：回各家後台重拿

下表也是切換後輪換金鑰、以及「誰有權限進哪個後台」的對照。**類型**：🔑 真正的秘密 ｜ 🆔 識別碼（不保密，但要對）｜ ⚙️ 設定值（可從程式/文件推得）｜ 🏠 我方自訂（可以直接產新值，只要兩端一致）

| Key | 類型 | 用途 | 去哪拿 / 誰有權限 | 切換後要不要換新 |
|---|---|---|---|---|
| **Resend（寄信）** | | | | |
| RESEND_API_KEY_LAKEZE | 🔑 | 主寄信 key（noreply@lakeze.com） | Resend Dashboard → API Keys（Kenneth 或 Nokimi）；Resend 不顯示既有 key 的值，方案 B 要建新 key | 建議切換後換新 |
| RESEND_API_KEY | 🔑 | 舊 key（部分函式 fallback） | 同上；可與上者設同值 | 同上 |
| RESEND_FROM_EMAIL | ⚙️ | 寄件人顯示 | 程式預設 `人客多通知 <noreply@lakeze.com>` | 不用 |
| **TapPay（金流）** | | | | |
| TAPPAY_PARTNER_KEY | 🔑 | 後端 Partner Key | TapPay Portal → 開發者 → Partner Key（Kenneth 商戶帳號） | 不換（換了要重新綁卡流程驗證） |
| TAPPAY_APP_ID / TAPPAY_APP_KEY | 🆔 | 前端 SDK 用（由 `tappay-config` 回給前端） | TapPay Portal → 應用程式 | 不用 |
| TAPPAY_MERCHANT_ID / TAPPAY_ATM_MERCHANT_ID | 🆔 | 信用卡 / ATM 商店代號 | TapPay Portal → 商店管理 | 不用 |
| TAPPAY_ENV | ⚙️ | `production` / `sandbox` | 現行必為 production | 不用 |
| TAPPAY_ATM_MAX_AMOUNT | ⚙️ | ATM 單筆上限 | 問 Kenneth 或方案 A | 不用 |
| TAPPAY_WEBHOOK_SECRET | 🏠 | 我方驗 webhook 的 key（`?key=` / `x-webhook-key`） | 我方自訂；值設在 TapPay Portal 的 Webhook URL 上 | 改 URL 時可順便換新 |
| **LINE** | | | | |
| LINE_CHANNEL_ID / LINE_CHANNEL_SECRET | 🆔/🔑 | LINE Login（會員登入） | LINE Developers → 該 Provider → LINE Login channel → Basic settings（Kenneth 的 LINE 商用帳號） | 不用 |
| LINE_CHANNEL_ACCESS_TOKEN | 🔑 | LINE Login channel 的長效 token | 同 channel → Messaging API/Token；可 issue 新的 | 可換新 |
| LIFF_ID | 🆔 | LIFF app | LINE Developers → LIFF | 不用 |
| LINE_BUTLER_CHANNEL_SECRET / LINE_BUTLER_ACCESS_TOKEN | 🔑 | 管家 OA（Messaging API，`line-webhook`） | LINE Developers → 管家 OA 的 Messaging API channel | Access token 可 issue 新的 |
| LINE_PAY_CHANNEL_ID / LINE_PAY_CHANNEL_SECRET / LINE_PAY_ENV | 🆔/🔑/⚙️ | LINE Pay | LINE Pay 商家中心 → 管理連結金鑰（Kenneth） | 不用 |
| **旭海 HotelNabe** | | | | |
| HOTELNABE_INBOUND_ID / HOTELNABE_INBOUND_PASSWORD | 🔑 | 旭海打我們的帳密 | 我方自訂、當初給旭海的；方案 B 要問旭海窗口或重設並通知 | 不換（換了旭海要改） |
| HOTELNABE_PMS_ID | 🆔 | 旭海端的 PMS 代號 | 旭海提供 | 不用 |
| HOTELNABE_BASE_URL | ⚙️ | 旭海 API 網址 | 旭海文件 | 不用 |
| HOTELNABE_PUSH_MODE / HOTELNABE_INBOUND_MODE / HOTELNABE_ARI_PUSH_MODE / HOTELNABE_ARI_WORKER_BATCH | ⚙️ | 開關與批次大小 | 程式碼預設值可查；現值用方案 A | 不用 |
| **奧丁丁 OwlTing** | | | | |
| OWLTING_PUSH_MODE | ⚙️ | 推送開關 | 程式碼 | 不用 |
| FILLUP_BASE_URL | ⚙️ | 補件表單網址 | 程式碼 / 現值 | 不用 |
| （奧丁丁各館別帳密存在 DB `owlting_credentials` 與 vault，不在 secrets） | | | GBP 的 OAuth secret 在 vault，**vault 不可攜**，切換後要在後台重填 | |
| **靜態 IP 代理（repo 內 `vps-relay-server`）** | | | | |
| STATIC_IP_PROXY_URL / STATIC_IP_PROXY_TOKEN | ⚙️/🔑 | 旭海/奧丁丁 IP 白名單用的中繼 | Nokimi 的 VPS；token 在 VPS 的環境設定裡 | 不用 |
| **AI** | | | | |
| ANTHROPIC_API_KEY | 🔑 | Claude 直連 | console.anthropic.com（誰的帳號？確認是 Kenneth 付費） | 可換新 |
| OPENAI_API_KEY | 🔑 | 語音轉文字（direct 模式） | platform.openai.com | 可換新 |
| GEMINI_API_KEY（新增） | 🔑 | 取代 Lovable AI gateway | Google AI Studio（Kenneth 的 Google 帳號，設用量上限） | — |
| LOVABLE_API_KEY / LOVABLE_SEND_URL | — | Lovable 專用 | **不搬** | — |
| **Meta / Facebook** | | | | |
| FACEBOOK_APP_ID / FACEBOOK_APP_SECRET | 🆔/🔑 | Facebook Login | Meta for Developers → App → 設定 → 基本資料 | 不用 |
| META_ADS_AD_ACCOUNT_ID / META_ADS_ACCESS_TOKEN | 🆔/🔑 | 廣告成效同步（cron 目前 inactive） | Meta Business → 系統用戶 token | 可延後（功能未啟用） |
| **Apple 推播 APNs** | | | | |
| APNS_P8 | 🔑 | .p8 私鑰內容 | **Apple 只讓下載一次**；Nokimi 手上應有檔案（iOS 發版用）；沒有就在 Apple Developer → Keys 建新 key 並更新 KEY_ID | 不換 |
| APNS_KEY_ID / APNS_TEAM_ID / APNS_TOPIC / APNS_ENV | 🆔/⚙️ | Key ID、Team ID、bundle id、production | Apple Developer → Keys / Membership；bundle id 見 `ios/` | 不用 |
| **Google** | | | | |
| GOOGLE_PLACES_API_KEY | 🔑 | Places API | Google Cloud Console → 憑證 | 可換新 |
| **其他外部服務** | | | | |
| RAGIC_API_KEY | 🔑 | Ragic（KOL 請款單、加盟費、營收推送） | Ragic 帳號設定 → API Key（Kenneth） | 可換新 |
| TAIWAN_TRAVELMAP_ACCOUNT_ID / TAIWAN_TRAVELMAP_PASSWORD / TAIWAN_TRAVELMAP_CID | 🆔/🔑 | 外部房源搜尋（台灣旅遊地圖） | 該平台提供的帳密（Kenneth） | 不換 |
| EXTERNAL_BOOKING_ACCOUNT_ID / EXTERNAL_BOOKING_PASSWORD | 🆔/🔑 | 同上的舊名稱（fallback） | 同上，可設同值 | 不換 |
| **我方內部自訂（兩端一致即可）** | | | | |
| PLATFORM_MASTER_API_KEY | 🏠 | `all-availability` 對外 API 的 master key | **若有外部串接方在用，值不能變**；Day 0 問 Kenneth | 視外部使用者 |
| PLATFORM_MASTER_KEY | 🏠 | `kol-api` 的 master key | 同上 | 同上 |
| GROUP_BUY_RESEND_INTERNAL_KEY | 🏠 | 團購重寄通知的內部 key（後台→函式） | 前端/後台呼叫端帶的值；查 `src/` 或方案 A | 可換新（兩端同步） |
| PUSH_CHECKIN_CRON_SECRET | 🏠 | 入住提醒 cron 的授權 | **已知**：cron job 232 指令內明文 | 切換後換新 |
| APP_REVIEW_SEED_KEY / APP_REVIEW_PASSWORD | 🏠 | 建 App Store 審核測試帳號 | 我方自訂；PASSWORD 要與 App Store Connect 審核備註一致 | 不換 |
| TEST_ROOM_TYPE_ID / TEST_PRICING_TEMPLATE_ID | ⚙️ | 奧丁丁隔離測試用的 DB id | DB 查 | 不用 |
| PUBLIC_SITE_ORIGIN | ⚙️ | LINE 行程分享的前台網址 | `https://booking.lakeze.com` | 不用 |
| **遷移新增** | | | | |
| AUTH_HOOK_SECRET | 🏠 | Supabase Auth Send Email Hook | 新專案 Dashboard → Auth → Hooks 產生 | — |
| ALLOWED_PREVIEW_HOSTS / LLM_MODE / MIGRATION_FORWARD_URL / MIGRATION_FORWARD_APIKEY | ⚙️ | 見各程式註解 | 我方設定 | — |

## 需要 Kenneth 親自登入的後台（方案 B 才需要）

TapPay Portal、LINE Developers（Login + 管家 OA）、LINE Pay 商家中心、Meta for Developers、Resend、Ragic、Apple Developer（若 .p8 遺失）、Google Cloud Console、台灣旅遊地圖。→ 用方案 A 的話，這些只在「切換後決定輪換」時才需要。
