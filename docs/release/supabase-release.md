# Supabase 後端發布流程

適用：在 Emergent「人客多 - 主系統」改到 `supabase/` 底下的東西（edge function、migration）之後，要讓它上正式站。
前端（apps/、packages/）改完直接 Save to GitHub + Publish 即可。

## 為什麼不能只按 Publish

Emergent 客服確認（2026-10-05）：
- Publish 只會 `yarn build:apps` 建 `apps/booking/dist` 的靜態前端，**不跑任何後端步驟**，也不能加 pre-build step。
- Build 時拿不到 Manage → Secrets，網路也只開 npm registry；Supabase CLI／5432 連線不是支援的用法。
- Publish 是用 Emergent workspace 當下的檔案建，不是從 GitHub 拉，所以 Publish 和 GitHub Actions 互不觸發。

因此後端交給 GitHub Actions（`.github/workflows/deploy-edge-functions.yml`）全自動處理。

## 團隊日常流程（Norris／dudu）

1. 在主系統改完功能
2. **Save to GitHub**（分支 `production`）
3. GitHub Actions「Deploy Supabase Backend」自動跑（每次 Save 都會跑，團隊不用看）
   - 有改 `supabase/migrations/` → 自動套用 migration
   - 有改 `supabase/functions/` → 自動部署有變動的 function（改 `_shared` 會連帶部署引用它的）
   - 沒改 `supabase/` → 兩步都略過
   - 任一步失敗 → LINE 推播給 Nokimi（`notify-failure` job）
4. 接著按 **Publish**

順序反過來會讓新前端去呼叫還不存在的 function／資料表。

## GitHub 需要的設定（Settings → Secrets and variables → Actions）

| Secret | 用途 | 權限範圍 |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | 部署 edge function | 限 lakeze-prod 專案、只開 Edge Functions Read-write；有效期一年，到期前要換 |
| `SUPABASE_DB_PASSWORD` | 套用 migration（直接連資料庫，不需要 link） | 正式資料庫完整權限 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 失敗通知：人客多 LINE 管家 Messaging API token | 可用該官方帳號推播 |
| `LINE_NOTIFY_TO` | 失敗通知收件人的 LINE userId（Nokimi） | — |

這兩個值只放 GitHub Secrets，**不要放進 Emergent、不要放進 .env**（根目錄 `.env` 在 git 裡且會被 build 讀取）。

## 手動執行（Actions → Deploy Supabase Backend → Run workflow）

- `functions`：要部署的 function 名稱，空白分隔；可留空
- `apply_migrations`：勾選才會套用尚未套用的 migration

用途：新分支／force push 後 workflow 無法比對差異時，或要重部署某支 function。

## Nokimi 本機工具：`scripts/release/supabase-release.mjs`

不走 GitHub Actions、直接從本機發布時用（例如要先看 migration SQL 再決定、或一次重部署全部 function）。

```bash
export SUPABASE_ACCESS_TOKEN=...   # 不要寫進任何檔案
export SUPABASE_DB_PASSWORD=...
clear

node scripts/release/supabase-release.mjs                     # 列出待套用 migration 後停下（結束碼 3）、只部署有變動的 function
node scripts/release/supabase-release.mjs --migrations=apply  # 確認後真的套用
node scripts/release/supabase-release.mjs --migrations=skip   # 只部署 function
node scripts/release/supabase-release.mjs --dry-run           # 只看會做什麼
node scripts/release/supabase-release.mjs --migrations=skip --functions=tappay-notify,send-password-reset
```

其他環境變數：`SUPABASE_DB_REGION`（預設 `ap-northeast-1`）、`SUPABASE_PROJECT_REF`（預設 `opaphdargymfyrrzvozs`）、`SUPABASE_DB_URL`（直接覆蓋連線字串）、`SUPABASE_CLI`（預設 `npx -y supabase@2.117.0`）。

變動偵測記在 `supabase/.release/functions.json`（每支 function 內容雜湊，含 `_shared` 與 `config.toml` 設定）；第一次執行會部署全部 function。這個檔只給本機工具用，GitHub Actions 是用 git diff 判斷。

## 失敗處理

- migration 套用失敗：workflow 會停在 migrate job，function 不會部署；資料庫可能處於半套用狀態，請通知 Nokimi，**不要重跑、不要 Publish**。
- function 部署失敗：修正後再 Save to GitHub 一次即可，或手動執行指定 function。
- 需要退回：function 用 `git checkout <舊 commit> -- supabase/functions/<name>` 後再 Save to GitHub；migration 需另寫反向 migration。
- 不會自動刪線上 function；刪除請手動處理。
