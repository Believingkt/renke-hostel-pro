/**
 * 設定缺口「明細」與「連結驗證」單一真相來源。
 *
 * 每個缺口回答三件事：
 *  1. 缺的是哪一張資料表（要補哪筆資料）
 *  2. 會被哪個權限（角色 / RLS）擋住
 *  3. 這個角色該怎麼跳轉才會落在「可編輯」的頁面
 *
 * 純資料 + 純函式，方便單元測試，UI 不得自行硬編路徑或權限判斷。
 */

import {
  GAP_AUDIENCE,
  GAP_TARGETS,
  buildGapHref,
  type GapKey,
} from "./settingsGapLinks";

/** 可以進入 /hq/bonus-settings 的角色（App.tsx: HQ_SETTINGS_ROLES） */
export const HQ_SETTINGS_ROLES = [
  "super_admin",
  "admin",
  "finance",
  "am",
  "am_manager",
  "hotel_admin",
];

/** HQ 內真正有寫入權的角色（其餘一律唯讀） */
const HQ_FULL_EDIT_ROLES = ["super_admin", "admin"];
/** 只有「業主月結設定」分頁可編輯的角色 */
const OWNER_SETTLEMENT_EDIT_ROLES = ["super_admin", "admin", "am", "am_manager", "hotel_admin"];

export interface GapDetail {
  /** 顯示名稱 */
  label: string;
  /** 缺哪一張表 */
  table: string;
  /** 要補的欄位（摘要） */
  columns: string;
  /** 誰能寫（權限說明） */
  writeRoles: string;
  /** RLS / 頁面權限限制說明 */
  permissionNote: string;
  /** 該怎麼跳轉 */
  howTo: string;
}

export const GAP_DETAILS: Record<GapKey, GapDetail> = {
  partnership: {
    label: "合作期間",
    table: "accommodation_partnership_periods",
    columns: "start_date / end_date（含今日的區間）",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ 獎金分頁；finance 為唯讀，am／hotel_admin 看不到此分頁。",
    howTo: "總部設定頁 →「獎金發放規則（4 步流程）」第 ① 步合作期間卡片 →「+ 合作期間」。",
  },
  settlementRule: {
    label: "業主月結費率",
    table: "owner_settlement_pricing_rules",
    columns: "commission_rate、commission_threshold、effective_from（≤ 今天）",
    writeRoles: "super_admin、admin、am、am_manager、hotel_admin",
    permissionNote: "館別後台的月結設定已改唯讀，只能在 HQ 整合頁編輯；finance 唯讀。",
    howTo: "總部設定頁 →「業主月結設定」分頁 → 服務費規則卡片 → 新增生效版本。",
  },
  marketingFee: {
    label: "行銷推廣費約定",
    table: "owner_settlement_pricing_rules",
    columns: "charges_marketing_fee",
    writeRoles: "super_admin、admin、am、am_manager、hotel_admin",
    permissionNote: "與月結費率同一張表，沒有費率版本就無法判定是否收費。",
    howTo: "總部設定頁 →「業主月結設定」分頁 → 行銷推廣費卡片。",
  },
  bookingSetting: {
    label: "訂房設定",
    table: "booking_settings",
    columns: "manual_refund_fee_amount",
    writeRoles: "該館 hotel_admin、super_admin、admin",
    permissionNote: "RLS 以 accommodation_id 綁定，HQ 沒有對應集中頁，必須到該館後台。",
    howTo: "切到該館後台 →「訂房設定」→ 人工退款手續費。",
  },
  legacyRate: {
    label: "歷史費率殘留",
    table: "consulting_fee_settings（已停用）",
    columns: "rate、revenue_threshold",
    writeRoles: "super_admin、admin、finance（清理）",
    permissionNote: "唯一真相已改為 owner_settlement_pricing_rules，此表僅供對帳。",
    howTo: "總部設定頁 →「業主月結設定」→ 歷史版本區塊核對後忽略或補正。",
  },

  teamBonusFlag: {
    label: "採計團隊獎金",
    table: "accommodation_partnership_periods",
    columns: "counts_team_bonus",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ 獎金分頁；am_manager 只會收到通知，無法自行編輯。",
    howTo: "總部設定頁 →「獎金發放規則」第 ① 步 → 勾選採計團隊獎金。",
  },
  closerFlag: {
    label: "採計成交組",
    table: "accommodation_partnership_periods",
    columns: "counts_closer_commission",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ 獎金分頁；closer_manager 只會收到通知，無法自行編輯。",
    howTo: "總部設定頁 →「獎金發放規則」第 ① 步 → 勾選採計成交組。",
  },
  payoutBasis: {
    label: "業主自帶口徑",
    table: "accommodation_partnership_periods",
    columns: "payout_basis",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ 獎金分頁；finance 唯讀。",
    howTo: "總部設定頁 →「獎金發放規則」第 ① 步 → 業主自帶口徑。",
  },
  closerRate: {
    label: "成交費率",
    table: "accommodation_commission_settings",
    columns: "closer_rate、effective_from（≤ 今天）",
    writeRoles: "super_admin、admin",
    permissionNote: "append-only 版本表，只能新增版本不能改舊版；closer_manager 唯讀。",
    howTo: "總部設定頁 →「獎金發放規則」→ 成交／影音費率卡片 → 新增生效版本。",
  },
  videoRate: {
    label: "影音費率",
    table: "accommodation_commission_settings",
    columns: "video_rate、effective_from（≤ 今天）",
    writeRoles: "super_admin、admin",
    permissionNote: "與成交費率同一張版本表，缺版本則影音獎金算不出金額。",
    howTo: "總部設定頁 →「獎金發放規則」→ 成交／影音費率卡片 → 新增生效版本。",
  },
  amScope: {
    label: "AM 負責人",
    table: "accommodation_responsible_am",
    columns: "負責 AM（一館一位）或「不需要負責 AM」",
    writeRoles: "super_admin、admin、am_manager",
    permissionNote: "只能在館別設定總覽指定；am_managed_accommodation_ids 由系統同步，不能直接修改。",
    howTo: "團隊後台 →「館別設定總覽」→ 該館 → AM 區塊指定負責 AM。",
  },
  venueClosing: {
    label: "場域簽約人",
    table: "teamcommission_venue_closing_assignments",
    columns: "closer_user_id、effective_from",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ 獎金分頁；closer_manager 唯讀。",
    howTo: "總部設定頁 →「獎金發放規則」→ 場域成交人指派。",
  },
  tierRule: {
    label: "館別級距規則",
    table: "venue_team_bonus_tier_rules",
    columns: "tier 區間、effective_from",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ「館別級距」分頁；finance 唯讀。",
    howTo: "總部設定頁 →「館別級距」分頁 → 新增生效版本。",
  },
  kolQuota: {
    label: "KOL 互惠額度",
    table: "kol_reciprocal_monthly_quotas",
    columns: "year_month、quota",
    writeRoles: "super_admin、admin、scout_manager、scout",
    permissionNote: "在 KOL 星探頁維護，不需 HQ 權限。",
    howTo: "團隊後台 →「KOL 星探」→ 互惠額度分頁 → 設定本月額度。",
  },

  globalBonus: {
    label: "全站獎金設定",
    table: "teamcommission_* 系列版本表",
    columns: "bonus_type 費率版本、來源白名單、角色綁定",
    writeRoles: "super_admin、admin",
    permissionNote: "HQ 獎金分頁；finance 可看不可改。",
    howTo: "總部設定頁 →「獎金發放規則」→ 對應卡片新增生效版本。",
  },
  scoutTier: {
    label: "星探級距",
    table: "scout_tier_settings",
    columns: "級距門檻、effective_from",
    writeRoles: "super_admin、admin、scout_manager",
    permissionNote: "在 KOL 星探設定頁維護，不需 HQ 權限。",
    howTo: "團隊後台 →「KOL 星探」→ 設定分頁 → 星探級距。",
  },
  scoutSalary: {
    label: "星探底薪",
    table: "scout_salary_settings",
    columns: "底薪金額、effective_from",
    writeRoles: "super_admin、admin、scout_manager",
    permissionNote: "在 KOL 星探設定頁維護，不需 HQ 權限。",
    howTo: "團隊後台 →「KOL 星探」→ 設定分頁 → 星探底薪。",
  },
};

