# CLAUDE.md

人客多 PMS：民宿訂房前台與管理後台。本檔給在這個 repo 工作的 Claude Code session（含組織成員各自開的雲端 session）共用。

## 結構

yarn workspaces monorepo：

```
packages/shared/   共用：supabase client、types、ui、hooks、utils、Tailwind preset
apps/booking/      訂房前台 booking.lakeze.com（含 SEO prerender、sitemap、Capacitor iOS）
supabase/          Edge functions（functions/）與 migrations（migrations/）
scripts/           SQL 稽核、migration、release、CI 輔助腳本
docs/  plan/       規格與設計文件
roadmap.md         進行中／已完成／待辦清單
```

README 提到的 `apps/pms`、`apps/hq` 目前不在 repo 裡。

## 常用指令

```sh
yarn install          # 雲端 session 由 .claude/hooks/session-start.sh 自動執行
yarn lint             # eslint
yarn test             # 由 repo 根跑所有 workspace 的 vitest
yarn vitest run <檔案>  # 只跑單一測試檔
yarn typecheck
yarn dev:booking
yarn build:apps
```

- 套件管理一律用 **yarn**（以 `yarn.lock` 為準）。repo 裡另有 `package-lock.json`、`bun.lock*`，不要用 npm／bun 安裝。
- 前端環境變數（`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`）在 repo 根 `.env`，只放可公開的 publishable key。

## ⚠️ 正式環境：push 到 main 會自動部署

`.github/workflows/deploy-edge-functions.yml`：**每次 push 到 `main`** 都會對正式 Supabase（`opaphdargymfyrrzvozs`）
套用有變動的 migration（`supabase db push`），並部署有變動的 edge function。

- 不要直接 push 到 `main`；在自己的分支工作，開 PR 由人審核後合併。
- 新增 migration 前先確認可重複執行與 rollback 方式；不要修改已上線的 migration 檔。
- 不要碰正式資料庫；驗證在本機完成。
- 機密（Supabase access token、DB 密碼、LINE token）只放 GitHub Secrets，絕不寫進 `.env` 或任何 commit。

## 協作慣例

- 文件、註解、commit 訊息使用**繁體中文**。
- commit 訊息格式：標題 `## <主題>：<結果>（目前狀態，例如：只在本機完成，未上線）`，內文說明改了什麼、為什麼、怎麼驗證的（測試結果、檢查 SQL）。
- 狀態要誠實寫清楚：本機完成／已部署／已上線不可混用。
- 完成或新增待辦時同步更新 `roadmap.md`。
