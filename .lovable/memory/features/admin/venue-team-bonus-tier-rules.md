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
- UI：HQ 整合頁 `/hq/bonus-settings?tab=venue-tiers`，含館別總覽（已設獨立規則／沿用系統費率）、版本列表切換、新增與跨館複製；super_admin/admin 可編輯，finance 唯讀。
- 預覽：`VenueTierRulePreview` 可選館別／獎金類型／資料月，手動輸入或自快照抓取基準營收，即時顯示命中級距與該館獎金貢獻（純試算，不寫快照）。
- 審計：`venue_team_bonus_tier_rule_logs` 由 trigger 自動記錄 create/update/delete 的操作者、時間與 tiers 前後；UI 另以 `tier_rule_id` 反查已被哪些資料月快照採用。
