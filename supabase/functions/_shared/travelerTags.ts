// 旅客標籤 / 關鍵字 / 需求的受控詞彙與過濾規則。
// 給 traveler-tagging、traveler-sync、traveler-cleanup 共用，確保「寫入時」與「清洗時」同一套規則。

export const INTEREST_WHITELIST = [
  "包棟", "親子", "親子友善", "寵物友善", "美食", "烤肉", "戶外", "溫泉", "情侶", "團體",
  "長輩同行", "湖景", "山景", "海景", "夜景", "露營", "商務", "包場", "慶生", "蜜月",
  "聚會", "放鬆", "泳池", "戲水", "星空", "景觀", "包棟烤肉", "氣泡湯", "無障礙", "早餐",
  "賞花", "賞楓", "療癒", "網美",
];
export const INTEREST_SET = new Set(INTEREST_WHITELIST);

// 同義詞歸一到受控詞彙（先「轉換」再過濾，不可直接刪掉真實興趣）
export const INTEREST_SYNONYM: Record<string, string> = {
  "寵物": "寵物友善", "毛小孩": "寵物友善", "寵物同行": "寵物友善",
  "家庭": "親子", "小孩": "親子", "兒童": "親子", "孩子": "親子", "親子同遊": "親子", "親子旅遊": "親子",
  "泡湯": "溫泉", "溫泉湯屋": "溫泉",
  "長輩": "長輩同行", "家族": "團體", "朋友": "團體", "多人": "團體",
  "湖畔": "湖景", "湖邊": "湖景",
  "BBQ": "烤肉", "bbq": "烤肉", "Bbq": "烤肉", "炭烤": "烤肉", "燒烤": "烤肉", "烤肉趴": "烤肉",
  "游泳": "泳池", "戲水池": "泳池",
  "賞櫻": "賞花", "賞楓葉": "賞楓",
};

// 回傳某標籤「轉換後」的受控詞彙；非白名單則回 null
export function mapInterest(tag: string): string | null {
  const v = String(tag ?? "").trim();
  if (!v) return null;
  const mapped = INTEREST_SYNONYM[v] ?? v;
  return INTEREST_SET.has(mapped) ? mapped : null;
}

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

/** 興趣標籤：同義詞「轉換」+ 受控詞彙白名單（真實興趣先轉換，不直接刪） */
export function sanitizeInterestTags(arr: unknown): string[] {
  const list = Array.isArray(arr) ? arr : [];
  const out: string[] = [];
  for (const t of list) {
    const m = mapInterest(String(t ?? ""));
    if (m) out.push(m);
  }
  return Array.from(new Set(out)).slice(0, 10);
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

// 系統/備註行樣式（逐行剔除用）
const SYSTEM_NEED_PATTERNS: RegExp[] = [
  /【[^】]*(變更|配置|包棟|包區|團購|通知|訂金|尾款|付款|狀態)[^】]*】/,
  /奧丁丁|owlting/i,
  /\bOBE[-_\s]?\d+/i,
  /\[\s*DEMO_SEED\s*\]/i,
  /\[[^\]]*(奧丁丁|owlting|修改通知|通知)[^\]]*\]/i,
];

/** 把 custom_needs 陣列拆成「逐行」（去空白、去空行），供逐行剔除與統計共用 */
export function needLines(arr: unknown): string[] {
  const list = Array.isArray(arr) ? arr : [];
  const out: string[] = [];
  for (const el of list) {
    for (const ln of String(el ?? "").split(/\r?\n/)) {
      const t = ln.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** 單「行」需求雜訊判斷：系統行/備註標記/純時間人數碎片/人名/純代碼/電話/email/作業用語 → true（剔除） */
export function isNoiseNeedLine(line: string, nameSet: Set<string>): boolean {
  const v = line.trim();
  if (!v) return true;
  const core = v.startsWith("AI：") ? v.slice("AI：".length).trim() : v;
  if (!core) return true;
  if (SYSTEM_NEED_PATTERNS.some((re) => re.test(core))) return true;
  // 純時間 / 人數 / 房數碎片（例：「9:00 14位」「2大1小」「14位」）
  if (core.replace(/[\d\s:：位人大小孩嬰兒名組晚天房間,，.、\-~～()（）]/g, "") === "") return true;
  if (isPureCode(core)) return true;
  if (EMAIL_TEST.test(core) || PHONE_TEST.test(core)) return true;
  if (nameSet.has(core)) return true;
  return hitOps(core);
}

/**
 * 需求清洗：先逐行拆開，只剔除系統/備註行，保留人寫的需求句，再去重。
 * 絕不整筆刪除混合備註——人寫的需求句會倖存。
 */
export function sanitizeNeeds(arr: unknown, nameSet: Set<string>): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const ln of needLines(arr)) {
    if (isNoiseNeedLine(ln, nameSet)) continue;
    if (seen.has(ln)) continue;
    seen.add(ln);
    kept.push(ln);
  }
  return kept.slice(0, 40);
}
