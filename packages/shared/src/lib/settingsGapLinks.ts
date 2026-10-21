/**
 * 設定完整性儀表板：缺漏格子 → 設定頁跳轉連結。
 * 抽成純函式方便測試，並確保 tab／acc／focus 三個參數一致。
 *
 * 同時作為「小鈴鐺通知」的單一真相來源：
 * 每個缺口對應「該通知哪些角色」與「該角色真正能編輯的位置」。
 */

export type GapKey =
  // Ragic 收入寫入群組
  | "partnership"
  | "settlementRule"
  | "marketingFee"
  | "bookingSetting"
  | "legacyRate"
  // 獎金發放（館別維度）
  | "teamBonusFlag"
  | "closerFlag"
  | "payoutBasis"
  | "closerRate"
  | "videoRate"
  | "amScope"
  | "venueClosing"
  | "tierRule"
  | "kolQuota"
  // 獎金發放（全站維度）
  | "globalBonus"
  | "scoutTier"
  | "scoutSalary";

/** 業主月結頁可被 focus 捲動的卡片區塊 */
export type OwnerSettlementFocus = "service-fee" | "marketing-fee" | "history";

export const OWNER_SETTLEMENT_FOCUS_VALUES: OwnerSettlementFocus[] = [
  "service-fee",
  "marketing-fee",
  "history",
];

interface GapTarget {
  tab: "bonus" | "owner-settlement" | "venue-tiers" | null;
  focus?: OwnerSettlementFocus;
  /** 該頁面不需要 acc 參數（全站設定） */
  noAcc?: boolean;
}

export const GAP_TARGETS: Record<GapKey, GapTarget> = {
  // 合作期間的維護 UI 在「獎金發放規則（4 步流程）」第 ① 步
  partnership: { tab: "bonus" },
  settlementRule: { tab: "owner-settlement", focus: "service-fee" },
  marketingFee: { tab: "owner-settlement", focus: "marketing-fee" },
  // 訂房設定在各館後台，HQ 沒有對應頁
  bookingSetting: { tab: null },
  legacyRate: { tab: "owner-settlement", focus: "history" },

  teamBonusFlag: { tab: "bonus" },
  closerFlag: { tab: "bonus" },
  payoutBasis: { tab: "bonus" },
  closerRate: { tab: "bonus" },
  videoRate: { tab: "bonus" },
  // 負責 AM 在團隊「館別設定總覽」指定，HQ 設定頁沒有對應卡片
  amScope: { tab: null },
  venueClosing: { tab: "bonus" },
  tierRule: { tab: "venue-tiers", noAcc: true },
  // 互惠額度在 KOL 星探頁
  kolQuota: { tab: null },

  globalBonus: { tab: "bonus", noAcc: true },
  scoutTier: { tab: null },
  scoutSalary: { tab: null },
};

/** 產生 HQ 設定頁連結；沒有對應 HQ 頁面時回傳 null */
export function buildGapHref(key: GapKey, accId?: string): string | null {
  const target = GAP_TARGETS[key];
  if (!target.tab) return null;
  const params = new URLSearchParams();
  params.set("tab", target.tab);
  if (!target.noAcc && accId) params.set("acc", accId);
  if (target.focus) params.set("focus", target.focus);
  return `/hq/bonus-settings?${params.toString()}`;
}

export function parseOwnerSettlementFocus(raw: string | null): OwnerSettlementFocus | null {
  return OWNER_SETTLEMENT_FOCUS_VALUES.includes(raw as OwnerSettlementFocus)
    ? (raw as OwnerSettlementFocus)
    : null;
}

/* ------------------------------------------------------------------ *
 * 小鈴鐺通知：角色 × 缺口 → 該角色能編輯的位置
 * ------------------------------------------------------------------ */

/** 只有這些角色能開 /hq/bonus-settings（HQAdminGuard） */
export const HQ_ROLES = ["super_admin", "admin", "finance"];

/** 團隊路徑的設定頁（不需 HQ 權限） */
export const TEAM_ONBOARDING = "/team/onboarding";
const TEAM_KOL_QUOTA = "/team/kol?tab=reciprocal_quota";
const TEAM_KOL_SETTINGS = "/team/kol?tab=settings";

