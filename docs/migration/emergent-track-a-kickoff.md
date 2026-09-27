# Track A 開場摘要（貼給 Emergent 新任務的第一則訊息）

> 使用方式：Kenneth 在 Emergent 開新任務 → Import from GitHub → `Believingkt/renke-hostel-pro` / branch `feat/migration-prep` → 匯入完成後把下面「---」以下整段貼進對話。

---

你好，我是 Nokimi，人客多（Lakeze）系統的工程負責人。這個任務是 **Track A：前端拆成 booking / pms / hq 三個 app 的 monorepo**。請先讀完再動手。

## 專案現況（2026-09-23）
- 這是一個民宿訂房平台：`booking.lakeze.com`（訂房前台）、`pms.lakeze.com`（民宿後台）、`hq.lakeze.com`（總部後台）。React + Vite + TypeScript + Tailwind + shadcn，後端 Supabase（181 支 edge functions 在 `supabase/`）。
- 後端已經從 Lovable Cloud 搬到自有 Supabase 專案（Tokyo）。你匯入的分支 `feat/migration-prep` 已完成「去 Lovable 化」：`.env` 指向新專案、Google 登入改 `supabase.auth.signInWithOAuth`、`@lovable.dev/*` 已移除。**這些不要改回去。**
- 你的工作區裡 repo 根會被搬到 `/app/frontend/`，`supabase/` 因此會在 `/app/frontend/supabase/`。這是 Emergent 平台行為，GitHub 上仍是 repo 根。`supabase/` 目錄**完全不要碰**。
- 正式切換是 9/24（四）23:00。Track A 的成果不在切換範圍內，切換後才合併；所以不急著求快，求乾淨。

## 目標佈局（B1）
```
frontend/                  ← Emergent 工作區的 /app/frontend
  package.json             ← yarn workspaces 根
  packages/shared/         ← 共用：supabase client、types、ui、hooks、utils
  apps/booking/            ← 訂房前台（含 SEO prerender、sitemap、Capacitor iOS）
  apps/pms/                ← 民宿後台
  apps/hq/                 ← 總部後台
supabase/                  ← 不動
```

## 規矩（違反任何一條請停下來問我）
1. 所有變更推分支 **`feat/monorepo-split`**。不碰 `main`、不碰 `feat/migration-prep`。Save to GitHub 遇到衝突選 Create Branch & Push 並告訴我，**永遠不要 Force Push**。
2. **不改業務邏輯**。搬檔案、改 import 路徑、拆 package.json、調 build 設定可以；改元件行為、改 API 呼叫、改 SQL、改 edge function 不行。發現 bug 記下來告訴我，不要順手修。
3. 不需要也不會拿到任何 Supabase access token / service role key。前端只用 `.env` 裡現有的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`。
4. 每天結束（或每個里程碑）先停下來，貼 diff 摘要（動了哪些目錄、bundle 前後大小、三個 app 各自 build 是否成功），等我審過再進下一步。
5. 不要在 `.env`、`.gitignore` 以外的地方新增 Emergent 專用檔案到 repo 根；`backend/`、`.emergent/`、`memory/`、`test_result.md` 這類平台產物不要推上 GitHub（加進 .gitignore）。

## Day 1（今天）
1. 量 baseline：現在 `npm run build` 的 bundle 大小、build 時間，記下來。
2. 建 yarn workspaces 骨架：根 `package.json` + `packages/shared` + `apps/{booking,pms,hq}`，先用最小內容讓三個 app 各自能 `build` + 預覽（畫面可以先是空殼）。
3. 第一筆 commit 只做「建骨架」，第二筆做「環境修正」（Emergent 需要的 start script / allowedHosts 等），分開推。
4. 停下來貼摘要。

## Day 2（我審過 Day 1 之後）
1. 依 `src/pages` 路由把頁面搬進對應 app：`/member/*`、`/pay/*`、民宿公開頁 → booking；`/admin/*` → pms；`/hq/*` → hq。
2. 共用的 `src/integrations/supabase`、`src/components/ui`、跨 app 用到的 hooks/utils → `packages/shared`，其餘各自帶走。
3. codemod 改 import 路徑；domain guard（依網域決定進哪個 app 的邏輯）改成跨站轉址。
4. `seoPrerender`、`sitemap`、Capacitor 設定只掛在 booking。
5. 三個 app 各自 build，貼 bundle 前後對比與 diff 摘要。

有任何不確定的地方先問，不要猜。開始前請先回覆：你看到的 repo 根在哪、`.env` 裡的 `VITE_SUPABASE_URL` 是哪個 host（只要 host，不要貼 key）、以及你打算的 Day 1 第一步。
