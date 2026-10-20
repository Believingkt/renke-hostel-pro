import type { TeamRole } from "@lakeze/shared/components/team/teamConfig";
import { merStatusLabel } from "@/lib/payuniMerchantRules";

/** team_onboarding_overview() 一列 */
export interface OnboardingRow {
  accommodation_id: string;
  accommodation_name: string;
  is_active: boolean;
  first_activated_at: string | null;
  responsible_member_id: string | null;
  responsible_name: string | null;
  responsible_since: string | null;
  am_not_required: boolean;
  am_total: number;
  am_with_access: number;
  am_missing_names: string[] | null;
  other_hotel_admin_names: string[] | null;
  other_hotel_admin_unnamed: number;
  kol_venue_id: string | null;
  kol_venue_active: boolean | null;
  kol_venue_has_settings: boolean;
  kol_quota_this_month: number;
  payment_provider_active: string | null;
  payuni_mer_id: string | null;
  payuni_mer_status: number | null;
}

/** team_onboarding_am_members() 一列 */
export interface OnboardingAmMember {
  member_id: string;
  user_id: string;
  display_name: string;
  is_am_manager: boolean;
  can_be_responsible: boolean;
}

export type OnbLevel = "ok" | "warn" | "muted";
export interface OnbStatus {
  level: OnbLevel;
  label: string;
}

export type VenueStage = "live" | "setup" | "inactive";

const has = (roles: string[], allow: string[]) => roles.some((r) => allow.includes(r));

export const ONBOARDING_VIEW_ROLES = ["super_admin", "admin", "finance", "am", "am_manager", "scout_manager", "closer_manager"];
export const canViewOnboarding = (roles: TeamRole[] | string[]) => has(roles as string[], ONBOARDING_VIEW_ROLES);
export const canAssignAm = (roles: TeamRole[] | string[]) => has(roles as string[], ["super_admin", "admin", "am_manager"]);
export const canEditKolQuota = (roles: TeamRole[] | string[]) =>
  has(roles as string[], ["super_admin", "admin", "scout_manager", "am", "am_manager"]);
export const canManageKolVenue = (roles: TeamRole[] | string[]) => has(roles as string[], ["super_admin", "admin", "scout_manager"]);

export function venueStage(r: Pick<OnboardingRow, "is_active" | "first_activated_at">): VenueStage {
  if (r.is_active) return "live";
  return r.first_activated_at ? "inactive" : "setup";
}

export const STAGE_LABEL: Record<VenueStage, string> = { live: "開賣中", setup: "上架中", inactive: "已停用" };

export function amStatus(r: OnboardingRow): OnbStatus {
  if (r.responsible_name) return { level: "ok", label: r.responsible_name };
  if (venueStage(r) === "inactive") return { level: "muted", label: "已停用（不需指定）" };
  if (r.am_not_required) return { level: "ok", label: "不需要負責 AM" };
  return { level: "warn", label: "未指定負責 AM" };
}

/** 負責 AM 下拉三種狀態：尚未指定（預設，會提醒）／不需要負責 AM（不提醒）／指定某位 AM（member_id） */
export const AM_PICK_PENDING = "__pending__";
export const AM_PICK_NOT_REQUIRED = "__not_required__";
export const currentAmPick = (r: Pick<OnboardingRow, "responsible_member_id" | "am_not_required">) =>
  r.responsible_member_id ?? (r.am_not_required ? AM_PICK_NOT_REQUIRED : AM_PICK_PENDING);

/** 儲存下拉選擇要依序呼叫的既有 RPC：指定 AM 會自動清掉「不需要」；改成尚未指定／不需要時先取消負責人 */
export function amSaveSteps(
  r: Pick<OnboardingRow, "accommodation_id" | "responsible_member_id" | "am_not_required">, pick: string,
): Array<[string, Record<string, unknown>]> {
  const acc = r.accommodation_id;
  if (pick !== AM_PICK_PENDING && pick !== AM_PICK_NOT_REQUIRED) {
    return [["team_set_responsible_am", { _accommodation_id: acc, _member_id: pick }]];
  }
  const steps: Array<[string, Record<string, unknown>]> = [];
  if (r.responsible_member_id) steps.push(["team_set_responsible_am", { _accommodation_id: acc, _member_id: null }]);
  const want = pick === AM_PICK_NOT_REQUIRED;
  if (r.am_not_required !== want) steps.push(["team_set_am_not_required", { _accommodation_id: acc, _value: want }]);
  return steps;
}

export function accessStatus(r: OnboardingRow): OnbStatus {
  if (venueStage(r) === "inactive") return { level: "muted", label: "停用館別不同步" };
  if (r.am_total === 0) return { level: "muted", label: "目前沒有 AM" };
  if (r.am_with_access >= r.am_total) return { level: "ok", label: `${r.am_with_access}/${r.am_total} 已開` };
  return { level: "warn", label: `缺 ${r.am_total - r.am_with_access} 位` };
}

export function kolStatus(r: OnboardingRow): OnbStatus {
  if (!r.kol_venue_id) return { level: "warn", label: "未建立 KOL 場域" };
  if (r.kol_venue_active === false) return { level: "warn", label: "KOL 場域已停用" };
  if (!r.kol_venue_has_settings) return { level: "warn", label: "未設定邀約規則" };
  return { level: "ok", label: "已建立" };
}

export function quotaStatus(r: OnboardingRow): OnbStatus {
  return r.kol_quota_this_month > 0
    ? { level: "ok", label: `本月 ${r.kol_quota_this_month}` }
    : { level: "warn", label: "本月未設定" };
}

export function payuniStatus(r: OnboardingRow): OnbStatus {
  const store = merStatusLabel(r.payuni_mer_status);
  if (r.payment_provider_active === "payuni") return { level: "ok", label: `使用 PAYUNi（${store}）` };
  if (r.payuni_mer_status != null && [8, 91, 92].includes(r.payuni_mer_status)) {
    return { level: "warn", label: `PAYUNi ${store}` };
  }
  const provider = r.payment_provider_active === "none" ? "未啟用金流" : "TapPay";
  return { level: r.payment_provider_active === "none" ? "warn" : "ok", label: `${provider}（PAYUNi ${store}）` };
}

/** 總覽列需要處理的項目數（已停用館別不計） */
export function pendingCount(r: OnboardingRow, otherGapCount: number): number {
  if (venueStage(r) === "inactive") return 0;
  const items = [amStatus(r), accessStatus(r), kolStatus(r), quotaStatus(r), payuniStatus(r)];
  return items.filter((s) => s.level === "warn").length + otherGapCount;
}

export const END_REASON_LABEL: Record<string, string> = {
  replaced: "改由他人負責",
  cleared: "取消負責人",
  accommodation_inactive: "館別停用自動取消",
  member_not_eligible: "成員不再具 AM 資格",
};
