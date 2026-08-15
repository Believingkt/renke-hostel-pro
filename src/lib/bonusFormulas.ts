/**
 * 獎金公式單一真相來源（registry）。
 *
 * 全站任何顯示獎金金額的地方，都以本檔為唯一說明來源：
 *  - `BonusFormulaHint` 顯示「通用公式 + 代入數字」
 *  - 結算規則說明 Tab 由本 registry 自動渲染（anchorId 供錨點捲動）
 *
 * 重要口徑：
 *  - `usesVenueRevenue = true` 者，才受「業主自帶雙軌（含／排除）」影響。
 *  - 已發放（paid）的資料一律以快照欄位顯示，不得以當前設定回算。
 */

export type BonusCategory =
  | "team"
  | "closer"
  | "scout"
  | "kol"
  | "franchise"
  | "starlink";

export interface BonusFormula {
  /** 對應 bonus_type / SOURCE_LABEL 的 key */
  key: string;
  /** 中文名稱 */
  name: string;
  category: BonusCategory;
  /** 通用公式字串 */
  formula: string;
  /** 口徑說明 */
  basis: string;
  /** 採計 gate（限制條件） */
  gates: string[];
  /** 是否以「館別營收」為基準（受業主自帶雙軌影響） */
  usesVenueRevenue: boolean;
  /** 結算規則說明 Tab 的錨點 id */
  anchorId: string;
}

export const BONUS_CATEGORY_LABEL: Record<BonusCategory, string> = {
  team: "一、團隊獎金",
  closer: "二、成交大師獎金",
  scout: "三、星探獎金",
  kol: "四、KOL 分潤",
  franchise: "五、特許加盟",
  starlink: "六、星鏈",
};

const GATE_PARTNERSHIP = "館別合作期間內（採計團隊獎金）";
const GATE_PARTNERSHIP_CLOSER = "館別合作期間內（採計成交組）";
const GATE_STATUS = "排除取消單與保留單（hold）";
const GATE_TRAVEL = "旅行日系列不列入";
const GATE_ACTIVE = "在職期間比例（離職者按在職天數比例）";
const GATE_THRESHOLD = "月營收抽成門檻（未達門檻不抽成，超額部分才抽）";

