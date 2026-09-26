# 切換後待辦清單（2026-09-26 更新）

> 9/25 凌晨切換完成：後端 = Supabase `opaphdargymfyrrzvozs`，前端 = Vercel（過渡），Lovable 舊專案只剩轉發。
> 負責：N = Nokimi，K = Kenneth。完成就打勾並寫日期。

## A. 等外部結果（追蹤即可）
- [ ] iOS 1.0.1（build 54）App Store 審核 — 9/26 已送審；退件就處理原因（N）
- [ ] 奧丁丁改打新端點（預計 10 月上旬）— 改好前 Lovable 舊專案的舊→新轉發不能停（N 追）
- [ ] 旅圖（Noah）改 AI 客服 API 端點 — 已通知；確認天送 key 的「最後使用」有更新（N）
- [ ] TapPay 測試單 MM9F86Y2 NT$35,250（recTradeId `D20260925hp4PUf`）退款 — 風控 TP36 擋，決定處理方式（K 匯款退回 / 再試 Portal 退款 / K 聯絡 TapPay）（N+K）

## B. 需要 Kenneth 決定或操作
- [ ] Emergent 匯入 `Believingkt/renke-hostel-pro` / `feat/migration-prep`（前端搬 Emergent 的起點）（K）
- [ ] 訪客無法用 ATM 下單（9/09 起既有問題）：選「要求先登入」（前端，約半天）或「ATM 改後端建單」（約 1–2 天）（K 決定）
- [ ] `charge-room-on-checkin` 排程帶 anon key 一直 401（入住日自動扣尾款從未執行）：要不要修（K 決定）
- [ ] Gemini：改用 K 的帳單並儲值、開 Auto-reload；K 帳號建新 key 換掉（K）
- [ ] Supabase org Owner 轉給 K（checklist B11）（N+K）
- [ ] GCP 專案 `lakeze` 給 K Owner（N）
- [ ] SendGrid Inbound Parse 帳號是誰的，改到新端點（K）
- [ ] Lovable 10/2 前降到 Pro US$25；通知團隊不再用 Lovable 改程式、不要按 Publish（N/K）

## C. 前端搬到 Emergent、拆三個 app
- [ ] Emergent 部署單一 app → 用 Emergent 網址驗證（深層連結、env、網域判斷、速度）（N）
- [ ] DNS 逐一切到 Emergent（hq → pms → booking → 各館），驗證後刪 Vercel 專案（N）
- [ ] Track A：revert 平台 commit、Day 2 拆分、三個 app 各自 build、逐一替換上線（E agent / N 審 / K push）

## D. 收尾（切換後第一、二週）
- [ ] Lovable 停用後把 `feat/migration-prep` 合併回 `main`，之後以 main 為準；iOS 發版腳本改回 main（N）
- [ ] 重新產生 Gemini key（曾出現在截圖）（N/K）
- [ ] Nokimi 更改 Lovable 密碼（曾外洩）（N）
- [ ] 刪除 `migration-storage-sync`、`migration-env-dump` 函式（新舊專案）與 `MIGRATION_KEY`（N）
- [ ] `callback-url-map.md` §4 安全加固（verify_jwt 等）（N）
- [ ] 移除 `process-email-queue`、`@lovable.dev/mcp-js`、`previewHost` 內的 Lovable 預覽網域（N）
- [ ] Supabase Auth Redirect URLs 移除 `*.vercel.app`（搬到 Emergent 後）（N）
- [ ] Vercel 重新部署（API 文件頁端點修正 `b7cebe37c`）— 需 `vercel login`（N）
- [ ] 刪除 GitHub `nokimi/lakeze-deploy`（N）
- [ ] Squarespace 清 `_lovable.*` TXT、`notify` NS 記錄（Lovable 停用後）（N）

## E. 每天例行（到 iOS 上架滿一週且奧丁丁切換完成）
- [ ] 舊 DB 有無新訂單（Lovable SQL editor）：`select count(*) from orders where created_at > '2026-09-24 14:14+00';`
- [ ] 新專案 Functions Logs 無 5xx 洪水、`cron.job_run_details` 無 failed

## F. 最後一步
- [ ] 以上 A 的奧丁丁 + iOS 都完成、舊 DB 一週無新流量 → Lovable 改免費或取消訂閱（K）