export interface GapLinkValidation {
  /** 可以安全導向的位置；null 代表這個角色沒有可跳轉的頁面 */
  href: string | null;
  /** 到達後是否真的能編輯（false = 唯讀，UI 必須標示，避免誤導） */
  editable: boolean;
  /** 唯讀或無法跳轉的原因 */
  reason: string | null;
}

function hasAny(roles: string[], allow: string[]): boolean {
  return roles.some((r) => allow.includes(r));
}

/**
 * 依角色驗證跳轉連結是否落在「可編輯」的頁面。
 * 規則：
 *  - HQ 目標頁：要能進入 /hq/bonus-settings，且該分頁對此角色不是唯讀
 *  - 團隊目標頁：audience 內的角色即可編輯
 *  - 都不符合 → 不給連結，只留說明
 */
export function validateGapLink(key: GapKey, roles: string[], accId?: string): GapLinkValidation {
  const rule = GAP_AUDIENCE[key];
  const target = GAP_TARGETS[key];
  const teamHref = rule.teamHref ?? null;

  const canEditTeamHref =
    !!teamHref && (hasAny(roles, ["super_admin", "admin"]) || hasAny(roles, rule.roles));

  if (target.tab) {
    const hqHref = buildGapHref(key, accId);
    const canEnterHq = hasAny(roles, HQ_SETTINGS_ROLES);
    const canEditHq =
      target.tab === "owner-settlement"
        ? hasAny(roles, OWNER_SETTLEMENT_EDIT_ROLES)
        : hasAny(roles, HQ_FULL_EDIT_ROLES);

    if (hqHref && canEnterHq && canEditHq) {
      return { href: hqHref, editable: true, reason: null };
    }
    if (canEditTeamHref) {
      return { href: teamHref, editable: true, reason: null };
    }
    if (hqHref && canEnterHq) {
      return {
        href: hqHref,
        editable: false,
        reason: "你只有唯讀權限，請通知總部管理員（super_admin／admin）補齊。",
      };
    }
    return {
      href: null,
      editable: false,
      reason: "此設定僅限總部管理員編輯，你沒有進入總部設定頁的權限。",
    };
  }

  if (canEditTeamHref) return { href: teamHref, editable: true, reason: null };
  if (teamHref) {
    return { href: teamHref, editable: false, reason: "你在該頁面為唯讀，請聯絡可編輯的負責角色。" };
  }
  return {
    href: null,
    editable: false,
    reason: `此設定沒有集中管理頁，${GAP_DETAILS[key].howTo}`,
  };
}