/**
 * 角色對照表（單一真相來源）：每個缺口「實際能寫入」的角色＝資料表 RLS／RPC 檢查 ∩ 有編輯畫面。
 * 小鈴鐺通知、總覽待處理、館別頁「你要設定的」都只看這份；其他角色一律算「由其他人設定」。
 */
export const GAP_WRITE_ROLES: Record<GapKey, string[]> = {
  // accommodation_partnership_periods RLS：is_super_admin
  partnership: ["super_admin"],
  // owner_settlement_pricing_rules RLS：super_admin／該館 hotel_admin／am、am_manager（is_am_team）／admin（can_fix_pricing_rule_date）
  settlementRule: ["super_admin", "admin", "am", "am_manager", "hotel_admin"],
  marketingFee: ["super_admin", "admin", "am", "am_manager", "hotel_admin"],
  // booking_settings RLS：super_admin／該館 hotel_admin（各館後台）
  bookingSetting: ["super_admin", "hotel_admin"],
  // consulting_fee_settings 已停用，只由總部清理
  legacyRate: ["super_admin"],

  teamBonusFlag: ["super_admin"],
  closerFlag: ["super_admin"],
  payoutBasis: ["super_admin"],
  // accommodation_commission_settings：HQ 獎金分頁只對 super_admin／admin 開放編輯
  closerRate: ["super_admin", "admin"],
  videoRate: ["super_admin", "admin"],
  // team_set_responsible_am：team_onboarding_can_assign_am（super_admin、admin、am_manager）
  amScope: ["super_admin", "admin", "am_manager"],
  // teamcommission_venue_closing_assignments RLS：super_admin、admin
  venueClosing: ["super_admin", "admin"],
  // venue_team_bonus_tier_rules RLS：is_super_admin
  tierRule: ["super_admin"],
  // kol_reciprocal_monthly_quotas RLS：super_admin／scout_manager／am_manages_accommodation（在職 am、am_manager）
  kolQuota: ["super_admin", "scout_manager", "am", "am_manager"],

  globalBonus: ["super_admin", "admin"],
  // scout_tier_settings／scout_salary_settings RLS：super_admin、admin、scout_manager
  scoutTier: ["super_admin", "admin", "scout_manager"],
  scoutSalary: ["super_admin", "admin", "scout_manager"],
};

export function canWriteGap(key: GapKey, roles: string[]): boolean {
  return roles.some((r) => (GAP_WRITE_ROLES[key] ?? []).includes(r));
}

export interface GapAudienceRule {
  /** 應收到通知的角色＝實際能寫入的角色（GAP_WRITE_ROLES） */
  roles: string[];
  /** 非 HQ 角色的替代編輯位置；沒有就代表該角色只能通知 HQ */
  teamHref?: string;
}

const GAP_TEAM_HREF: Partial<Record<GapKey, string>> = {
  amScope: TEAM_ONBOARDING,
  kolQuota: TEAM_KOL_QUOTA,
  scoutTier: TEAM_KOL_SETTINGS,
  scoutSalary: TEAM_KOL_SETTINGS,
};

export const GAP_AUDIENCE = Object.fromEntries(
  (Object.keys(GAP_WRITE_ROLES) as GapKey[]).map((k) => [k, { roles: GAP_WRITE_ROLES[k], teamHref: GAP_TEAM_HREF[k] }]),
) as Record<GapKey, GapAudienceRule>;

export function isHqRole(roles: string[]): boolean {
  return roles.some((r) => HQ_ROLES.includes(r));
}

/** 這個缺口要不要通知這位使用者：只通知「你要設定的」 */
export const shouldNotify = canWriteGap;

/**
 * 依角色解析真正能點過去的位置：
 * - HQ 角色 → HQ 設定頁（若有）
 * - 其他角色 → 團隊路徑的替代設定頁（若有），否則無連結（只提示，不誤導）
 */
export function resolveGapHref(key: GapKey, roles: string[], accId?: string): string | null {
  const rule = GAP_AUDIENCE[key];
  if (isHqRole(roles)) return buildGapHref(key, accId) ?? rule.teamHref ?? null;
  return rule.teamHref ?? null;
}
