# 切換 Runbook（Lovable Cloud → 客戶自有 Supabase）

> 對應《人客多系統遷移工作計畫》Day 4 晚上 23:00–02:00。每一步都有「驗證」與「失敗時」。
> 執行者：Nokimi。Kenneth 需在線（DNS、TapPay 後台、合作方聯絡）。
> 本檔不含任何鑰匙；鑰匙在 `scripts/migration/migration.env` 與 `secrets.env`（本機、不進 git）。

## 0. 切換前 Go / No-Go（Day 4 16:00）

| 條件 | 狀態 | 備註 |
|---|---|---|
| 測試清單（工作計畫「七」）全數通過 | ☐ | 在新專案 + 預覽網域跑 |
| TapPay：notify URL 為每筆交易帶入，**不需改後台**；凍結前建立的 ATM 待付款通知靠舊→新轉發接住 | ☑ | 9/22 確認 |
| 旭海：已切到新 URL（9/22 實測轉發 200）；奧丁丁：已通知，待切換；KOL 為我方外送，不需通知 | ☐ | 奧丁丁未切也不阻斷（舊→新轉發） |
| SendGrid Inbound Parse（`owlting-email-ingest`）URL 改到新專案 — 帳號所有者待 Kenneth 確認 | ☐ | |
| Google OAuth Client 已設 `https://<NEW_REF>.supabase.co/auth/v1/callback`，新專案 Google provider 測過 | ☐ | |
| Supabase Auth：Site URL、Redirect URLs、Send Email Hook（AUTH_HOOK_SECRET）已設，收得到驗證信 | ☐ | |
| `01-set-secrets.sh --check` 無缺漏 | ☐ | |
| `02` 在正式新專案已跑過、`02c` storage/realtime policy = 39、`03` diff 已看過且無非預期差異 | ☐ | |
| `07` 181 函式全部部署成功 | ☐ | |
| `05` 全量 storage 已同步（Day 2），失敗清單為空 | ☐ | |
| Emergent 已 build 出可部署的前端（指向新專案）並在預覽網域驗過 | ☐ | |
| Kenneth 已在 LINE 群 / 官網貼「週四深夜 23:00–02:00 系統維護」 | ☐ | |
| 回退方案：Lovable Cloud 專案完整保留、未動 | ☐ | |

任一 ☐ 未完成 → 延後，依工作計畫「三、切換條件與延後規則」。

## 1. 凍結（23:00）

1. 前台掛維護頁：Lovable 端 Publish 最後一次「維護中」版本 **或** 在 DNS 層把 booking/pms/hq 指到維護頁（擇一，事先決定）。
   - 驗證：無痕視窗開 booking.lakeze.com 看到維護頁。
2. 停舊專案排程：在 Lovable 後台 Cloud → SQL（若有）或透過既有管理函式停掉 cron：`SELECT cron.unschedule(jobid) FROM cron.job;`
   - 無 SQL 入口時：接受排程在凍結期間可能寫入的少量資料（訂單過期取消、庫存推送），匯入後用 §4 的比對確認。
3. 觸發最後一次 Lovable Export（每天 1 次額度——**Day 4 白天不要用掉**）。
   - 驗證：下載檔案大小合理（與 Day 1 的相比不應差太多）、`pg_restore -l` 可列出內容。
   - 失敗時：額度已用 → 用 Day 4 早上的匯出 + 凍結後差異人工補（訂單以 TapPay 後台對帳）。

## 2. 匯入（23:20）

4. `./03-schema-diff.sh`（用最終匯出檔還原到 scratch，順便確認 cron.job 內容）
5. `./06-import-data.sh`（data-only；會先要求確認新專案 public 為空）
   - 驗證：腳本印出的前 25 大表列數 vs scratch DB 一致；`auth.users` 數一致。
   - 兩段式：auth（users 先、其餘後）→ public（單一交易內 `session_replication_role = replica`）。9/22 預演 139 秒，列數一致。
   - 失敗時：整批回滾；看 log 修（enum 值缺 → schema diff 沒看到的差異，補 migration 後重跑 02→06）。
6. `./04-rebuild-cron.sh`（換 URL/key 後重建排程；同時設定 `app.settings.service_role_key`）。**只在此時套用**——提前套用會把舊庫存推給合作方。9/22 預演已產出 25 job、0 舊 ref。
   - 驗證：`select jobname, schedule, active from cron.job` 與舊專案一致；5 分鐘後 `cron.job_run_details` 有成功紀錄。
6b. `./08-rewrite-storage-urls.sh`（DB 內寫死的舊專案 storage URL → 新專案；不做的話圖片會一直從舊專案載，Lovable 退訂就全破）
   - 驗證：無痕視窗開任一民宿頁，Network 面板 room-photos 請求打到 `<NEW_REF>.supabase.co`。
7. Lovable 端 Secrets 先加回 `MIGRATION_KEY`（值見 `scripts/migration/migration.env`）→ `./05-storage-sync.sh --since <Day 2 全量同步的時間>`（增量）→ 跑完立刻刪 `MIGRATION_KEY`
   - 驗證：`storage-sync-failures.txt` 不存在；隨機抽 3 張房型照片新 URL 可開。
