# 舊專案（Lovable Cloud）實際狀態盤點 — 2026-09-19

來源：Lovable 後台 Cloud → SQL editor（唯讀查詢）與 Advanced settings。這些數字是切換規劃與驗收的基準。

## 基本數字

| 項目 | 值 | 對遷移的意義 |
|---|---|---|
| PostgreSQL | 17.6（aarch64） | 新專案選 PG 17，`pg_dump/pg_restore` 用 17 版 client |
| 資料庫所在地 | **Europe (Zurich)** | 台灣→蘇黎世延遲約 200ms+；新專案選 Tokyo 反而更快，前端體感會改善 |
| 執行個體 | Mini：2-core ARM shared、1 GB RAM | 新專案 Medium（4 GB）是升級，不是同級 |
| DB 大小 | 311 MB（Lovable 顯示 0.61 GB / 8 GB） | 匯出檔應在數百 MB 內，遠低於 5 GB 上限 |
| public 表數 | 246 表、4 views | schema diff 的基準 |
| 最大表 | room_inventory_audit_log 75,264、system_health_logs 22,172、room_inventory_pricing 21,909、page_analytics 20,301 | 匯入時間可忽略（都很小） |
| auth.users | **104 個，其中 101 個有 encrypted_password** | 若匯出檔含 auth schema，密碼雜湊（bcrypt）可直接搬到新專案、會員**不用重設密碼**——待 9/19 匯出檔確認 |
| OAuth identities | 6（非 email） | Google/LINE/FB 登入的會員；Google 改走 Supabase provider 後，identity 的 provider id 相同即可對上 |
| storage | **699 個物件、568 MB**，10 個 bucket | 全量同步約 10 分鐘；桶：room-photos 673、og-images 8、custom-sections 7、logos 7、member-avatars 2、ai-assets 1、email-assets 1、transfer-receipts 0、backups（private，cron 自動備份）、database_export_19_09_26（匯出用，不搬） |
| pg_cron | **25 個 job（22 個 active）** | migrations 只寫了 7 個；其餘 18 個只存在 DB → 一定要用 `04-rebuild-cron.sh` 從匯出檔重建，不能只靠 db push |

## Lovable 後台能做什麼（原本以為不能）

- **有 SQL editor**：可對 Cloud DB 跑任意 SQL（含 `cron.*`、`auth.*`、`storage.*`），結果可 Export CSV。用途：切換當晚直接 `SELECT cron.unschedule(jobid) FROM cron.job;` 停排程；匯出檔缺什麼就用 SQL 補撈；驗收時兩邊對列數。
- **Secrets 只能 Add / Delete，不能看值**（write-only）。→ 約 60 個 secret 的值要回各家後台重拿或由 Kenneth 提供；已知在程式內或 cron 內可見的除外（見下）。
- **Export**：Advanced settings → Export data → 產生後寄 email 下載連結、同時放到 storage bucket `database_export_19_09_26`；每 24 小時一次。9/19 已按下第一次，用來驗證格式與內容。
- Backups：只有「Restore」，不能下載。
- Storage：每個檔可個別下載，無整桶下載 → 維持用 `migration-storage-sync` 函式 + `05-storage-sync.ts`。

## 25 個 pg_cron job（2026-09-19 實際內容）

授權方式：A = header `apikey: <舊 anon JWT>`；B = `Authorization: Bearer <舊 anon JWT>`；S = 其他 secret；— = 無。重建時 `04-rebuild-cron.sh` 會把舊 URL 與舊 anon JWT 整串替換。

