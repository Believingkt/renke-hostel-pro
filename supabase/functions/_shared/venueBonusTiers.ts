// 館別專屬獎金級距規則（venue_team_bonus_tier_rules）唯一計算真相。
//
// 同時被：
//   - 後端 supabase/functions/create-team-bonus-snapshots/index.ts（鎖定快照）
//   - 前端 src/pages/team/TeamHome.tsx（尚無快照時的即時試算）
// import，避免演算法雙寫造成兩邊數字不一致。
//
// 規則（見 mem://features/admin/venue-team-bonus-tier-rules）：
//   - tiers 為「整筆套用（flat）」，非超額累進；低於最低門檻 → 不發（rate 0）
//   - 版本以 accommodation_id + bonus_type + effective_from 判定，asOf = 資料月 1 日
//   - 查無規則的館 → fallback 回系統費率

// deno-lint-ignore-file no-explicit-any

export interface BonusTier {
  /** 門檻營收（含）；達到此門檻即整筆套用該階費率 */
  min_revenue: number;
  rate: number;
}

export interface VenueTierRule {
  id: string;
  accommodation_id: string;
  bonus_type: string;
  effective_from: string;
  created_at?: string;
  tiers: BonusTier[];
}

/** 使用館別級距的獎金類型 */
export const VENUE_TIER_BONUS_TYPES = [
  "am_performance",
  "am_manager",
  "closer_performance",
] as const;

interface Versioned {
  effective_from: string;
  created_at?: string;
}

/** 取 effective_from <= asOf 中 effective_from 最大者（同日取 created_at 最新） */
export function pickCurrentVersion<T extends Versioned>(rows: T[], asOf: string): T | null {
  const eligible = (rows ?? []).filter((r) => r?.effective_from && r.effective_from <= asOf);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) => {
    if (r.effective_from > best.effective_from) return r;
    if (r.effective_from === best.effective_from && (r.created_at ?? "") > (best.created_at ?? ""))
      return r;
    return best;
  });
}

/** 依「整筆套用」規則挑出命中的級距；低於最低門檻則回 null（＝不發） */
export function pickTier(tiers: BonusTier[], revenue: number): BonusTier | null {
  const sorted = (tiers ?? [])
    .filter((t) => t && Number.isFinite(Number(t.min_revenue)))
    .map((t) => ({ min_revenue: Number(t.min_revenue), rate: Number(t.rate ?? 0) }))
    .sort((a, b) => a.min_revenue - b.min_revenue);
  let hit: BonusTier | null = null;
  for (const t of sorted) {
    if (revenue >= t.min_revenue) hit = t;
    else break;
  }
  return hit;
}

export const venueTierKey = (accId: string, bonusType: string) => `${accId}|${bonusType}`;

/** 取各館各獎金類型「資料月當時生效」的級距規則版本 */
export async function loadVenueTierRules(
  client: any,
  asOf: string,
): Promise<Map<string, VenueTierRule>> {
  const { data } = await client
    .from("venue_team_bonus_tier_rules")
    .select("id, accommodation_id, bonus_type, effective_from, created_at, tiers")
    .lte("effective_from", asOf);

  const grouped = new Map<string, VenueTierRule[]>();
  for (const row of (data ?? []) as any[]) {
    const key = venueTierKey(String(row.accommodation_id), String(row.bonus_type));
    const list = grouped.get(key) ?? [];
    list.push({ ...row, tiers: Array.isArray(row.tiers) ? row.tiers : [] });
    grouped.set(key, list);
  }

  const out = new Map<string, VenueTierRule>();
  for (const [key, list] of grouped) {
    const cur = pickCurrentVersion(list, asOf);
    if (cur) out.set(key, cur);
  }
  return out;
}

export interface ResolvedVenueRate {
  rate: number;
  tierRuleId: string | null;
  tierMin: number | null;
}

/**
 * 逐館費率解析：有館別級距規則的館用級距（整筆套用），
 * 沒有規則的館 fallback 回系統費率。
 */
export function resolveVenueRate(
  rules: Map<string, VenueTierRule>,
  accId: string,
  bonusType: string,
  defaultRate: number | null,
  revenue: number,
): ResolvedVenueRate {
  const rule = rules.get(venueTierKey(accId, bonusType));
  if (!rule) return { rate: Number(defaultRate ?? 0), tierRuleId: null, tierMin: null };
  const tier = pickTier(rule.tiers, revenue);
  return {
    rate: Number(tier?.rate ?? 0),
    tierRuleId: rule.id,
    tierMin: tier ? Number(tier.min_revenue) : null,
  };
}
