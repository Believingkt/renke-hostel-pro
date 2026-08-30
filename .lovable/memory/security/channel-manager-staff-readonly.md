---
name: Channel Manager Staff Readonly (Phase 2C)
description: 通路管理 Staff 一律唯讀（前端），以及三項尚未收斂的後端授權 follow-up 標記。
type: constraint
---

## 產品規則（Phase 2C 已生效，frontend）
- Channel Manager（OTA / OwlTing / 台灣旅圖 / credential / endpoint / mapping / email owner / alias）
  **只有 hotel_admin / super_admin 可編輯**。Staff 一律 VIEW / READONLY。
- 判斷語意用 `useStaffPermissions().isAdmin`（`isChannelManagerAdminEditable`），
  **不得**再用 `canEdit("channel_manager")` 當寫入判斷——權限表仍殘留 38 筆舊 editable rows（未清理，故意保留）。
- `StaffPermissionsDialog` 的 channel_manager 已停用 editable 選項（只留 hidden / readonly）。
- OTA channels 預設 seeding（loadChannels 的 insert）只在 admin 執行；Staff 開頁 DB write = 0。

## 尚未處理的後端授權缺口（frontend 收斂 ≠ DB 安全完成）
- `CHANNEL_MANAGER_MAPPING_RLS_FOLLOWUP`：`external_hotel_mappings` RLS 仍是
  `user_has_access_to_accommodation`（Staff DB 層仍可寫）。本階段刻意不收緊，避免誤傷既有 integration。
- `OWL_TING_ALIAS_FIELD_AUTH_GAP`：`accommodation_info.owlting_aliases` 屬 Channel Manager 設定，
  但 RLS 走 accommodation_info 整表（website_content staff 仍可能寫）。未來選項：admin-only RPC /
  獨立 alias table / 專用 Edge write path / 欄位級授權。
- `EDGE_AUTH_FOLLOWUP`（SECURITY REVIEW REQUIRED）：
  - `owlting-fillup-issue` / `owlting-selfpush-link` / `owlting-email-reparse-dates`
    server-side 允許 admin **或** staff `channel_manager=editable` → 仍比新產品規則寬。
  - `search-external-rooms`（台灣旅圖測試連線）**無** admin 授權檢查。
