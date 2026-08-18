/**
 * 獎金項目的「發放日／結算區間」與「當前設定值來源」中繼資料。
 *
 * 與 `bonusFormulas.ts`（公式／口徑／gate）搭配使用，讓結算規則說明頁
 * 只需一個地方維護，不再另外手寫一份清單。
 *
 * 重要：這裡取得的費率一律是「目前資料庫最新生效版本」，
 * 不一定等於某個資料月（獎金發放月份）當時採用的版本；
 * 已凍結的快照仍以快照當時的費率為準。此處僅供釐清公式計算邏輯。
 */

import type { TeamRole } from "@/components/team/teamConfig";

export type RateKind =
  /** 全公司單一設定：teamcommission_bonus_rate_settings */
  | "global"
  /** 逐館設定：accommodation_commission_settings */
  | "per_venue"
  /** 逐人／逐 KOL／逐職級設定，無單一數字 */
  | "per_member"
  /** 無費率概念 */
  | "none";

export interface BonusRateMeta {
  /** 發放日 */
  payoutSchedule: string;
  /** 結算區間 */
  settlementWindow: string;
  /** 公式字串中要以「當前設定值」徽章取代的片語 */
  rateToken?: string;
  rateKind: RateKind;
  /** rateKind = global 時對應 teamcommission_bonus_rate_settings.bonus_type */
  rateBonusType?: string;
  /** rateKind = per_venue 時要顯示的欄位 */
  venueRateField?: "closer_rate" | "video_rate";
  /** per_member 時的說明文字 */
  rateHint?: string;
  /** 可看到「當前設定值」的角色（管理員永遠可見） */
  viewerRoles: TeamRole[];
  /** 前往設定頁的路徑（僅管理員顯示） */
  settingsPath?: string;
}

/** 永遠可看到全部費率的角色 */
export const RATE_ADMIN_ROLES: TeamRole[] = ["super_admin", "admin", "finance"];

/** 主管可額外看到的所轄角色獎金項目 */
export const MANAGER_SCOPE: Partial<Record<TeamRole, TeamRole[]>> = {
  am_manager: ["am", "am_manager"],
  closer_manager: ["closer", "closer_manager", "video"],
  scout_manager: ["scout", "scout_manager"],
  franchise_manager: ["franchise_internal", "franchise_external", "franchise_manager"],
};

const HQ_TEAM_RATES = "/hq/bonus-settings";

