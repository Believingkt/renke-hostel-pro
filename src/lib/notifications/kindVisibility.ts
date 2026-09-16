/**
 * 「通知事件類型」設定面板的可見性：
 * 只列出這個角色真的可能收到的事件，避免出現一堆開了也永遠沒東西的開關。
 */

import { GAP_AUDIENCE, type GapKey } from "@/lib/settingsGapLinks";
import {
  COMMISSION_REVIEW_ROLES,
  KOL_NOTIFY_ROLES,
  KOL_QUALIFICATION_ROLES,
} from "./roles";

function hasRole(roles: string[], allowed: string[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

/** 是否至少有一項設定缺口會通知這個角色 */
export function hasAnyGapAudience(roles: string[]): boolean {
  if (hasRole(roles, ["super_admin", "admin"])) return true;
  return (Object.keys(GAP_AUDIENCE) as GapKey[]).some((k) =>
    hasRole(roles, GAP_AUDIENCE[k].roles),
  );
}

/** 單一事件類型是否應顯示在設定面板 */
export function isKindVisibleForRoles(kind: string, roles: string[]): boolean {
  switch (kind) {
    case "settings-gap":
      return hasAnyGapAudience(roles);
    case "kol-qualification":
      return hasRole(roles, KOL_QUALIFICATION_ROLES);
    case "kol-publish-overdue":
    case "kol-publish-today-pending":
    case "kol-publish-today-uploaded":
    case "kol-cid-missing":
      return hasRole(roles, KOL_NOTIFY_ROLES);
    case "commission-exclusion-review":
      return hasRole(roles, COMMISSION_REVIEW_ROLES);
    default:
      // 未登記的新事件一律顯示，避免漏掉
      return true;
  }
}

export function visibleNotificationKinds<T extends { kind: string }>(
  kinds: readonly T[],
  roles: string[],
): T[] {
  return kinds.filter((k) => isKindVisibleForRoles(k.kind, roles));
}