export const BONUS_FORMULAS: BonusFormula[] = [
  // ── 一、團隊獎金 ─────────────────────────────
  {
    key: "am_performance",
    name: "AM績效獎金",
    category: "team",
    formula: "Σ(所轄館別入住營收) × AM績效費率",
    basis: "入住營收逐夜攤提，扣除設定不列入抽成的增值服務，外幣依訂單匯率快照換算台幣",
    gates: [GATE_PARTNERSHIP, GATE_STATUS, GATE_TRAVEL],
    usesVenueRevenue: true,
    anchorId: "bonus-am_performance",
  },
  {
    key: "am_venue_bonus",
    name: "AM場域獎金",
    category: "team",
    formula: "所轄館別數 × 每館固定金額",
    basis: "固定金額，與營收無關",
    gates: [GATE_PARTNERSHIP, GATE_TRAVEL],
    usesVenueRevenue: false,
    anchorId: "bonus-am_venue_bonus",
  },
  {
    key: "closer_performance",
    name: "成交組績效獎金",
    category: "team",
    formula: "(全公司入住營收 × 費率) ÷ 成交組在職人數 × 在職比例",
    basis: "全公司採計館別營收共同分潤，離職者依當月在職天數比例計算",
    gates: [GATE_PARTNERSHIP, GATE_STATUS, GATE_TRAVEL, GATE_ACTIVE],
    usesVenueRevenue: true,
    anchorId: "bonus-closer_performance",
  },
  {
    key: "am_manager",
    name: "AM總管獎金",
    category: "team",
    formula: "全公司入住營收 × AM總管費率",
    basis: "角色綁定當月生效者，資料月底已離職不發",
    gates: [GATE_PARTNERSHIP, GATE_STATUS, GATE_TRAVEL],
    usesVenueRevenue: true,
    anchorId: "bonus-am_manager",
  },
  {
    key: "closer_manager",
    name: "成交組主管管理獎金",
    category: "team",
    formula: "全公司入住營收 × 成交組主管費率",
    basis: "角色綁定當月生效者，資料月底已離職不發",
    gates: [GATE_PARTNERSHIP, GATE_STATUS, GATE_TRAVEL],
    usesVenueRevenue: true,
    anchorId: "bonus-closer_manager",
  },
  {
    key: "kol_commission",
    name: "網紅營銷專利獎金(抽成)",
    category: "team",
    formula: "KOL 來源入住營收 × 抽成費率",
    basis: "僅計 KOL 訂單來源白名單內的來源",
    gates: [GATE_PARTNERSHIP, GATE_STATUS, GATE_TRAVEL],
    usesVenueRevenue: true,
    anchorId: "bonus-kol_commission",
  },
  {
    key: "kol_monthly",
    name: "網紅營銷專利獎金(月費)",
    category: "team",
    formula: "有合作期間的館別數 × 每館月費",
    basis: "固定月費，與營收無關；旅行日系列合併只算一館",
    gates: [GATE_PARTNERSHIP],
    usesVenueRevenue: false,
    anchorId: "bonus-kol_monthly",
  },
  {
    key: "venue_closing",
    name: "場域成交獎金",
    category: "team",
    formula: "該月簽約成立且收取行銷推廣費的館別數 × 固定金額",
    basis: "固定金額；門檻判定會用到館別營收，故仍標記受雙軌口徑影響",
    gates: ["該月生效的簽約人指派", "館別約定收取行銷推廣費"],
    usesVenueRevenue: true,
    anchorId: "bonus-venue_closing",
  },

  // ── 二、成交大師獎金 ────────────────────────
  {
    key: "closer",
    name: "成交組分潤",
    category: "closer",
    formula: "訂單分潤基準金額 × 成交組費率 × 門檻係數",
    basis: "以訂單為單位，分潤基準金額由系統自動計算（扣除不列入抽成的增值服務）",
    gates: [GATE_PARTNERSHIP_CLOSER, GATE_STATUS, GATE_THRESHOLD, GATE_ACTIVE],
    usesVenueRevenue: false,
    anchorId: "bonus-closer",
  },
  {
    key: "closer_team_bonus",
    name: "成交組團隊獎金",
    category: "closer",
    formula: "團隊分潤池 × 個人分配比例",
    basis: "依成交組團隊獎金設定的分配比例計算",
    gates: [GATE_PARTNERSHIP_CLOSER, GATE_STATUS],
    usesVenueRevenue: false,
    anchorId: "bonus-closer_team_bonus",
  },

  // ── 三、星探獎金 ─────────────────────────────
  {
    key: "scout_base",
    name: "星探底薪",
    category: "scout",
    formula: "職級對應底薪（正職／兼職）",
    basis: "依星探職級設定的固定金額",
    gates: ["當期在職"],
    usesVenueRevenue: false,
    anchorId: "bonus-scout_base",
  },
  {
    key: "scout_rarity",
    name: "星探稀有度獎金",
    category: "scout",
    formula: "Σ(邀約成立的 KOL 稀有度對應金額)",
    basis: "以邀約成立時間落在該期別為準",
    gates: ["邀約已成立並確認"],
    usesVenueRevenue: false,
    anchorId: "bonus-scout_rarity",
  },
  {
    key: "scout_kol",
    name: "KOL訂單星探分潤",
    category: "scout",
    formula: "KOL 訂單分潤基準金額 × 星探分潤費率",
    basis: "排除增值服務與業主自帶／exempt 來源",
    gates: [GATE_STATUS, "訂單歸屬該星探邀約之 KOL"],
    usesVenueRevenue: false,
    anchorId: "bonus-scout_kol",
  },
  {
    key: "scout_team",
    name: "星探團隊獎金",
    category: "scout",
    formula: "團隊達成率對應金額（正職＋兼職邀約數累加共用目標）",
    basis: "全團隊當期邀約成立數累加後比對目標級距",
    gates: ["當期在職", "團隊目標已設定"],
    usesVenueRevenue: false,
    anchorId: "bonus-scout_team",
  },
  {
    key: "scout_discount_code",
    name: "星探折扣碼獎金",
    category: "scout",
    formula: "使用該折扣碼之訂單分潤基準金額 × 折扣碼獎金費率",
    basis: "後端試算後寫入快照，發放時以快照為準",
    gates: [GATE_STATUS, "訂單使用該星探折扣碼"],
    usesVenueRevenue: false,
    anchorId: "bonus-scout_discount_code",
  },

  // ── 四、KOL 分潤 ─────────────────────────────
  {
    key: "kol_order_commission",
    name: "KOL 訂單分潤",
    category: "kol",
    formula: "KOL 訂單分潤基準金額 × KOL 分潤費率",
    basis: "排除增值服務與業主自帶／exempt 來源",
    gates: [GATE_STATUS],
    usesVenueRevenue: false,
    anchorId: "bonus-kol_order_commission",
  },

  // ── 五、特許加盟 ─────────────────────────────
  {
    key: "franchise_internal",
    name: "特許加盟內部（業務／隊長）",
    category: "franchise",
    formula: "加盟訂單金額 × 業務費率（隊長另計隊長費率）",
    basis: "以加盟訂單成立時間認列",
    gates: ["加盟訂單已成立"],
    usesVenueRevenue: false,
    anchorId: "bonus-franchise_internal",
  },
  {
    key: "franchise_external",
    name: "特許加盟外部（業務／協同）",
    category: "franchise",
    formula: "加盟外部訂單金額 × 各角色費率",
    basis: "業務與協同業務可各自設定分潤",
    gates: ["加盟外部訂單已成立"],
    usesVenueRevenue: false,
    anchorId: "bonus-franchise_external",
  },

  // ── 六、星鏈 ─────────────────────────────────
  {
    key: "starlink",
    name: "星鏈分潤",
    category: "starlink",
    formula: "星鏈訂單金額 × 星鏈分潤費率",
    basis: "以星鏈訂單成立時間認列",
    gates: ["星鏈訂單已成立"],
    usesVenueRevenue: false,
    anchorId: "bonus-starlink",
  },
];

