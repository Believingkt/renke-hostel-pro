# 人客多（Lakeze）— 給 Claude Code 的專案說明

本檔是 agent 在這個 repo 工作時的第一手規則。README 裡提到 Lovable 的段落已過時，以本檔為準。

## 架構現況（2026-10）

- 單一前端 `apps/booking`，部署在 booking.lakeze.com。民宿後台與總部後台**不是獨立 app**，而是同一個 app 裡的路由：`/pms`（民宿後台）、`/hq/*`（總部後台），定義在 `apps/booking/src/App.tsx`。pms.lakeze.com、hq.lakeze.com 只是 301 轉址。
- `packages/shared`：共用 supabase client、types、ui、hooks。
- 後端 = Supabase 專案 `lakeze-prod`（ref `opaphdargymfyrrzvozs`，Tokyo）：`supabase/migrations` 與 `supabase/functions`。
- Lovable 與 Emergent 已停用或停用中，不要再提「同步回 Lovable」。

## 分支與部署規則（最重要）

- **絕對不要直接 push 到 `main`。** push 到 main 會觸發 GitHub Actions「Deploy Supabase Backend」：自動套用所有未套用的 migration、部署有變動的 edge function，直接動到正式資料庫。
- 一律開 `claude/<簡述>` 分支，完成後開 PR，由人審過 preview 再合併。
- migration 只能新增：禁止 `DROP`、`TRUNCATE`、`RENAME`、改欄位型別。需要破壞性變更時停下來詢問。
- 不要在對話或檔案裡要求、貼上或印出 service role key、DB 密碼、access token。
- 未 push 的改動在雲端 VM 回收後會消失；每完成一段工作就 commit 並 push 到自己的分支。

## 開發指令

```sh
yarn install
yarn dev:booking      # vite，port 8081
yarn build:apps       # 等同 build:booking，輸出 apps/booking/dist
yarn test
yarn typecheck
```

- 雲端 VM 不支援 IPv6 監聽時，用 `VITE_DEV_HOST=0.0.0.0 yarn dev:booking`（見 `apps/booking/vite.config.ts`）。
- 既有 vitest 有 7 檔約 23 個測試本來就失敗（src/ 內舊測試），與你的改動無關時不必處理。
- 套件管理用 yarn（yarn workspaces）；`bun.lock` 是歷史遺留，不要改用 bun。

## 環境變數

- repo 根 `.env` 是**刻意納入版本控制**的：只含 Supabase 專案 URL 與 publishable（anon）key、Intercom app id，皆為前端公開值。Emergent Publish 建置階段讀不到 Secrets，靠這個檔案才能建前端；在前端主機搬到 Vercel 之前**不要移除**。
- 不要把任何非公開金鑰加進 `.env`。

## 驗收

- 改到 `packages/shared` 時，booking、`/pms`、`/hq` 三處都要看過。
- 涉及付款（TapPay / PAYUNi）、訂單、ARI 推送（奧丁丁、HotelNabe）、LINE webhook 的改動，PR 說明要列出影響的 edge function 與外部回呼。
