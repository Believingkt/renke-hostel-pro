type TierEntry = { sale?: number | null; original?: number | null } | null | undefined;

const positive = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

// 方案存檔用：0／空值視為沒填；售價與原價都沒填的日型不寫入；全部沒填回傳 {}（欄位預設，計價回退方案售價）
export function cleanTierPricesForSave(tiers: Record<string, TierEntry> | null | undefined) {
  const out: Record<string, { sale: number | null; original: number | null }> = {};
  for (const [key, entry] of Object.entries(tiers || {})) {
    const sale = positive(entry?.sale);
    const original = positive(entry?.original);
    if (sale === null && original === null) continue;
    out[key] = { sale, original };
  }
  return out;
}
