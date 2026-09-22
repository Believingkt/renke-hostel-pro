# 回呼 URL 對照表與外部入口盤點

> 狀態：前置準備（Day 0）。`<NEW_REF>` 於新 Supabase 專案建立後填入。
> 舊專案（Lovable Cloud）：`dmafqwfynatdvnaeovhz`
> 新專案（客戶自有）：`<NEW_REF>`

URL 規則：`https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/<fn>` → `https://<NEW_REF>.supabase.co/functions/v1/<fn>`

---

## 1. 需通知合作方更改的回呼 / Webhook URL

| # | 合作方 | 用途 | 函式（新舊路徑相同，僅換 ref） | 對方後台設定位置 | 切換方式 | 負責 |
|---|---|---|---|---|---|---|
| 1 | TapPay | 付款結果通知（notify_url） | `tappay-notify` | 每筆交易由程式帶入 | **不需改後台**（9/22 確認）；切換前建立、切換後才回呼的 ATM 待付款靠舊→新轉發 | — |
| 2 | TapPay | Webhook（交易/退款事件） | `tappay-payment-webhook`（`?key=` 或 `x-webhook-key`，用 `TAPPAY_WEBHOOK_SECRET`） | TapPay Portal → Webhook | 同上；secret 沿用 | Nokimi |
| 3 | TapPay | 退款通知 | `tappay-refund-notify` | TapPay Portal | 同上 | Nokimi |
| 4 | TapPay | ATM 虛擬帳號付款通知 | `tappay-atm-create`（建立）/ `tappay-notify`（結果） | TapPay Portal | 同上 | Nokimi |
| 5 | LINE Pay | 付款確認 confirm/cancel URL | `process-linepay-payment` | LINE Pay 商家後台（或程式內 confirmUrl 參數） | 先確認 confirmUrl 是程式帶入還是後台設定；若程式帶入則不用通知 | Nokimi |
| 6 | LINE Messaging API | Webhook URL（管家 OA） | `line-webhook`（`x-line-signature`，用 `LINE_BUTLER_CHANNEL_SECRET`/`LINE_CHANNEL_SECRET`） | LINE Developers → Messaging API → Webhook URL | 我方可自行改；前台 `TeamLineOA.tsx` 也顯示此 URL 給店家（見 §3） | Nokimi |
| 7 | LINE Login | OAuth callback | `line-oauth-exchange`（前端 redirect 後呼叫；redirect URI 為前台網址） | LINE Developers → LINE Login → Callback URL | Callback URL 指向**前台網域**，換 Supabase 不影響；但 Supabase Auth 的 Redirect URLs 要在新專案重設 | Nokimi |
| 8 | Facebook Login | OAuth callback | `facebook-oauth-exchange` | Meta for Developers → Facebook Login → Valid OAuth Redirect URIs | 同上（前台網域），確認即可 | Nokimi |
| 9 | Google（會員登入） | OAuth | 現由 Lovable `@lovable.dev/cloud-auth-js` 代管 | Google Cloud Console → OAuth Client | **改為 Supabase Auth Google provider**：需 Kenneth 提供/建立 Google OAuth Client，Authorized redirect URI 填 `https://<NEW_REF>.supabase.co/auth/v1/callback` | Kenneth 提供 client、Nokimi 設定 |
| 10 | Google Business Profile | OAuth callback | `google-business-profile-oauth-callback` | Google Cloud Console → 該 OAuth Client → Authorized redirect URIs | 新增新 URL（舊的先保留） | Nokimi |
| 11 | 旭海（HotelNabe） | 訂單接收 | `hotelnabe-order-receiver` | 旭海端設定 | **已切到新 URL（9/22）**，切換前由新→舊轉發 | ☑ |
| 12 | 奧丁丁（OwlTing） | Channel Manager 回呼 | `owlting-cm` | OwlTing 端設定 | 已通知；對方 10 月上旬才能切，切換後由舊→新轉發撐到對方完成 | 等對方 |
| 13 | 奧丁丁（Email 收單） | Email ingest | `owlting-email-ingest` | **SendGrid Inbound Parse**（帳號所有者待確認） | 改 Inbound Parse 目的 URL；找不到帳號前靠舊→新轉發 | Kenneth 找帳號 |
| 14 | KOL 平台 | Webhook（我方對外送） | `kol-webhook` | — | 不需對方改 | ☑ |
| 15 | Supabase Auth Hook | Send Email Hook | `auth-email-hook`（現用 `LOVABLE_API_KEY` 當 webhook secret → 改 `AUTH_HOOK_SECRET`） | 新專案 Dashboard → Auth → Hooks | 我方自行設定，用新產生的 secret | Nokimi |
| 16 | Resend | 寄信 / inbound | `send-resend-email`、`send-push` 等 | Resend Dashboard → Domains / Webhooks | 若有 inbound webhook 指向舊 ref 則更新 | Nokimi |

