# renke-hostel-pro

請根據上傳的第一張架構圖，製作出一個名為 人客多 PMS 管理系統 的民宿旅館管理後台網站。
設計風格與介面配色請參照後面上傳的畫面圖片。

> 開發工具與分支規則請先讀 [`CLAUDE.md`](./CLAUDE.md)。本專案已脫離 Lovable；push 到 `main` 會觸發 GitHub Actions 自動部署 Supabase 後端。

## Development

Monorepo（yarn workspaces）：

```
packages/shared/   共用：supabase client、types、ui、hooks、utils、Tailwind preset
apps/booking/      唯一前端 booking.lakeze.com（訂房前台 + /pms 民宿後台 + /hq 總部後台；含 SEO prerender、sitemap、Capacitor iOS）
supabase/          Edge functions 與 migrations（push main 後由 GitHub Actions 自動部署）
```

```sh
yarn install
yarn dev:booking   # port 8081；雲端 VM 可加 VITE_DEV_HOST=0.0.0.0
yarn build:apps    # 輸出到 apps/booking/dist
yarn test          # 由 repo 根執行所有 workspace 的 vitest
yarn typecheck
```

環境變數（`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`）由 repo 根 `.env` 提供，app 的 `envDir` 指向根目錄（此檔只含公開值，刻意納入版本控制）。
