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

/**
 * 讀取使用者在 DualCurrencyInput 上記住的輸入幣別偏好。
 * 用於決定列表/詳情頁主幣別顯示方向（SEC 主、TWD 副 vs. TWD 主、SEC 副）。
 */
export function getDisplayCurrencyMode(storageKey?: string | null): "TWD" | "SEC" {
  if (!storageKey) return "TWD";
  try {
    const v = localStorage.getItem(`lakeze-input-currency:${storageKey}`);
    if (v === "SEC") return "SEC";
  } catch {}
  return "TWD";
}

/**
 * 營運分析用：全域幣別檢視模式（僅套用於有設定副幣別的民宿，如旅行日）
 *  - separate: 只取指定幣別的訂單參與計算（禁止跨幣別加總）
 *  - consolidated: 將 JPY 訂單依匯率換算成 TWD 後與 TWD 訂單合併
 */
export type CurrencyMode =
  | { view: "separate"; currency: string }
  | { view: "consolidated"; jpyRate: number };

/** 從 orders row（含 order_meta join）取出實際交易幣別，預設 TWD */
export function orderCurrency(order: any): string {
  const meta = order?.order_meta;
  const raw =
    (Array.isArray(meta) ? meta[0]?.display_currency : meta?.display_currency) ??
    order?.currency ??
    order?.display_currency ??
    "TWD";
  return String(raw || "TWD").toUpperCase();
}

/**
 * 依 CurrencyMode 過濾/換算訂單陣列。
 *  - 未提供 mode → 原樣回傳（維持既有行為，適用於未設副幣別的民宿）
 *  - separate → 只留下符合幣別的訂單，金額不變
 *  - consolidated → JPY 訂單金額 × jpyRate 換算為 TWD，並將 currency 標成 TWD
 */
export function applyCurrencyMode<T extends Record<string, any>>(
  orders: T[],
  mode?: CurrencyMode | null,
): T[] {
  if (!mode) return orders;
  if (mode.view === "separate") {
    return orders.filter((o) => orderCurrency(o) === mode.currency.toUpperCase());
  }
  const rate = Number(mode.jpyRate) || 0;
  return orders.map((o) => {
    const cur = orderCurrency(o);
    if (cur === "TWD") return o;
    const mult = cur === "JPY" ? rate : 1;
    const conv = (v: any) => (v == null ? v : Number(v) * mult);
    return {
      ...o,
      final_price: conv(o.final_price),
      paid_amount: conv(o.paid_amount),
      total_price: conv(o.total_price),
      deposit_amount: conv(o.deposit_amount),
    } as T;
  });
}

/** 依 CurrencyMode 取得主要顯示符號（consolidated 一律 NT$） */
export function currencyModeSymbol(mode?: CurrencyMode | null): string {
  if (!mode || mode.view === "consolidated") return "NT$";
  return getCurrencySymbol(mode.currency) || mode.currency;
}