過渡期做法：10 個入口函式已內建 `maybeForward`（`_shared/migrationForward.ts`），由 secret `MIGRATION_FORWARD_URL` 決定方向。9/22 起新專案設新→舊（合作方可提前切）；切換當晚對調成 Lovable 端舊→新（runbook §3 步驟 11），撐到奧丁丁與 SendGrid 改完為止。

---

## 2. pg_cron 排程（寫死舊專案 URL + 舊 anon key）

以下 migration 用 `net.http_post` 呼叫舊專案 URL，header 內嵌舊專案的 anon JWT。`supabase db push` 後這些 cron job 會**指向舊專案**，切換前必須重建：

| jobname | 排程 | 目標函式 | 來源 migration |
|---|---|---|---|
| hotelnabe-ari-worker-every-5min | `*/5 * * * *` | `hotelnabe-push-inventory-worker` | 20260702075233（取代 every-minute 版） |
| cancel-expired-atm-orders-every-minute | `* * * * *` | `cancel-expired-atm-orders` | 20260727024534 |
| commission-cron-dispatcher-daily | `59 15 * * *`（台北 23:59） | `cron-dispatcher-commission` | 20260731172622 |
| group-buy-expire-orders-hourly | `5 * * * *` | `group-buy-expire-orders`（無 auth header） | 20260812150627 |
| rpc-contract-check-daily | `20 21 * * *` | `rpc-contract-check`（用 `app.settings.service_role_key`，新專案需另設） | 20260910074659 |
| group-buy-stuck-paid-draft-scan | `*/10 * * * *` | SQL：`scan_stuck_group_buy_paid_drafts(15)`（不涉 URL） | 20260823213318 |
| cron-history-cleanup-daily | `25 5 * * *` | SQL 清 job_run_details（不涉 URL） | 20260816035829 |

注意：
- `20260816035829` 有 `cron.alter_job(10, ...)` 寫死 jobid，新專案 jobid 不同，`db push` 可能在此失敗 → Day 0 在測試專案先跑一遍確認，必要時以 repair migration 處理。
- 實際生效的 job 以 Lovable 匯出的 `cron.job` 表為準（可能有 Dashboard 手動建的）。切換時用 `scripts/migration/rebuild-cron.sql`（由匯出資料產生）重建，統一替換 URL 與 key。
- `app.settings.service_role_key` 是 DB 設定（`ALTER DATABASE ... SET`），匯出不含，新專案要重設。

---

## 3. 程式碼內寫死舊 ref 的位置（需改為讀環境變數或直接替換）