export const BONUS_RATE_META: Record<string, BonusRateMeta> = {
  // ── 一、團隊獎金 ─────────────────────────────
  am_performance: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月整月所轄館別入住營收，僅計入已勾選的訂單來源",
    rateToken: "AM績效費率",
    rateKind: "global",
    rateBonusType: "am_performance",
    viewerRoles: ["am", "am_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  am_venue_bonus: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月所轄館別數，固定金額",
    rateToken: "每館固定金額",
    rateKind: "global",
    rateBonusType: "am_venue_bonus",
    viewerRoles: ["am", "am_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  closer_performance: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月全公司入住營收，由資料月底仍在職的成交組成員均分",
    rateToken: "費率",
    rateKind: "global",
    rateBonusType: "closer_performance",
    viewerRoles: ["closer", "closer_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  am_manager: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月全公司入住營收；離職生效日之後不再發放",
    rateToken: "AM總管費率",
    rateKind: "global",
    rateBonusType: "am_manager",
    viewerRoles: ["am_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  closer_manager: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月全公司入住營收；離職生效日之後不再發放",
    rateToken: "成交組主管費率",
    rateKind: "global",
    rateBonusType: "closer_manager",
    viewerRoles: ["closer_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  kol_commission: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月 KOL 來源入住營收，僅計入該獎金專屬已勾選的訂單來源",
    rateToken: "抽成費率",
    rateKind: "global",
    rateBonusType: "kol_commission",
    viewerRoles: ["am_manager", "scout_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  kol_monthly: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月有效合作期間的館別數，固定月費",
    rateToken: "每館月費",
    rateKind: "global",
    rateBonusType: "kol_monthly",
    viewerRoles: ["am_manager", "scout_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  venue_closing: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月簽約成立且已收行銷推廣費的館別，固定金額",
    rateToken: "固定金額",
    rateKind: "global",
    rateBonusType: "venue_closing",
    viewerRoles: ["am", "am_manager"],
    settingsPath: HQ_TEAM_RATES,
  },

  // ── 二、成交大師獎金 ────────────────────────
  closer: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上個月整月訂單",
    rateToken: "成交組費率",
    rateKind: "per_venue",
    venueRateField: "closer_rate",
    viewerRoles: ["closer", "closer_manager"],
    settingsPath: HQ_TEAM_RATES,
  },
  closer_team_bonus: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上個月整月訂單",
    rateKind: "per_member",
    rateHint: "依「成交組團隊獎金設定」的個人分配比例",
    viewerRoles: ["closer", "closer_manager"],
  },

  // ── 三、星探獎金 ─────────────────────────────
  scout_base: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月整月邀約達標情形",
    rateKind: "per_member",
    rateHint: "依星探職級（正職／兼職）設定的底薪",
    viewerRoles: ["scout", "scout_manager"],
  },
  scout_rarity: {
    payoutSchedule: "每月 10 日與 25 日",
    settlementWindow: "10 日期：上月 21 日～當月 5 日；25 日期：當月 6 日～20 日",
    rateKind: "per_member",
    rateHint: "依稀有度級距設定的固定金額",
    viewerRoles: ["scout", "scout_manager"],
  },
  scout_kol: {
    payoutSchedule: "每月 10 日與 25 日",
    settlementWindow: "10 日期：上月 21 日～當月 5 日入住；25 日期：當月 6 日～20 日入住",
    rateKind: "per_member",
    rateHint: "依該 KOL 的星探分潤費率（可個別 override）",
    viewerRoles: ["scout", "scout_manager"],
  },
  scout_team: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月整月全隊邀約成立數（正職＋兼職累加）",
    rateKind: "per_member",
    rateHint: "依團隊目標級距對應金額",
    viewerRoles: ["scout", "scout_manager"],
  },
  scout_discount_code: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上個月整月訂單，以後端試算快照為準",
    rateKind: "per_member",
    rateHint: "依各折扣碼設定的獎金費率",
    viewerRoles: ["scout", "scout_manager"],
  },

  // ── 四、KOL 分潤 ─────────────────────────────
  kol_order_commission: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上個月整月訂單",
    rateKind: "per_member",
    rateHint: "依各 KOL 的分潤費率設定（可個別 override）",
    viewerRoles: ["scout", "scout_manager"],
  },

  // ── 五、特許加盟 ─────────────────────────────
  franchise_internal: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月成交且已確認付款的加盟訂單",
    rateKind: "per_member",
    rateHint: "依加盟業務／隊長費率設定",
    viewerRoles: ["franchise_internal", "franchise_manager"],
  },
  franchise_external: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月簽約且合約已完成的加盟外部訂單",
    rateKind: "per_member",
    rateHint: "依業務／協同業務各自的費率設定",
    viewerRoles: ["franchise_external", "franchise_manager"],
  },

  // ── 六、星鏈 ─────────────────────────────────
  starlink: {
    payoutSchedule: "每月 10 日",
    settlementWindow: "上月成交且已確認付款的星鏈訂單",
    rateKind: "per_member",
    rateHint: "依星鏈職級費率設定",
    viewerRoles: ["starlink"],
  },
};

/** 該使用者是否可看到此獎金項目的「當前設定值」 */
export function canViewBonusRate(key: string, roles: TeamRole[]): boolean {
  if (roles.some((r) => RATE_ADMIN_ROLES.includes(r))) return true;
  const meta = BONUS_RATE_META[key];
  if (!meta) return false;
  const scoped = new Set<TeamRole>(roles);
  for (const r of roles) {
    for (const extra of MANAGER_SCOPE[r] ?? []) scoped.add(extra);
  }
  return meta.viewerRoles.some((r) => scoped.has(r));
}

export function isRateAdmin(roles: TeamRole[]): boolean {
  return roles.some((r) => RATE_ADMIN_ROLES.includes(r));
}

/**
 * 該使用者是否「應該看到」此獎金項目本身（非費率）。
 * 一般成員只看自己的角色，主管可看所轄角色，管理員／財務全部可見。
 */
export function isBonusItemInScope(key: string, roles: TeamRole[]): boolean {
  if (roles.some((r) => RATE_ADMIN_ROLES.includes(r))) return true;
  const meta = BONUS_RATE_META[key];
  if (!meta) return false;
  const scoped = new Set<TeamRole>(roles);
  for (const r of roles) {
    for (const extra of MANAGER_SCOPE[r] ?? []) scoped.add(extra);
  }
  return meta.viewerRoles.some((r) => scoped.has(r));
}
