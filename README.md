# renke-hostel-pro

請根據上傳的第一張架構圖，製作出一個名為 人客多 PMS 管理系統 的民宿旅館管理後台網站。
設計風格與介面配色請參照後面上傳的畫面圖片。

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://renke-hostel-pro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8d9d267e-a00c-4a5b-82fc-c8e538340567).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Monorepo（yarn workspaces）：

```
packages/shared/   共用：supabase client、types、ui、hooks、utils、Tailwind preset
apps/booking/      訂房前台 booking.lakeze.com（含 SEO prerender、sitemap、Capacitor iOS）
apps/pms/          民宿後台 pms.lakeze.com
apps/hq/           總部後台 hq.lakeze.com
supabase/          Edge functions 與 migrations
```

```sh
yarn install
yarn dev:booking   # 或 dev:pms / dev:hq
yarn build:apps    # 三個 app 各自輸出到 apps/*/dist
yarn test          # 由 repo 根執行所有 workspace 的 vitest
yarn typecheck
```

環境變數（`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`）由 repo 根 `.env` 提供，三個 app 的 `envDir` 皆指向根目錄。