| 檔案 | 內容 | 處理 |
|---|---|---|
| `index.html:14` | preconnect / dns-prefetch 舊網域 | 改為新網域（或由 build 注入） |
| `src/components/docs/AvailabilityTryIt.tsx:12` | API 文件範例 `accommodation-api` | 改用 `import.meta.env.VITE_SUPABASE_URL` |
| `src/pages/AccommodationApiDocs.tsx`（多處） | API 文件範例 `accommodation-api`、`all-availability` | 同上 |
| `public/docs/accommodation-api.openapi.json`、`public/docs/all-availability-api.md` | 對外 API 文件 servers URL | 文字替換（對外 API 使用者也要通知！） |
| `src/components/website-content/GoogleBusinessProfileSettings.tsx:60`、`src/pages/help/GoogleBusinessProfileApiHelp.tsx:37` | 顯示 GBP OAuth callback URL | 改用 env |
| `src/pages/hq/HQGoogleBusinessProfile.tsx` | 同上 | 改用 env |
| `src/pages/team/TeamLineOA.tsx:112` | 顯示給店家的 LINE webhook URL | 改用 env |
| `src/pages/admin/ai-training/AdminAiTrainingApiDocs.tsx`（未追蹤檔） | API 文件範例 | 待該檔進 main 後一併處理 |
| `supabase/functions/_shared/groupBuyEmail.ts:13`、`send-resend-email/index.ts:8,245` | Email 內 logo 圖片 URL（storage public bucket `email-assets`） | 改用 `Deno.env.get("SUPABASE_URL")`；storage 搬遷後路徑相同 |
| `supabase/functions/mcp/index.ts` | （工作區已修改、未提交）含舊 ref | 待確認內容後處理 |
| `supabase/config.toml` | `project_id` | `supabase link` 時改為新 ref |
| `.env` | `SUPABASE_URL`、`VITE_SUPABASE_PROJECT_ID`、keys | 切換時換成新專案值（不進 git） |
| `.lovable/mcp/manifest.json`、`.lovable/plan/*` | Lovable 專用 | 去 Lovable 化時整個目錄移除 |
| `docs/qa/order-rls-verification.md`、`docs/v55b0/01_migration.sql` | 文件 / 歷史 SQL | 文字替換即可 |

對外公開 API（`accommodation-api`、`all-availability`、`public-venue-directory`、`kol-api` 等）的第三方使用者若直接打舊 URL，切換後也會斷 → Day 0 由 Kenneth 確認是否有外部串接方，有則一併通知。

---

## 4. Edge Function `verify_jwt` 設定盤點

- 原 `config.toml` 只列 85 個函式（53 個 `false`、32 個 `true`），磁碟上有 180 個；**95 個未列**（Lovable 佈署時用其預設值，實際值無法從 Lovable 後台查證）。
- 已於 2026-09-19 補齊 95 個，一律明示 `verify_jwt = false`，理由：
  1. 舊行為下 `verify_jwt = true` 只擋「沒有合法 Supabase JWT」的呼叫，而 anon key 本身就是 JWT，對前端呼叫沒有實質防護；改 `false` 不會讓任何現有呼叫端失效。
  2. 新版 Supabase 專案的 `sb_publishable_…` key 不是 JWT；若新專案沒有 legacy anon JWT，`verify_jwt = true` 會直接擋掉前端呼叫。Supabase 官方目前也建議在函式內自行驗證。
  3. 需要授權的函式皆已在程式內用 `getUser()` / secret header 自驗（見下）。
- 原本 32 個 `true` 的函式中，**沒有自驗機制**的（切換後值得補強，非遷移阻斷）：`backup-data`、`create-user`、`delete-user`、`google-business-profile-*`（5 個）、`save-google-business-profile-platform-secret`、`fetch-google-reviews`、`fetch-taiwan-holidays`、`generate-seo-suggestions`、`generate-test-orders`、`hotelnabe-retrieve-rooms`、`process-email-queue`、`fetch-ragic-kol-payforms`、`push-ragic-*`（2 個）、`restore-data`。這 32 個維持 `true` 不動，Day 0 在新專案確認 legacy anon key 是否可用；若不可用，再統一改 `false` 並補自驗。
- 新補的 95 個當中，**用 service role 寫入但程式內看不到任何授權檢查**的（切換後補強清單）：`charge-room-on-checkin`、`group-buy-cancel-refund`、`group-buy-complete-paid-order`、`group-buy-create-payment-draft`、`group-buy-draft-reconcile`、`group-buy-release-payment-draft`、`group-buy-resume-payment-draft`、`hotelnabe-backfill-inventory`、`notify-booking-confirmation`、`owlting-cleanup-stale-pending`、`payment-audit-resolve`、`remarketing-track`、`rpc-contract-check`、`tappay-webhook-retry`。這些目前在舊環境也是同樣狀態，遷移期間**不改業務邏輯**，列為切換後第一批安全加固項目。
