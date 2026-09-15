// Server-side authorization contract for `create-user`.
//
// SECURITY (P0): `create-user` writes `user_roles` with a service-role client,
// which bypasses RLS ("Only super_admin can grant super_admin") and the
// `prevent_role_escalation` trigger (that trigger short-circuits when
// `auth.uid()` is NULL). Therefore the requested role MUST be authorized here,
// in the edge function itself, BEFORE any persistent side effect.
//
// This module is pure (no network, no Deno APIs) so it can be unit tested.

export type CreatableRole = "super_admin" | "hotel_admin" | "staff";

/** Roles that only a super_admin caller may grant. */
export const SUPER_ADMIN_ONLY_ROLES: ReadonlySet<string> = new Set<string>([
  "super_admin",
]);

/** Roles an accommodation admin (hotel_admin of that accommodation) may grant. */
export const ACCOMMODATION_ADMIN_GRANTABLE_ROLES: ReadonlySet<string> = new Set<string>([
  "hotel_admin",
  "staff",
]);

export interface RoleGrantContext {
  /** Caller authenticated with the service-role key (trusted server-to-server). */
  isServiceRole: boolean;
  /** Caller holds `super_admin` (global / any accommodation). */
  isSuperAdmin: boolean;
  /** Caller is super_admin or hotel_admin of the TARGET accommodation. */
  isTargetAccommodationAdmin: boolean;
}

export type RoleGrantDecision =
  | { allowed: true }
  | { allowed: false; status: 403; error: string };

/**
 * Decide whether `ctx` may grant `requestedRole` on the target accommodation.
 *
 * Contract:
 *  - service-role                       → allowed (trusted backend)
 *  - requestedRole = super_admin        → super_admin callers only
 *  - requestedRole = hotel_admin/staff  → admin of the TARGET accommodation
 *                                         (cross-accommodation is denied because
 *                                          `isTargetAccommodationAdmin` is scoped)
 *  - anything else                      → denied
 *
 * Error messages are intentionally generic: they never expose caller id,
 * role rows, policy detail, or service-role information.
 */
export function authorizeRoleGrant(
  requestedRole: string,
  ctx: RoleGrantContext,
): RoleGrantDecision {
  if (ctx.isServiceRole) return { allowed: true };

  if (SUPER_ADMIN_ONLY_ROLES.has(requestedRole)) {
    return ctx.isSuperAdmin
      ? { allowed: true }
      : { allowed: false, status: 403, error: "此操作僅限超級管理員" };
  }

  if (ACCOMMODATION_ADMIN_GRANTABLE_ROLES.has(requestedRole)) {
    return ctx.isTargetAccommodationAdmin
      ? { allowed: true }
      : { allowed: false, status: 403, error: "需要管理員權限" };
  }

  return { allowed: false, status: 403, error: "無效的角色" };
}
