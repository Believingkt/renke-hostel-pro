# KOL 舊資料清理：主欄位塞了多個連結

前提：已套用 migration `20261018110000`（other_links）。`20261018110001`（搜尋）可以之後再套。

1. **掃描（唯讀）**：在 Supabase SQL Editor 執行 `01_scan.sql`，把第 2 段 `scan_json` 那一格的內容存成 `docs/kol-1/legacy-links/scan.json`（這個位置已排除在 Git 之外）。
2. **產生預覽**：`bash docs/kol-1/legacy-links/build.sh docs/kol-1/legacy-links/scan.json`
   會產生 `out/preview.csv`（用 Excel 打開，可以看每筆怎麼拆）和 `out/02_apply.sql`。這一步不會連資料庫。
3. **確認後執行**：確認 preview.csv 沒問題後，在 SQL Editor 執行 `out/02_apply.sql`。結果表會列出每筆是「已更新」還是「略過」，以及略過的原因。
4. **檢查**：執行 `04_postcheck.sql`。
5. **需要還原時**：執行 `03_rollback.sql`。只會還原清理後沒有再被人改過連結的紀錄。

- 狀態寫「原主連結 … 會被取代」或「沒有 IG」的紀錄請特別確認。
- 結果是「略過（已還原這筆）」、原因寫「其他欄位會被系統連動修改」的紀錄，代表舊名稱等欄位還沒套用新規則。請到後台打開這筆再按儲存，表單會自動拆開連結。
- 清理後 updated_by 會變成空白（SQL Editor 沒有登入者），updated_at 不會變。

注意：`scan.json` 和 `out/` 裡有正式資料，不要加進 Git。
