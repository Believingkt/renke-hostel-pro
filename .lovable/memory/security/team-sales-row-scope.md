---
name: Team Sales Row Scope (Franchise / Starlink)
description: franchise_orders 與 starlink_orders 的 SELECT 列級可見範圍契約，以及待辦的前端 scope 對齊。
type: feature
---

# 正式契約（2026-08-30 Team-RLS P0 起生效）

- 一般業務（`franchise_internal`、`starlink` 等 rep 角色）：只能 SELECT `sold_by = auth.uid()` 的自有訂單。
- 角色本身（global team role）**不等於** 全表列存取權。不得再新增「只要有某 rep 角色就看全表」的 SELECT policy。
- 保留完整視野：`franchise_manager`（franchise）、`finance`、`admin`、`super_admin`；`franchise_external` 維持既有 external-scoped policy。
- `franchise_manager` 只影響 `franchise_orders`，不得影響 `starlink_orders`。
- 寫入契約（INSERT/UPDATE/DELETE）未變更。

已移除的越權 policy：
- `franchise_orders` 的 `franchise_internal can view internal sales`（role-only 全表）
- `starlink_orders_select` 中的 `OR user_has_team_role(...,'starlink')` 分支

# TEAM_REP_FRONTEND_SCOPE_ALIGNMENT（待辦，尚未執行）

`TeamFranchise.tsx` / `TeamStarlink.tsx` 仍做全表 query，目前由 RLS 自動收斂為 own-only。
路由 `/team/franchise`、`/team/starlink` 維持一般 rep 可進入（不改 manager-only）。
後續 UX phase 應補：rep → own-only view，manager/admin → team-wide view。
