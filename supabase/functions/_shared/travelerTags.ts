// 旅客標籤 / 關鍵字 / 需求的受控詞彙與過濾規則。
// 給 traveler-tagging、traveler-sync、traveler-cleanup 共用，確保「寫入時」與「清洗時」同一套規則。

export const INTEREST_WHITELIST = [
  "包棟", "親子", "親子友善", "寵物友善", "美食", "烤肉", "戶外", "溫泉", "情侶", "團體",
  "長輩同行", "湖景", "山景", "海景", "夜景", "露營", "商務", "包場", "慶生", "蜜月",
  "聚會", "放鬆", "泳池", "戲水", "星空", "景觀", "包棟烤肉", "氣泡湯", "無障礙", "早餐",
  "賞花", "賞楓", "療癒", "網美",
];
export const INTEREST_SET = new Set(INTEREST_WHITELIST);

// 同義詞歸一到受控詞彙
export const INTEREST_SYNONYM: Record<string, string> = {
  "寵物": "寵物友善", "毛小孩": "寵物友善", "家庭": "親子", "小孩": "親子", "泡湯": "溫泉",
  "長輩": "長輩同行", "家族": "團體", "朋友": "團體", "湖畔": "湖景", "湖邊": "湖景",
};

// 訂單作業用語黑名單（標籤 / 關鍵字 / 需求一律排除）
export const OPS_BLACKLIST = [
  "取消訂單", "取消", "保留單", "保留", "颱風延期", "延期", "改期", "業主自帶", "補單", "補開",
  "訂金", "尾款", "退訂", "退款", "退費", "候補", "作廢", "加價", "補差額", "發票", "收據",
  "統編", "訂單", "補登", "人工", "客服", "未付", "已付", "尚未", "待付", "測試", "owlting",
];

const EMAIL_TEST = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_TEST = /(?:\+?886|0)?\d{3}[- ]?\d{3,4}[- ]?\d{3,4}/;

// 短詞用：整串純代碼，或含 3 碼以上連續數字
export const isPureNumberLike = (s: string) =>
  /^[\s\d\-－()（）.#*]+$/.test(s) || /\d{3,}/.test(s);
// 需求（可為長句）用：僅整串為代碼/符號才算
const isPureCode = (s: string) => /^[\s\d\-－()（）.#*]+$/.test(s);

function hitOps(v: string): boolean {
  const low = v.toLowerCase();
  return OPS_BLACKLIST.some((b) => low.includes(b.toLowerCase()));
}

export function buildNameSet(displayNames: Array<string | null | undefined>): Set<string> {
  return new Set(
    displayNames
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter((n) => n.length >= 2),
  );
}

/** 興趣標籤：同義詞歸一 + 受控詞彙白名單（其餘一律丟棄） */
export function sanitizeInterestTags(arr: unknown): string[] {
  const list = Array.isArray(arr) ? arr : [];
  return Array.from(new Set(
    list
      .map((s) => String(s ?? "").trim())
      .map((s) => INTEREST_SYNONYM[s] ?? s)
      .filter((s) => INTEREST_SET.has(s)),
  )).slice(0, 10);
}

/** AI 關鍵字雜訊判斷（短詞，含長度上限） */
export function isNoiseKeyword(s: string, nameSet: Set<string>): boolean {
  const v = s.trim();
  if (!v || v.length > 12) return true;
  if (isPureNumberLike(v)) return true;
  if (EMAIL_TEST.test(v) || PHONE_TEST.test(v)) return true;
  if (nameSet.has(v)) return true;
  return hitOps(v);
}

export function sanitizeKeywords(arr: unknown, nameSet: Set<string>): string[] {
  const list = Array.isArray(arr) ? arr : [];
  return Array.from(new Set(
    list.map((s) => String(s ?? "").trim()).filter(Boolean),
  )).filter((k) => !isNoiseKeyword(k, nameSet)).slice(0, 12);
}

/** 客製化需求雜訊判斷（可為長句；不套字數上限，只濾作業用語/人名/純代碼/電話/email） */
export function isNoiseNeed(s: string, nameSet: Set<string>): boolean {
  const v = s.trim();
  if (!v) return true;
  const core = v.startsWith("AI：") ? v.slice("AI：".length).trim() : v;
  if (!core) return true;
  if (isPureCode(core)) return true;
  if (EMAIL_TEST.test(core) || PHONE_TEST.test(core)) return true;
  if (nameSet.has(core)) return true;
  return hitOps(core);
}

/** 需求清洗：只刪雜訊項目，真正的客製化需求保留，絕不整欄清空 */
export function sanitizeNeeds(arr: unknown, nameSet: Set<string>): string[] {
  const list = Array.isArray(arr) ? arr : [];
  return Array.from(new Set(
    list.map((s) => String(s ?? "").trim()).filter(Boolean),
  )).filter((n) => !isNoiseNeed(n, nameSet)).slice(0, 30);
}
