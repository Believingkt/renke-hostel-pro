# 切換當晚操作單（2026-09-24 23:00 → 09-25 02:00）

> 一頁、照順序、邊做邊勾。細節與失敗處理看 `runbook.md`；DNS 對照看 `frontend-hosting-cutover-night.md` §2。
> 所有指令在 `~/dev/lakeze-booking/scripts/migration/`。NEW_REF = `opaphdargymfyrrzvozs`，OLD_REF = `dmafqwfynatdvnaeovhz`。
> 決定：**不掛維護頁**（切換期間舊站照常可看，凍結後產生的訂單用 V13 人工比對）。

## 22:45 前置（已完成打勾）
- [x] DNS 7 筆 TTL=300（21:30）
- [x] Vercel `lakeze-booking` 已部署 `feat/migration-prep`，`lakeze-booking.vercel.app` 驗過：REST/RPC 全打新專案 200、無 console 錯誤
- [x] Vercel Domains 已加 7 個網域（Invalid Configuration 是正常，等 DNS）
- [x] Gemini key 可用（translate-content 回 translations）
- [x] Prod compute Medium、Confirm email OFF、storage policies 39
- [x] 本機 commit 全部 push（`c2d3bc989`）
- [x] 小洪、Victor 已收到「今晚 23:00–02:00 切換」訊息
- [x] Kenneth 確認 23:00 起不在 Lovable 改任何東西、人在線上（回退拍板）
- [ ] `dig` 核對 7 筆 TTL 300（`for h in booking hq pms sensaninn oliviaboutiquehotel tiansong-villa traveldays; do dig +noall +answer $h.lakeze.com @8.8.8.8; done`）

## A. 凍結 23:00（實際 22:10 開始）
- [x] A2 **先** Lovable Export（Cloud → Overview → Advanced settings → Export data；今天唯一一次額度）→ 檔案在 Storage bucket `database_export_<日期>`，下載 zip 解壓到 `~/Downloads` → `migration.env` 改 `DUMP_FILE` → `pg_restore -l | head -5`。⚠ 一定要先 Export 再停 cron：04 是從匯出檔的 cron.job 重建排程。22:14 快照，20.9 MB zip（9/19 為 20.4 MB）
- [x] A1 **再** Lovable SQL editor 停 cron：`SELECT cron.unschedule(jobid) FROM cron.job;` → `select count(*) from cron.job` = 0（原 22 active / 25）
- [x] A3 schema 沒變：scratch DB 沒起就比 TOC——`pg_restore -l` 兩份匯出 → 過濾 TABLE DATA → sort → diff，只看 public/auth 行；9/24 vs 9/19 零差異（realtime 分區、storage 內部函式差異可忽略）

## B. 匯入 23:20
- [x] B0 `./02-build-schema.sh`（新專案還有 9/22 預演資料 → 回 yes 讓它 DROP public 重建；清 cron、清 storage policy、清 migration 紀錄）→ `./02c-storage-policies.sh` = 39
- [x] B0b 清預演的 auth：`psql "$NEW_DB_URL" -c "delete from auth.users;"` → count = 0（06 看到 auth.users 非空會跳過 auth 那趟）
- [x] B1 `./06-import-data.sh` → 前 25 大表列數 vs scratch 一致、auth.users 一致（預演 139 秒）
- [x] B2 `./04-rebuild-cron.sh` → `select jobname, schedule, active from cron.job` 25 筆、0 舊 ref
- [x] B3 `./08-rewrite-storage-urls.sh` → 掃描 ~403 筆 → `yes` → 每表印 rows → 重掃 0 筆
- [x] B4 Lovable Secrets 加回 `MIGRATION_KEY` → `./05-storage-sync.sh --since <Day2 全量時間>` → `storage-sync-failures.txt` 不存在 → **立刻刪 `MIGRATION_KEY`**
- [x] B5 `./01-set-secrets.sh --check` 無缺漏