| jobid | jobname | schedule | 目標 | 授權 | active |
|---|---|---|---|---|---|
| 4 | daily-auto-backup | `0 2 * * *` | backup-data（body 帶第一個 accommodation id） | B | ✔ |
| 5 | daily-backup-cleanup | `45 3 * * *` | cleanup-old-backups（retentionDays 30） | B | ✔ |
| 6 | lakeze-health-check | `*/10 * * * *` | health-check | B | ✔ |
| 8 | charge-deposit-d1 | `30 0 * * *` | charge-deposit（batch） | A | ✔ |
| 10 | sync-meta-ads-weekly | `40 1 * * 1` | sync-meta-ads | A | ✘ |
| 12 | owlting-fillup-remind-hourly | `0 * * * *` | owlting-fillup-remind | A | ✔ |
| 13 | send-daily-performance-every-minute | `*/5 * * * *` | send-daily-performance | A | ✔ |
| 17 | owlting-order-push-every-minute | `*/2 * * * *` | owlting-order-push | A | ✔ |
| 19 | hotelnabe-ari-worker-every-5min | `*/5 * * * *` | hotelnabe-push-inventory-worker | A | ✔ |
| 20 | owlting-cleanup-stale-pending-hourly | `17 * * * *` | owlting-cleanup-stale-pending | A | ✔ |
| 21 | send-kol-publish-reminder-daily | `30 1 * * *` | send-kol-publish-reminder | A+B | ✔ |
| 22 | notify-order-status-change-every-min | `*/2 * * * *` | notify-order-status-change（trigger: cron） | A | ✔ |
| 35 | cleanup-unverified-members-daily | `15 4 * * *` | cleanup-unverified-members（days 7, notify） | A | ✔ |
| 40 | charge-room-on-checkin | `30 16 * * *` | charge-room-on-checkin（batch） | A | ✔ |
| 41 | tappay-webhook-retry | `*/10 * * * *` | tappay-webhook-retry | A | ✔ |
| 45 | cancel-expired-atm-orders-every-minute | `*/5 * * * *` | cancel-expired-atm-orders | B | ✔ |
| 106 | commission-cron-dispatcher-daily | `59 15 * * *` | cron-dispatcher-commission | A | ✔ |
| 204 | sync-meta-ad-insights-daily | `0 19 * * *` | sync-meta-ad-insights（days 7） | A | ✘ |
| 205 | sync-meta-ad-insights-weekly | `0 20 * * 0` | sync-meta-ad-insights（days 30） | A | ✘ |
| 232 | push-checkin-reminders-daily | `20 2 * * *` | push-checkin-reminders | S：`Bearer <PUSH_CHECKIN_CRON_SECRET 明文>` | ✔ |
| 243 | group-buy-expire-orders-hourly | `5 * * * *` | group-buy-expire-orders | — | ✔ |
| 271 | cron-history-cleanup-daily | `25 5 * * *` | SQL：清 14 天前 job_run_details | — | ✔ |
| 392 | group-buy-stuck-paid-draft-scan | `*/10 * * * *` | SQL：`scan_stuck_group_buy_paid_drafts(15)` | — | ✔ |
| 486 | rpc-contract-check-daily | `20 21 * * *` | rpc-contract-check | S：`current_setting('app.settings.service_role_key')` | ✔ |
| 487 | paid-draft-reconcile-every-10min | `*/10 * * * *` | paid-draft-reconcile | A | ✔ |

備註
- 舊 anon JWT 的 `exp` 為 2035（iat 2025-10）；新專案若只有 `sb_publishable_…` 沒有 legacy JWT，A/B 兩種 header 在新專案用 publishable key 一樣可過 gateway（verify_jwt 已全設 false 或函式自驗）。
- job 232 的 secret 值直接寫在 cron 指令裡，等於 `PUSH_CHECKIN_CRON_SECRET` 的值已知，可直接沿用（切換後建議換新）。
- job 486 依賴 DB 設定 `app.settings.service_role_key`，新專案由 `04-rebuild-cron.sh` 一併 `ALTER DATABASE` 設定。
- 三個 ✘ 的 Meta 廣告同步 job 重建時保留 inactive。

## 從 cron / 程式可直接得知、不用重拿的 secret

`PUSH_CHECKIN_CRON_SECRET`（cron 232 明文）、`SUPABASE_*`（自動注入）。其餘全部要重拿，清單見 `scripts/migration/secrets.template.env`。

## 團隊使用狀況（風險）

9/17 Norris、**9/19（今天）saki best** 仍在用 Lovable 對話改資料、改程式並部署（`change-order-dates` 已修一版）。凍結前 main 還會動：週一開工第一步是把 `feat/migration-prep` rebase 到最新 main，再推給 Emergent。
