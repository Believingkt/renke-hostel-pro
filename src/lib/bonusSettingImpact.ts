/**
 * 「這個設定會影響哪些獎金」的單一真相來源。
 *
 * 前端設定欄位旁掛 `SettingImpactHint`，直接顯示影響／不影響的獎金項目，
 * 讓使用者不必讀文件也知道改動的後果。
 */

import { BONUS_FORMULAS, getBonusFormula, type BonusFormula } from "./bonusFormulas";

/** 設定項目 key（對應前端各設定卡片／欄位） */
export type BonusSettingKey =
  | "partnership_team"
  | "partnership_closer"
  | "payout_basis"
  | "shared_sources"
  | "kol_sources"
  | "owner_pricing_rule"
  | "excluded_addons"
  | "role_binding"
  | "venue_closing_assignment"
  | "am_venue_scope"
  | "rate_version"
  | "bonus_multiplier";

export interface BonusSettingImpact {
  key: BonusSettingKey;
  /** 白話名稱 */
  label: string;
  /** 一句話說明這個設定在算式裡的角色 */
  role: string;
  /** 受影響的獎金 key（對應 bonusFormulas） */
  affects: string[];
}

const TEAM_REVENUE_BONUSES = [
  "am_performance",
  "closer_performance",
  "am_manager",
  "closer_manager",
  "kol_commission",
];

export const BONUS_SETTING_IMPACTS: Record<BonusSettingKey, BonusSettingImpact> = {
  partnership_team: {
    key: "partnership_team",
    label: "合作期間 ｜ 採計團隊獎金",
    role: "決定該館別的訂單「算不算進團隊獎金」。關掉後該期間營收完全不列入。",
    affects: [...TEAM_REVENUE_BONUSES, "am_venue_bonus", "kol_monthly", "venue_closing"],
  },
  partnership_closer: {
    key: "partnership_closer",
    label: "合作期間 ｜ 採計成交組",
    role: "決定該館別的訂單「算不算進成交大師獎金」。可與團隊獎金分開開關。",
    affects: ["closer", "video", "closer_team_bonus"],
  },
  payout_basis: {
    key: "payout_basis",
    label: "業主自帶口徑（payout_basis）",
    role: "決定館別營收要「含」或「排除」業主自帶（owner_direct）訂單，是實付真值的依據。",
    affects: TEAM_REVENUE_BONUSES,
  },
  shared_sources: {
    key: "shared_sources",
    label: "共用訂單來源白名單",
    role: "只有清單內的訂單來源會被加總成共用獎金的營收基準。",
    affects: ["am_performance", "closer_performance", "am_manager", "closer_manager"],
  },
  kol_sources: {
    key: "kol_sources",
    label: "獨立訂單來源白名單（專利獎金）",
    role: "只有清單內的來源會被加總成網紅營銷專利獎金的營收基準。",
    affects: ["kol_commission"],
  },
  owner_pricing_rule: {
    key: "owner_pricing_rule",
    label: "業主月結抽成規則（門檻／免抽成來源）",
    role: "決定每筆訂單的分潤基準金額與門檻係數，是成交大師獎金的計算基礎。",
    affects: ["closer", "video", "closer_team_bonus", "scout_kol", "kol_order_commission"],
  },
  excluded_addons: {
    key: "excluded_addons",
    label: "不列入抽成的增值服務",
    role: "從營收與分潤基準金額中扣除指定的加購項目。",
    affects: [
      ...TEAM_REVENUE_BONUSES,
      "closer",
      "video",
      "scout_kol",
      "scout_discount_code",
      "kol_order_commission",
    ],
  },
  role_binding: {
    key: "role_binding",
    label: "角色綁定（AM總管／成交組主管）",
    role: "決定該期別的管理獎金要發給誰；資料月底已離職者不發。",
    affects: ["am_manager", "closer_manager"],
  },
  venue_closing_assignment: {
    key: "venue_closing_assignment",
    label: "場域簽約人指派",
    role: "決定該館別簽約成立時，場域成交獎金歸屬哪位成員。",
    affects: ["venue_closing"],
  },
  am_venue_scope: {
    key: "am_venue_scope",
    label: "AM 所轄館別",
    role: "決定 AM 績效與場域獎金的營收與館別數統計範圍。",
    affects: ["am_performance", "am_venue_bonus"],
  },
  rate_version: {
    key: "rate_version",
    label: "費率／固定金額版本",
    role: "決定各獎金的乘數；append-only，新版本只影響生效日之後的期別。",
    affects: BONUS_FORMULAS.map((f) => f.key),
  },
  bonus_multiplier: {
    key: "bonus_multiplier",
    label: "獎金加倍活動",
    role: "在發放月套用倍率；已發放（paid）的快照不受影響。",
    affects: BONUS_FORMULAS.map((f) => f.key),
  },
};

export interface SettingImpactResult {
  impact: BonusSettingImpact;
  affected: BonusFormula[];
  unaffected: BonusFormula[];
}

/** 取得某設定的影響清單（含未受影響者，供對照） */
export function getSettingImpact(key: BonusSettingKey): SettingImpactResult {
  const impact = BONUS_SETTING_IMPACTS[key];
  const set = new Set(impact.affects);
  const affected = impact.affects
    .map((k) => getBonusFormula(k))
    .filter((f): f is BonusFormula => !!f);
  const unaffected = BONUS_FORMULAS.filter((f) => !set.has(f.key));
  return { impact, affected, unaffected };
}