const BY_KEY: Record<string, BonusFormula> = Object.fromEntries(
  BONUS_FORMULAS.map((f) => [f.key, f]),
);

/** 以 bonus_type / source key 取得公式定義（含常見別名） */
export function getBonusFormula(key: string | null | undefined): BonusFormula | null {
  if (!key) return null;
  const k = String(key);
  if (BY_KEY[k]) return BY_KEY[k];
  const alias: Record<string, string> = {
    scout_discount_scout: "scout_discount_code",
    scout_discount_closer: "scout_discount_code",
    franchise: "franchise_internal",
    franchise_internal_sales: "franchise_internal",
    franchise_internal_leader: "franchise_internal",
    franchise_external_sales: "franchise_external",
    franchise_external_co1: "franchise_external",
    franchise_external_co2: "franchise_external",
    kol_order: "kol_order_commission",
    kol: "kol_order_commission",
  };
  return BY_KEY[alias[k] ?? ""] ?? null;
}

/** 該獎金是否受業主自帶雙軌切換影響 */
export function usesVenueRevenue(key: string | null | undefined): boolean {
  return getBonusFormula(key)?.usesVenueRevenue === true;
}

/** 依分類分組（供結算規則說明 Tab 自動渲染） */
export function groupedBonusFormulas(): Array<{
  category: BonusCategory;
  label: string;
  items: BonusFormula[];
}> {
  const order: BonusCategory[] = ["team", "closer", "scout", "kol", "franchise", "starlink"];
  return order.map((category) => ({
    category,
    label: BONUS_CATEGORY_LABEL[category],
    items: BONUS_FORMULAS.filter((f) => f.category === category),
  }));
}
