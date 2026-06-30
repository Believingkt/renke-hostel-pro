/**
 * 雙幣別顯示工具
 * 
 * 系統金流、結算、分潤一律以 TWD 為主。本工具僅用於「顯示」上同時帶出
 * 副幣別參考價（例如旅行日民宿針對日本旅客顯示 JPY）。
 * 
 * 規則：
 *  - DB 內所有金額仍為 TWD
 *  - secondary_currency 為 NULL / rate <= 0 → 自動回退為純 TWD 顯示
 *  - 副幣別只供參考，UI 應加註「約」或「≈」字樣
 */

/** 旅行日 accommodation id，硬編碼避免誤觸發其他民宿 */
export const TRAVELDAYS_ACC_ID = "fb894708-d807-42b0-aaba-d4329ab34467";

export interface SecondaryCurrencyConfig {
  code: string;       // e.g. 'JPY'
  rate: number;       // 1 TWD = rate * secondary
  symbol: string;     // e.g. '¥'
}

const SYMBOL_MAP: Record<string, string> = {
  JPY: "¥",
  USD: "$",
  CNY: "¥",
  KRW: "₩",
  HKD: "HK$",
  EUR: "€",
};

export function getCurrencySymbol(code: string): string {
  return SYMBOL_MAP[code?.toUpperCase()] || code || "";
}

export function formatTWD(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  return `NT$ ${n.toLocaleString("zh-TW")}`;
}

export function formatSecondary(
  amountTwd: number | null | undefined,
  config: SecondaryCurrencyConfig | null | undefined,
): string {
  if (!config || !config.rate || config.rate <= 0) return "";
  const n = Number(amountTwd) || 0;
  const converted = Math.round(n * config.rate);
  return `${config.symbol} ${converted.toLocaleString("zh-TW")}`;
}

/**
 * 同行雙幣別顯示，例：「NT$ 12,000（≈ ¥ 56,400）」
 * 若無副幣別設定，回傳純 TWD
 */
export function formatDual(
  amountTwd: number | null | undefined,
  config: SecondaryCurrencyConfig | null | undefined,
): string {
  const primary = formatTWD(amountTwd);
  if (!config || !config.rate || config.rate <= 0) return primary;
  return `${primary}（≈ ${formatSecondary(amountTwd, config)}）`;
}

/**
 * 純粹解析 accommodation_info 撈到的 row → config
 */
export function parseSecondaryCurrency(row: {
  secondary_currency?: string | null;
  secondary_currency_rate?: number | null;
} | null | undefined): SecondaryCurrencyConfig | null {
  if (!row) return null;
  const code = (row.secondary_currency || "").trim().toUpperCase();
  const rate = Number(row.secondary_currency_rate);
  if (!code) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { code, rate, symbol: getCurrencySymbol(code) };
}