## C. 切換 00:00
- [x] C1 Squarespace DNS：7 筆 A 記錄 IP `185.158.133.1` → `76.76.21.21`，順序 booking → pms → hq → sensaninn → tiansong-villa → oliviaboutiquehotel → traveldays（每筆存檔要 Google 驗證一次）
- [x] C2 `dig +short booking.lakeze.com @8.8.8.8` = 76.76.21.21；Vercel Domains 頁 7 個都變 Valid + SSL（最多等 5 分鐘）
- [x] C3 無痕視窗開 `https://booking.lakeze.com/sensaninn`：頁面正常、Network 面板 supabase 請求 = `opaphdargymfyrrzvozs`、room-photos 圖也是新專案
- [x] C4 轉發對調（順序不能反）：
  - a. `supabase secrets unset MIGRATION_FORWARD_URL MIGRATION_FORWARD_APIKEY --project-ref opaphdargymfyrrzvozs`
  - b. Lovable Secrets 新增 `MIGRATION_FORWARD_URL=https://opaphdargymfyrrzvozs.supabase.co`、`MIGRATION_FORWARD_APIKEY=<新 anon>`
  - c. curl 舊 URL `hotelnabe-order-receiver` → header `x-migration-forwarded-to: opaphdargymfyrrzvozs.supabase.co`；curl 新 URL → **沒有**該 header
- [x] C5 LINE Developers：Webhook URL 改 `https://opaphdargymfyrrzvozs.supabase.co/functions/v1/line-webhook` → Verify 成功
- [~] C6 （略過，靠舊→新轉發）SendGrid Inbound Parse → 新專案 `owlting-email-ingest`（帳號所有者未定 → 未定就跳過，靠舊→新轉發）
- [x] C7 Lovable 專案 Settings → Domains 移除 7 個網域（舊快取使用者打到舊站得 404，不寫舊 DB）

## D. 驗證 00:30–01:30（任一紅燈 → 看 runbook §6）
| # | 項目 | 通過 |
|---|---|---|
| V1 | 既有會員 Email/OTP 登入 | ☐ |
| V2 | Facebook / LINE 登入（Google 按鈕本來就不在會員頁） | ☐ |
| V3 | 重設密碼信收到、連結指向 lakeze.com | ☐ |
| V4 | 訂房 → 付款（小額真卡）→ `tappay-notify` 進新專案 → 訂單 paid → 確認信 → 退款 | ☐ |
| V6 | PMS `pms.lakeze.com` 登入、房況、改訂單 | ☐ |
| V7 | HQ `hq.lakeze.com` 報表 | ☐ |
| V8 | 旭海推庫存一次（手動觸發 `hotelnabe-push-inventory-worker`）| ☐ |
| V9 | 小安 LINE OA 傳一句 → 有回 | ☑ 00:50 |
| V10 | `select * from cron.job_run_details order by start_time desc limit 20` 有 succeeded | ☐ |
| V11 | 房型照片、logo、信內圖片全從新專案載 | ☐ |
| V12 | Functions Logs 無 5xx 洪水 | ☐ |
| V13 | TapPay 後台 23:00 後交易 vs 新 DB 訂單，一致或已人工補 | ☐ |

## E. 收尾 02:00
- [ ] E1 LINE 群公告完成（Kenneth）
- [ ] E2 舊專案不刪不改；Lovable 訂閱保留到 ≥10/20
- [ ] E3 排明早 09:00 與 Kenneth 對訂單、收款；24h 內每 2h 看 Logs + cron
- [ ] E4 第一週：runbook §5 第 16–17 條 + checklist B12（Vercel 移交/升 Pro）+ Gemini key 輪換 + Nokimi 改 Lovable 密碼

## 回退一句話
DNS 還沒改 → 什麼都不用回，延後。DNS 已改 → 7 筆 IP 改回 `185.158.133.1`（5 分鐘生效）、Lovable 把 7 個網域加回去、C4 反向做；02:00 前 Kenneth 拍板。
