// 「房型與方案」三層價格編輯的純函式；驗證規則與 save_package_tier_prices RPC 相同（RPC 為最終把關）
import { getActualDiscountPercent } from "./discountDisplay";

export type PackageTier = "weekday" | "friday_sunday" | "weekend";
export const PACKAGE_TIERS: Array<{ key: PackageTier; label: string; hint: string }> = [
  { key: "weekday", label: "平日", hint: "週一～週四" },
  { key: "friday_sunday", label: "旺日", hint: "週五、週日" },
  { key: "weekend", label: "假日", hint: "週六、國定假日" },
];

export type TierDraft = Record<PackageTier, { sale: string; original: string }>;
export type TierPayload = Partial<Record<PackageTier, { sale: number; original: number }>>;

interface PackageLike {
  sale_price: number | null;
  original_price: number | null;
  tier_prices?: Partial<Record<string, { sale?: number | null; original?: number | null }>> | null;
}

const str = (v: unknown) => (v == null || v === "" ? "" : String(Number(v)));

export function toTierDraft(pkg: PackageLike): TierDraft {
  const tp = pkg.tier_prices || {};
  const weekday = tp.weekday ?? { sale: pkg.sale_price, original: pkg.original_price };
  return {
    weekday: { sale: str(weekday.sale), original: str(weekday.original) },
    friday_sunday: { sale: str(tp.friday_sunday?.sale), original: str(tp.friday_sunday?.original) },
    weekend: { sale: str(tp.weekend?.sale), original: str(tp.weekend?.original) },
  };
}

const parse = (s: string): number | null | "invalid" => {
  const t = s.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "invalid";
  return Number(t);
};

export function validateTierDraft(draft: TierDraft): { ok: true; payload: TierPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const payload: TierPayload = {};
  for (const { key, label } of PACKAGE_TIERS) {
    const sale = parse(draft[key].sale);
    const original = parse(draft[key].original);
    if (sale === "invalid" || original === "invalid") {
      errors.push(`${label}金額必須為正整數`);
      continue;
    }
    if (sale == null && original == null) continue;
    if (sale == null) {
      errors.push(`${label}有原價但沒有售價`);
      continue;
    }
    if (!(sale > 0)) {
      errors.push(`${label}售價必須大於 0`);
      continue;
    }
    const orig = original ?? sale;
    if (!(orig > 0)) {
      errors.push(`${label}原價必須大於 0`);
      continue;
    }
    if (orig < sale) {
      errors.push(`${label}原價不得低於售價`);
      continue;
    }
    payload[key] = { sale, original: orig };
  }
  if (!payload.weekday && !errors.some((e) => e.startsWith("平日"))) errors.push("平日售價必填");
  return errors.length ? { ok: false, errors } : { ok: true, payload };
}

// 實際折數：沿用 discountDisplay 的計算（原價 -N%）
export function tierDiscountLabel(saleStr: string, originalStr: string): string | null {
  const sale = parse(saleStr);
  const original = parse(originalStr);
  if (typeof sale !== "number" || sale <= 0) return null;
  const orig = typeof original === "number" ? original : sale;
  const pct = getActualDiscountPercent({ billedRoomTotal: orig, discountAmount: orig - sale });
  return pct == null ? "無折扣" : `原價 -${pct}%`;
}
