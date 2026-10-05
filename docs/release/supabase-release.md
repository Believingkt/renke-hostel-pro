# Supabase 後端發布流程（方案 B：由主系統 agent 執行）

適用：在 Emergent「人客多 - 主系統」改到 `supabase/` 底下的東西（edge function、migration）之後，要讓它上正式站。
前端（apps/、packages/）改完直接按 Publish 即可，不需要走這個流程。

## 上線順序（重要）

1. 先發布後端：`node scripts/release/supabase-release.mjs`
2. 後端成功後，再按 **Publish** 讓前端上線

順序反過來會讓新前端去呼叫還不存在的 function／資料表。

## 指令

```bash
# 預設：列出待套用的 migration 後停下（結束碼 3）、只部署有變動的 function
node scripts/release/supabase-release.mjs

# 看過 migration 內容確認無誤後，真的套用
node scripts/release/supabase-release.mjs --migrations=apply

# 只部署 function、不碰 migration
node scripts/release/supabase-release.mjs --migrations=skip

# 只看會做什麼、不真的部署
node scripts/release/supabase-release.mjs --dry-run

# 指定 function
node scripts/release/supabase-release.mjs --migrations=skip --functions=tappay-notify,send-password-reset
```

## 需要的環境變數（放在主系統沙盒的 .env，不進 git）

| 變數 | 用途 | 權限範圍 |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | 部署 edge function、連結專案 | 新版 token：限 lakeze-prod 專案、只開 Edge Functions Read-write |
| `SUPABASE_DB_PASSWORD` | 套用 migration | 正式資料庫完整權限；只在需要跑 migration 時才設定 |
| `SUPABASE_PROJECT_REF` | 預設 `opaphdargymfyrrzvozs`（正式） | 測試專案時改成測試 ref |

## 變動偵測

`supabase/.release/functions.json` 記錄每支 function 最後一次部署時的內容雜湊（含它 import 的 `_shared/*` 與 `config.toml` 的 `[functions.<name>]` 設定）。
- 第一次執行（沒有這個檔）會部署全部 function，約 10 分鐘。
- 之後只部署雜湊有變的；改到 `_shared` 會連帶部署所有引用它的 function。
- 這個檔要跟著程式一起 commit／Save to GitHub，否則下次又會全部重部署。
- 刪除 function 不會自動刪線上的，請手動處理。

## 給主系統 agent 的固定指令（同事複製貼上即可）

```
請執行後端發布：
1. 在 /app 執行 `node scripts/release/supabase-release.mjs`，把輸出原樣貼給我。
2. 若結束碼是 3（有待套用的 migration），把列出的 SQL 原樣貼給我，然後停下來等我回覆「確認套用」；
   我回覆後再執行 `node scripts/release/supabase-release.mjs --migrations=apply`。
3. 若任一步驟失敗，停下來回報錯誤，不要自行修改 supabase/ 底下的檔案或重試。
4. 全部成功後回報「後端發布完成」，不要按 Publish、不要 Save to GitHub、不要 push。
```

## 失敗處理

- migration 套用失敗：資料庫可能處於半套用狀態，請通知 Nokimi，不要重跑。
- function 部署失敗：已成功的批次會記進 manifest，修正後重跑只會補部署剩下的。
- 需要退回：function 用 `git checkout <舊 commit> -- supabase/functions/<name>` 後重跑；migration 需另寫反向 migration。