8. 密碼：9/22 預演已驗證 `encrypted_password` 隨匯出帶入，既有帳號直接登入成功；無需額外處理（原「密碼處理方案」取消）。

## 3. 切換前端（00:00）

9. Emergent：部署指向新專案的 build（`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_PREVIEW_HOSTS`）。
10. DNS（Kenneth）：booking / pms / hq / 各民宿自訂網域 → 新前端。TTL 事先已降到 300。
    - 驗證：`dig +short booking.lakeze.com`；無痕視窗載入首頁、Network 面板看 supabase 請求打到 `<NEW_REF>.supabase.co`。
11. 轉發方向對調（**順序不能反**）：
    a. 新專案：`supabase secrets unset MIGRATION_FORWARD_URL MIGRATION_FORWARD_APIKEY --project-ref <NEW_REF>`（目前新→舊的過渡轉發）。
    b. Lovable 端 Secrets：新增 `MIGRATION_FORWARD_URL=https://<NEW_REF>.supabase.co`、`MIGRATION_FORWARD_APIKEY=<新 anon key>` → 舊→新轉發生效（10 個入口函式已含 `maybeForward`，不需重新 Publish）。
    - 驗證：對舊 URL 打一次 `hotelnabe-order-receiver`，回應帶 `x-migration-forwarded-to: <NEW_REF>.supabase.co`；對新 URL 打一次，**不得**再出現該 header。
12. 合作方回呼：TapPay 不用改；LINE Developers 改 Webhook URL；SendGrid Inbound Parse 改到新專案；GBP OAuth redirect 已預先加。

## 4. 驗證（00:30–01:30）

| # | 項目 | 方法 | 通過 |
|---|---|---|---|
| V1 | 會員 Email 登入（既有帳號） | 用測試帳號登入 | ☐ |
| V2 | 會員 Google 登入（既有 + 新帳號） | 兩個 Google 帳號 | ☐ |
| V3 | 註冊驗證信 / 重設密碼信 | 收到信、連結導到正確網域 | ☐ |
| V4 | 訂房完整流程（TapPay 測試卡 or 小額真實交易 + 退款） | 建單 → 付款 → `tappay-notify` 收到 → 訂單狀態 paid → 確認信 | ☐ |
| V5 | LINE Pay（若啟用） | 同上 | ☐ |
| V6 | PMS：登入、房況、改訂單、庫存 | 店家測試帳號 | ☐ |
| V7 | HQ：報表、佣金頁 | | ☐ |
| V8 | 旭海 / 奧丁丁：推庫存一次（`hotelnabe-push-inventory-worker` 手動觸發） | 對方後台看到更新 | ☐ |
| V9 | LINE 管家 OA：傳一則訊息 | `line-webhook` 回覆 | ☐ |
| V10 | 排程：`cron.job_run_details` 最近 5 分鐘有成功紀錄 | SQL | ☐ |
| V11 | Storage：房型照片、logo、Email 內 logo 圖 | 開圖 | ☐ |
| V12 | Edge Function logs 無 5xx 洪水 | Dashboard → Functions → Logs | ☐ |
| V13 | 凍結期間差異：TapPay 後台 23:00 後的交易 vs 新 DB 訂單 | 人工比對 | ☐ |

## 5. 完成（02:00）

13. 拆維護頁、LINE 群公告完成。
14. 舊專案：**不刪、不改**，保留至少 14 天；Lovable 端只留轉發函式。
15. 24 小時內：每 2 小時看一次 Functions logs 與 `cron.job_run_details`；Day 5 早上 09:00 與 Kenneth 對一次訂單與收款。
16. 切換後第一週：處理 `callback-url-map.md` §4 的安全加固清單；刪除 `migration-storage-sync`、`migration-env-dump` 函式與 `MIGRATION_KEY`；移除 `process-email-queue`、`@lovable.dev/mcp-js`；把 `previewHost.ts` 預設的 Lovable 網域移除。

## 6. 回退（任何階段 15 分鐘內無法排除的問題）

| 情境 | 動作 |
|---|---|
| 匯入失敗 / 驗證 V1–V4 任一不過，尚未改 DNS | 什麼都不用回，拆維護頁（Lovable 端 Publish 回正常版本），延後重來。凍結期間資料在舊專案完整。 |
| 已改 DNS，發現重大問題 | DNS 指回舊前端（Lovable 發布網址；TTL 300 → 5 分鐘內生效）；TapPay / LINE URL 改回舊專案；新專案凍結期間若已有新訂單 → 人工搬回舊 DB（預期極少，因為剛切換）。 |
| 合作方回呼改不回 / 對方已改到新 URL | 把 §3 步驟 11 反過來做：Lovable 端 unset `MIGRATION_FORWARD_*`，新專案重設 `MIGRATION_FORWARD_URL=https://dmafqwfynatdvnaeovhz.supabase.co`（即 9/22 起的過渡狀態）。 |

回退決策人：Nokimi 提議、Kenneth 拍板；02:00 前必須做決定，不拖到營業時間。
