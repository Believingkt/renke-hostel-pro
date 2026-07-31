/**
 * 加購方案文案正規化
 * 後台的 description / unit_label 常被填成整段說明（例："NT$ 800 / 不加床，只加備品、餐食、門票"），
 * 前台顯示會過長且單位不明確。這裡統一在顯示層做清理，不更動任何資料或金額邏輯。
 */

/** 取出乾淨的方案名稱：移除開頭的價格前綴（NT$ 800 /、每人 NT$ 500 / …） */
export function cleanAddonName(raw?: string | null, fallback = "加購方案"): string {
  let s = (raw ?? "").trim();
  s = s.replace(/^每[^\s/／]{0,8}\s*/i, "");
  s = s.replace(/^NT\$?\s*[\d,]+\s*(?:\/|／)?\s*/i, "");
  s = s.replace(/^[／/、,，\-–—:：]\s*/, "").trim();
  return s || (raw ?? "").trim() || fallback;
}

/** 單位詞：過長或含標點的自由文字一律回退為「份」 */
export function shortUnit(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "份";
  if (s.length > 3 || /[，,、。．/／（）()]/.test(s)) return "份";
  return s;
}

/** 加購計價方式：per_night = 每晚計算；per_stay = 整筆訂單只計一次 */
export type AddonPricingMode = "per_night" | "per_stay";

export function normalizeAddonPricingMode(raw?: string | null): AddonPricingMode {
  return raw === "per_stay" ? "per_stay" : "per_night";
}

/** 計價倍數：每晚計價 × 晚數；單次計價固定 1 */
export function addonNightsMultiplier(pricingMode: string | null | undefined, nights: number): number {
  return normalizeAddonPricingMode(pricingMode) === "per_stay" ? 1 : Math.max(0, nights);
}

/** 計價方式的後綴文字（／晚 或 ／整筆訂單） */
export function addonPricingSuffix(pricingMode?: string | null): string {
  return normalizeAddonPricingMode(pricingMode) === "per_stay" ? "／整筆訂單" : "／晚";
}

/** 卡片副標：每份 NT$ 800／晚・最多 5 份 */
export function addonPriceLine(pricePerUnit: number, unitLabel?: string | null, maxQuantity?: number | null, pricingMode?: string | null): string {
  const u = shortUnit(unitLabel);
  const parts = [`每${u} NT$ ${pricePerUnit.toLocaleString()}${addonPricingSuffix(pricingMode)}`];
  if (maxQuantity && maxQuantity > 0) parts.push(`最多 ${maxQuantity} ${u}`);
  return parts.join("・");
}

/** 名稱是否含價格前綴（例："NT$ 800 /…"、"每人 NT$ 500"） */
export function hasPricePrefix(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  return /NT\$?\s*[\d,]+/i.test(s) || /^每[^\s/／]{0,8}\s*(?=NT|\d)/i.test(s);
}

/** 單位詞是否過長或含標點（顯示時會被回退成「份」） */
export function isVerboseUnit(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  return s.length > 3 || /[，,、。．/／（）()]/.test(s);
}

/** 起訂量（數量下限）：0 或未設定代表沒有下限 */
export function addonMinQuantity(raw?: number | null): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 按「＋」時的下一個數量：從 0 起算會直接帶入起訂量 */
export function addonStepUp(current: number, min?: number | null, max?: number | null): number {
  const lo = addonMinQuantity(min);
  const hi = Number(max ?? 0) > 0 ? Number(max) : Number.POSITIVE_INFINITY;
  const next = current <= 0 ? Math.max(1, lo) : current + 1;
  return Math.min(next, hi);
}

/** 按「－」時的下一個數量：低於起訂量就直接歸零 */
export function addonStepDown(current: number, min?: number | null): number {
  const lo = addonMinQuantity(min);
  const next = current - 1;
  return next < Math.max(1, lo) ? 0 : next;
}
