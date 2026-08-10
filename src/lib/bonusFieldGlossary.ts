/**
 * 獎金相關「技術欄位名 → 中文欄位名 + 對應設定頁」的單一真相來源。
 *
 * 目的：任何畫面都不該讓使用者看到 `counts_team_bonus` 這種字串。
 * 一律以中文欄位名顯示，並在具備管理權限時提供超連結，直接跳到造成此結果的設定頁。
 */

export type BonusFieldKey =
  | "counts_team_bonus"
  | "counts_closer_commission"
  | "partnership_period"
  | "shared_sources"
  | "kol_sources"
  | "exempt_order_sources"
  | "excluded_addons"
  | "commission_threshold"
  | "role_binding"
  | "venue_closing_assignment"
  | "am_venue_scope"
  | "resigned_at"
  | "order_status"
  | "rate_version"
  | "bonus_multiplier"
  | "travel_days_series"
  | "currency_non_twd";

export interface BonusFieldMeta {
  key: BonusFieldKey;
  /** 中文欄位名（畫面唯一顯示名稱） */
  label: string;
  /** 一句話說明這個欄位在做什麼 */
  meaning: string;
  /** 設定所在位置的白話名稱 */
  settingLabel: string;
  /** 管理員可點擊前往的設定頁；null 表示無對應可編輯頁 */
  href: string | null;
  /** 需要 HQ 層級（Ken／貝瑞）才可編輯 */
  hqOnly?: boolean;
}

const HQ_BONUS = "/hq/bonus-settings";
const HQ_OWNER = "/hq/bonus-settings?tab=owner-settlement";

export const BONUS_FIELD_GLOSSARY: Record<BonusFieldKey, BonusFieldMeta> = {
  counts_team_bonus: {
    key: "counts_team_bonus",
    label: "採計團隊獎金",
    meaning: "該館別此段合作期間的訂單是否列入團隊獎金（AM／成交組績效／總管／主管／專利）。",
    settingLabel: "獎金設定 → 1-A 館別合作期間",
    href: HQ_BONUS,
  },
  counts_closer_commission: {
    key: "counts_closer_commission",
    label: "採計成交組分潤",
    meaning: "該館別此段合作期間的訂單是否列入成交大師獎金（成交組／影音組分潤）。",
    settingLabel: "獎金設定 → 1-A 館別合作期間",
    href: HQ_BONUS,
  },
  partnership_period: {
    key: "partnership_period",
    label: "館別合作期間",
    meaning: "館別的合作起訖日。未設定合作期間的館別，所有獎金一律不採計。",
    settingLabel: "獎金設定 → 1-A 館別合作期間",
    href: HQ_BONUS,
  },
  shared_sources: {
    key: "shared_sources",
    label: "共用訂單來源白名單",
    meaning: "只有清單內的訂單來源會被加總成 AM 績效／AM 總管／成交組績效／成交組主管的營收基準。",
    settingLabel: "獎金設定 → 1-B 訂單來源白名單",
    href: HQ_BONUS,
  },
  kol_sources: {
    key: "kol_sources",
    label: "獨立訂單來源白名單",
    meaning: "只有清單內的訂單來源會被加總成網紅營銷專利獎金（抽成＋月費）的營收基準。",
    settingLabel: "獎金設定 → 1-B 訂單來源白名單",
    href: HQ_BONUS,
  },
  exempt_order_sources: {
    key: "exempt_order_sources",
    label: "免抽成訂單來源",
    meaning: "與業主月結「平台抽成費」同一份設定；清單內來源與業主自帶訂單不計成交大師與星探分潤。",
    settingLabel: "業主月結抽成規則",
    href: HQ_OWNER,
  },
  excluded_addons: {
    key: "excluded_addons",
    label: "不列入抽成的增值服務",
    meaning: "從營收與分潤基準金額中扣除的加購項目。",
    settingLabel: "業主月結抽成規則",
    href: HQ_OWNER,
  },
  commission_threshold: {
    key: "commission_threshold",
    label: "月營收抽成門檻",
    meaning: "月營收未達門檻不抽成，超額部分才計入。",
    settingLabel: "業主月結抽成規則",
    href: HQ_OWNER,
  },
  role_binding: {
    key: "role_binding",
    label: "角色綁定",
    meaning: "決定該期別的管理型獎金（AM 總管／成交組主管／專利接收人）發給誰。",
    settingLabel: "HQ 整合頁 → 角色綁定",
    href: HQ_BONUS,
    hqOnly: true,
  },
  venue_closing_assignment: {
    key: "venue_closing_assignment",
    label: "場域簽約人指派",
    meaning: "決定該館別的場域成交獎金歸屬哪位成員。",
    settingLabel: "獎金設定 → 3 領獎人",
    href: HQ_BONUS,
  },
  am_venue_scope: {
    key: "am_venue_scope",
    label: "負責 AM ／所轄館別",
    meaning: "決定 AM 績效與 AM 場域獎金的營收與館別數統計範圍。",
    settingLabel: "獎金設定 → 3 領獎人",
    href: HQ_BONUS,
  },
  resigned_at: {
    key: "resigned_at",
    label: "在職期間",
    meaning: "資料月內在職即發，並按在職天數比例計算（例：14/31）。",
    settingLabel: "團隊成員管理",
    href: "/team/members",
  },
  order_status: {
    key: "order_status",
    label: "訂單狀態",
    meaning: "取消單與保留單（hold）一律不採計任何獎金。",
    settingLabel: "訂單管理",
    href: "/team/orders",
  },
  rate_version: {
    key: "rate_version",
    label: "費率／固定金額版本",
    meaning: "一律取資料月當時生效的版本；append-only，不可修改過去月份。",
    settingLabel: "獎金設定 → 4 金額與費率",
    href: HQ_BONUS,
  },
  bonus_multiplier: {
    key: "bonus_multiplier",
    label: "獎金加倍活動",
    meaning: "在發放月套用倍率；已發放（paid）的快照不受影響。",
    settingLabel: "獎金設定 → 4 金額與費率",
    href: HQ_BONUS,
    hqOnly: true,
  },
  travel_days_series: {
    key: "travel_days_series",
    label: "旅行日系列館別",
    meaning: "旅行日系列不列入任何團隊獎金；成交大師獎金僅台幣訂單計獎。",
    settingLabel: "館別設定",
    href: null,
  },
  currency_non_twd: {
    key: "currency_non_twd",
    label: "非台幣訂單",
    meaning: "旅行日系列的非台幣訂單不計成交大師獎金，且不做匯率換算。",
    settingLabel: "訂單幣別",
    href: null,
  },
};

export function getBonusField(key: BonusFieldKey): BonusFieldMeta {
  return BONUS_FIELD_GLOSSARY[key];
}

/** 依角色判定是否可看到設定頁超連結（無權者顯示灰字說明） */
export function canOpenBonusSetting(meta: BonusFieldMeta, roles: string[]): boolean {
  if (!meta.href) return false;
  const isHQ = roles.includes("super_admin") || roles.includes("admin");
  if (meta.hqOnly) return isHQ;
  return (
    isHQ ||
    roles.includes("am_manager") ||
    roles.includes("closer_manager") ||
    roles.includes("finance")
  );
}
