// 新價格頁館別的方案存檔：已啟用層級（tier_prices 有此 key 且有填售價）原價必填、> 0、不得低於售價
export const TIER_LABELS: Record<string, string> = { weekday: "平日", friday_sunday: "旺日", weekend: "假日" };

type Entry = { sale?: number | null; original?: number | null } | null | undefined;

export interface OriginalCheckInput {
  sale_price: number | null;
  original_price: number | null;
  tier_prices: Record<string, Entry> | null | undefined;
}

export function checkRequiredOriginals(input: OriginalCheckInput): { errors: string[]; badTiers: string[]; packageOriginalBad: boolean } {
  const errors: string[] = [];
  const badTiers: string[] = [];
  let packageOriginalBad = false;
  const sale = Number(input.sale_price);
  const orig = input.original_price == null ? null : Number(input.original_price);
  if (orig == null || !(orig > 0)) {
    errors.push("方案原價必填，且必須大於 0");
    packageOriginalBad = true;
  } else if (sale > 0 && orig < sale) {
    errors.push("方案原價不能低於售價");
    packageOriginalBad = true;
  }
  for (const [key, entry] of Object.entries(input.tier_prices || {})) {
    const s = entry?.sale == null ? null : Number(entry.sale);
    if (s == null || !(s > 0)) continue; // 沒填售價＝未啟用
    const o = entry?.original == null ? null : Number(entry.original);
    const label = TIER_LABELS[key] ?? key;
    if (o == null || !(o > 0)) {
      errors.push(`${label}原價必填，且必須大於 0`);
      badTiers.push(key);
    } else if (o < s) {
      errors.push(`${label}原價不能低於售價`);
      badTiers.push(key);
    }
  }
  return { errors, badTiers, packageOriginalBad };
}
