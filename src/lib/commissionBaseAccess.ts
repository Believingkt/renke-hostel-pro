/**
 * 分潤基準金額（order_meta.team_commission_price）編輯權限 — 前端唯一判定來源。
 *
 * ⚠️ 必須與 DB trigger public.enforce_order_meta_commission_fields() 語意一致：
 *  - super_admin / admin / finance（團隊角色，accommodation_id IS NULL；super_admin 不分館）→ 全域可編輯
 *  - closer / closer_manager → 僅限「自己負責」的訂單（order_meta.closer_id = auth.uid()）
 *    · UPDATE：OLD.closer_id 與 NEW.closer_id 都必須是自己
 *    · INSERT：NEW.closer_id 必須是自己
 *  - 其他角色（含 hotel_admin / staff）→ DENY
 *  - force_commission_eligible：維持既有 can_force（closer_manager 及管理層）
 *  - commission rate 欄位：僅管理層
 */

export interface TeamRoleRow {
  role: string;
  accommodation_id: string | null;
}

export interface TeamRoleFlags {
  isSuperAdmin: boolean;
  isFinancialAdmin: boolean;
  isCloserRole: boolean;
  canForceCommission: boolean;
}

/** 對齊 DB public.user_has_team_role()：團隊角色只認 accommodation_id IS NULL 的列 */
export function resolveTeamRoleFlags(rows: TeamRoleRow[]): TeamRoleFlags {
  const isSuperAdmin = rows.some((r) => r.role === "super_admin");
  const teamRoles = rows.filter((r) => r.accommodation_id === null).map((r) => r.role);
  const has = (role: string) => isSuperAdmin || teamRoles.includes(role);
  return {
    isSuperAdmin,
    isFinancialAdmin: isSuperAdmin || has("admin") || has("finance"),
    isCloserRole: has("closer") || has("closer_manager"),
    canForceCommission: isSuperAdmin || has("admin") || has("finance") || has("closer_manager"),
  };
}

export interface CommissionPriceAccessInput {
  isFinancialAdmin: boolean;
  isCloserRole: boolean;
  currentUserId: string | null;
  /** DB 現況的成交人（order_meta.closer_id）；尚無 order_meta 時為 null */
  existingCloserId: string | null;
  /** 即將寫入的成交人（表單值） */
  nextCloserId: string | null;
}

export function canEditCommissionBase({
  isFinancialAdmin,
  isCloserRole,
  currentUserId,
  existingCloserId,
  nextCloserId,
}: CommissionPriceAccessInput): boolean {
  if (isFinancialAdmin) return true;
  if (!isCloserRole || !currentUserId) return false;
  const ownerOk = existingCloserId === null || existingCloserId === currentUserId;
  return ownerOk && nextCloserId === currentUserId;
}
