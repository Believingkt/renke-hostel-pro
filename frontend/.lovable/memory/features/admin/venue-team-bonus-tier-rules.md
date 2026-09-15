---
name: Venue Team Bonus Tier Rules
description: 館別專屬團隊獎金階層級距規則（venue_team_bonus_tier_rules）：整筆套用、逐館算完再除人數、不回溯。
type: feature
---

# 館別獎金級距規則

- 表：`venue_team_bonus_tier_rules`（`accommodation_id` + `bonus_type` + `effective_from` 版本制，append-only）
  - `bonus_type` 僅限 `am_performance` / `am_manager` / `closer_performance`
  - `tiers` jsonb：`[{ min_revenue, rate }]`，**整筆套用（flat），非超額累進**；營收低於最低門檻 → 該館貢獻 0（AM 總管第一階常設 rate = 0）
- 判定：有規則的館用級距，查無規則的館 fallback 回 `teamcommission_bonus_rate_settings` 系統費率，同一期快照可混算。
- `am_manager` / `closer_performance`：**先逐館算成池，再 ÷ 人數 × 在職比例**（原除法邏輯不變）。
- 版本切點以資料月對齊（asOf = 資料月 1 日）；生效日晚於資料月 1 日 → 該資料月仍用舊制。不回溯，只影響未來未定案期別。
- 快照 `teamcommission_bonus_snapshot_lines` 記錄 `tier_rule_id` / `tier_min_revenue` / `tier_rate`，凍結後不隨規則變動。
- 營收基準沿用現行來源白名單口徑（舊制），與住房率統計完全脫鉤。
- UI：HQ 整合頁 `/hq/bonus-settings?tab=venue-tiers`，含館別總覽、版本列表切換、以此版本為基礎新增與跨館複製；super_admin/admin 可編輯，finance 唯讀。
- UI 編輯模型：**一館一生效日＝一個版本**，門檻只定義一次，三種獎金各一欄費率（矩陣式整表編輯，手機改每階一卡）。每種獎金有「使用本館級距／沿用系統費率」開關，關閉即不建立該 row → fallback 系統費率。存檔防呆：門檻為 0 以上數字且不重複、啟用類型費率 0–100、至少啟用一種。舊資料若三類門檻不一致，以聯集顯示並標示「門檻不一致」。刪除版本＝刪同館別同生效日的所有 row。
- 級距套用預覽功能已移除，不要再加回。

- 審計：`venue_team_bonus_tier_rule_logs` 由 trigger 自動記錄 create/update/delete 的操作者、時間與 tiers 前後；UI 另以 `tier_rule_id` 反查已被哪些資料月快照採用。
