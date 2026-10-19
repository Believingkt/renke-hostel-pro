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

export interface GapAudienceRule {
  /** 應收到通知的角色（super_admin／admin 一律收到） */
  roles: string[];
  /** 非 HQ 角色的替代編輯位置；沒有就代表該角色只能通知 HQ */
  teamHref?: string;
}

export const GAP_AUDIENCE: Record<GapKey, GapAudienceRule> = {
  partnership: { roles: ["am_manager", "am"] },
  settlementRule: { roles: ["am_manager", "am", "finance"] },
  marketingFee: { roles: ["am_manager", "am", "finance"] },
  bookingSetting: { roles: ["am_manager", "am"] },
  legacyRate: { roles: ["finance"] },

  teamBonusFlag: { roles: ["am_manager"] },
  closerFlag: { roles: ["closer_manager"] },
  payoutBasis: { roles: ["am_manager", "finance"] },
  closerRate: { roles: ["closer_manager"] },
  videoRate: { roles: ["closer_manager"] },
  amScope: { roles: ["am_manager"], teamHref: TEAM_ONBOARDING },
  venueClosing: { roles: ["closer_manager"] },
  tierRule: { roles: ["am_manager", "finance"] },
  kolQuota: { roles: ["scout_manager", "scout", "am_manager"], teamHref: TEAM_KOL_QUOTA },

  globalBonus: { roles: ["finance"] },
  scoutTier: { roles: ["scout_manager"], teamHref: TEAM_KOL_SETTINGS },
  scoutSalary: { roles: ["scout_manager"], teamHref: TEAM_KOL_SETTINGS },
};

export function isHqRole(roles: string[]): boolean {
  return roles.some((r) => HQ_ROLES.includes(r));
}

/** 這個缺口要不要通知這位使用者 */
export function shouldNotify(key: GapKey, roles: string[]): boolean {
  if (roles.includes("super_admin") || roles.includes("admin")) return true;
  const rule = GAP_AUDIENCE[key];
  return roles.some((r) => rule.roles.includes(r));
}

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
