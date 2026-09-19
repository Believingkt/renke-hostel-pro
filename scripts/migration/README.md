# 遷移腳本（Lovable Cloud → 客戶自有 Supabase）

所有腳本在 Nokimi 的 Mac 上執行，需要：`supabase` CLI ≥ 2.x、`psql`/`pg_restore`（PostgreSQL 17 client）、`deno`。
執行前 `cp migration.env.example migration.env` 填值；`migration.env` 與 `secrets.env` 已在 `.gitignore`，**絕不進 git、絕不貼進 Emergent**。

| 順序 | 檔案 | 用途 | 何時跑 |
|---|---|---|---|
| 0 | `00-preflight.sh` | 檢查工具、env、連線 | Day 1 早上 |
| 1 | `01-set-secrets.sh` | 把 `secrets.env` 批次寫入新專案 Edge Function secrets，並比對 | Day 1 |
| 2 | `02-build-schema.sh` | `supabase link` + `db push` 957 個 migration 建 schema；失敗時印出卡住的檔名 | Day 1（先在測試專案跑一次） |
| 3 | `03-schema-diff.sh` | Lovable 匯出的 schema vs 新專案 schema，正規化後 diff | Day 1 |
| 4 | `04-rebuild-cron.sh` | 從匯出資料的 `cron.job` 產生 `rebuild-cron.sql`（換 URL 與 key），套到新專案 | Day 4 切換時（資料匯入後） |
| 5 | `05-storage-sync.sh` + `../../supabase/functions/migration-storage-sync/` | 透過暫時部署在 Lovable 端的函式，把 storage 物件複製到新專案 | Day 2 先全量、Day 4 增量 |
| 6 | `06-import-data.sh` | data-only 匯入（public / auth 等），停觸發器、跳過 storage/cron/vault | Day 4 切換時 |
| 7 | `07-deploy-functions.sh` | 部署全部 181 個函式到新專案（含 config.toml 的 verify_jwt） | Day 1 |

匯出檔：Lovable 後台 Cloud → Export（每天 1 次、≤ 5 GB），存到 `migration.env` 的 `DUMP_FILE`。
