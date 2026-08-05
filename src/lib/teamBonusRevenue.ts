/**
 * 團隊獎金共用查詢邏輯（純函式，無 UI）。
 *
 * - 營收口徑統一使用 order_meta.team_commission_price
 * - 「目前生效版本」一律用 effective_from <= 今天(Asia/Taipei) 取最新一筆
 * - teamcommission_* 系列表尚未進 types.ts，查詢一律用 (client as any)
 */

export type BonusType =
  | "am_performance"
  | "closer_performance"
  | "am_manager"
  | "closer_manager"
  | "kol_commission"
  | "kol_monthly"
  | "venue_closing";

export type RoleBindingType = "am_manager" | "closer_manager" | "kol_bonus_recipient";

export type RevenueSourceWhitelistTable =
  | "teamcommission_shared_revenue_source_whitelist"
  | "teamcommission_kol_revenue_source_whitelist";

export interface BonusRateSetting {
  rate: number | null;
  fixed_amount: number | null;
}

/** 今天（Asia/Taipei）YYYY-MM-DD */
export function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 取「目前生效版本」：effective_from <= 今天(台北) 中 effective_from 最大者。
 * 不可直接取陣列第一筆（會誤取未來生效版本）。
 */
export function pickCurrent<T extends { effective_from: string; created_at?: string }>(
  rows: T[],
): T | null {
  const today = taipeiToday();
  const eligible = (rows ?? []).filter((r) => r?.effective_from && r.effective_from <= today);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) => {
    if (r.effective_from > best.effective_from) return r;
    if (r.effective_from === best.effective_from && (r.created_at ?? "") > (best.created_at ?? ""))
      return r;
    return best;
  });
}

/** 取每個 bonus_type 目前生效版本的費率／固定金額 */
export async function getBonusRateSettings(
  client: any,
): Promise<Record<string, BonusRateSetting>> {
  const today = taipeiToday();
  const { data } = await client
    .from("teamcommission_bonus_rate_settings")
    .select("bonus_type, rate, fixed_amount, effective_from, created_at")
    .lte("effective_from", today);

  const grouped = new Map<string, any[]>();
  for (const row of (data ?? []) as any[]) {
    const key = String(row?.bonus_type ?? "");
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const out: Record<string, BonusRateSetting> = {};
  for (const [key, list] of grouped) {
    const cur = pickCurrent(list);
    if (!cur) continue;
    out[key] = {
      rate: cur.rate === null || cur.rate === undefined ? null : Number(cur.rate),
      fixed_amount:
        cur.fixed_amount === null || cur.fixed_amount === undefined
          ? null
          : Number(cur.fixed_amount),
    };
  }
  return out;
}

/** 取角色綁定目前生效版本的 member_id（查無回 null） */
export async function getRoleBinding(
  client: any,
  roleType: RoleBindingType,
): Promise<string | null> {
  const today = taipeiToday();
  const { data } = await client
    .from("teamcommission_role_bindings")
    .select("member_id, effective_from, created_at")
    .eq("role_type", roleType)
    .lte("effective_from", today);
  const cur = pickCurrent((data ?? []) as any[]);
  return cur?.member_id ?? null;
}

/** 取訂單來源白名單目前生效版本（查無回空陣列） */
export async function getRevenueSourceWhitelist(
  client: any,
  table: RevenueSourceWhitelistTable,
): Promise<string[]> {
  const today = taipeiToday();
  const { data } = await client
    .from(table)
    .select("included_order_sources, effective_from, created_at")
    .lte("effective_from", today);
  const cur = pickCurrent((data ?? []) as any[]);
  const sources = cur?.included_order_sources;
  if (!Array.isArray(sources)) return [];
  return sources.map((s: unknown) => String(s)).filter(Boolean);
}

const CHUNK = 500;

/**
 * 取指定館別、指定月份、指定訂單來源白名單的分潤基準營收加總。
 * monthEndDate 為排他（order_date < monthEndDate）。
 */
export async function getAccommodationRevenue(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  allowedSources: string[],
): Promise<number> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const sources = Array.from(new Set((allowedSources ?? []).filter(Boolean)));
  if (accIds.length === 0 || sources.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < accIds.length; i += CHUNK) {
    const slice = accIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("orders")
      .select("id, order_meta(team_commission_price, is_excluded)")
      .in("accommodation_id", slice)
      .gte("order_date", monthStartDate)
      .lt("order_date", monthEndDate)
      .neq("order_status", "cancelled")
      .neq("guest_name", "保留單")
      .in("order_source", sources);

    for (const row of (data ?? []) as any[]) {
      const meta = Array.isArray(row?.order_meta) ? row.order_meta[0] : row?.order_meta;
      if (!meta) continue;
      if (meta.is_excluded === true) continue;
      total += Number(meta.team_commission_price ?? 0) || 0;
    }
  }
  return total;
}

/**
 * 取各館別在指定月份是否約定收取行銷推廣費。
 * owner_settlement_pricing_rules 為 append-only 且每館獨立版本，需逐館取最新一筆。
 */
export async function getMarketingFeeFlags(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
): Promise<Record<string, boolean>> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const out: Record<string, boolean> = {};
  if (accIds.length === 0) return out;

  const byAcc = new Map<string, any[]>();
  for (let i = 0; i < accIds.length; i += CHUNK) {
    const slice = accIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("owner_settlement_pricing_rules")
      .select("accommodation_id, charges_marketing_fee, effective_from, created_at")
      .in("accommodation_id", slice)
      .lte("effective_from", monthStartDate);
    for (const row of (data ?? []) as any[]) {
      const key = row?.accommodation_id;
      if (!key) continue;
      const list = byAcc.get(key) ?? [];
      list.push(row);
      byAcc.set(key, list);
    }
  }

  for (const accId of accIds) {
    const list = byAcc.get(accId) ?? [];
    if (list.length === 0) {
      out[accId] = false;
      continue;
    }
    const latest = list.reduce((best, r) => {
      const ef = String(r.effective_from ?? "").localeCompare(String(best.effective_from ?? ""));
      if (ef > 0) return r;
      if (ef === 0 && String(r.created_at ?? "") > String(best.created_at ?? "")) return r;
      return best;
    });
    out[accId] = latest?.charges_marketing_fee === true;
  }
  return out;
}
