/**
 * 團隊獎金共用查詢邏輯（純函式，無 UI）。
 *
 * - 營收口徑統一使用 order_meta.team_commission_price
 * - 「目前生效版本」一律用 effective_from <= 今天(Asia/Taipei) 取最新一筆
 * - teamcommission_* 系列表尚未進 types.ts，查詢一律用 (client as any)
 */

import {
  getStayRevenueByAcc,
  getStayRevenueDualByAcc,
  usesStayRevenue,
  type DualRevenue,
} from "./teamBonusStayRevenue";

export type { DualRevenue };


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
 * 取「指定日期當時生效版本」：effective_from <= asOf 中 effective_from 最大者。
 * asOf 預設為今天（台北）。不可直接取陣列第一筆（會誤取未來生效版本）。
 */
export function pickCurrent<T extends { effective_from: string; created_at?: string }>(
  rows: T[],
  asOf?: string,
): T | null {
  const cutoff = asOf ?? taipeiToday();
  const eligible = (rows ?? []).filter((r) => r?.effective_from && r.effective_from <= cutoff);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) => {
    if (r.effective_from > best.effective_from) return r;
    if (r.effective_from === best.effective_from && (r.created_at ?? "") > (best.created_at ?? ""))
      return r;
    return best;
  });
}

/** 取每個 bonus_type 在指定日期（預設今天）生效版本的費率／固定金額 */
export async function getBonusRateSettings(
  client: any,
  asOf?: string,
): Promise<Record<string, BonusRateSetting>> {
  const cutoff = asOf ?? taipeiToday();
  const { data } = await client
    .from("teamcommission_bonus_rate_settings")
    .select("bonus_type, rate, fixed_amount, effective_from, created_at")
    .lte("effective_from", cutoff);

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
    const cur = pickCurrent(list, cutoff);
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

/** 取角色綁定在指定日期（預設今天）生效版本的 member_id（查無回 null） */
export async function getRoleBinding(
  client: any,
  roleType: RoleBindingType,
  asOf?: string,
): Promise<string | null> {
  const cutoff = asOf ?? taipeiToday();
  const { data } = await client
    .from("teamcommission_role_bindings")
    .select("member_id, effective_from, created_at")
    .eq("role_type", roleType)
    .lte("effective_from", cutoff);
  const cur = pickCurrent((data ?? []) as any[], cutoff);
  return cur?.member_id ?? null;
}

/** 取訂單來源白名單在指定日期（預設今天）生效版本（查無回空陣列） */
export async function getRevenueSourceWhitelist(
  client: any,
  table: RevenueSourceWhitelistTable,
  asOf?: string,
): Promise<string[]> {
  const cutoff = asOf ?? taipeiToday();
  const { data } = await client
    .from(table)
    .select("included_order_sources, effective_from, created_at")
    .lte("effective_from", cutoff);
  const cur = pickCurrent((data ?? []) as any[], cutoff);
  const sources = cur?.included_order_sources;
  if (!Array.isArray(sources)) return [];
  return sources.map((s: unknown) => String(s)).filter(Boolean);
}


const CHUNK = 500;

export type PayoutBasis = "include_owner_direct" | "exclude_owner_direct";

export interface PartnershipPeriod {
  start_date: string;
  end_date: string | null;
  bonus_policy: "full" | "none";
  /** 該段是否採計「成交大師獎金」（成交組分潤／影音分潤） */
  counts_closer_commission: boolean;
  /** 該段是否採計「團隊獎金」（AM／成交組績效、總管、網紅、場域） */
  counts_team_bonus: boolean;
  /** 該館團隊獎金實付基準（含／排除業主自帶） */
  payout_basis: PayoutBasis;
}

/** 可採計的日期區間（start 含、end 排他） */
export interface CountableRange {
  start: string;
  end: string;
}

/**
 * 取各館別的合作期間（可暫停／重啟）。
 * 未設定任何期間的館別不會出現在回傳 map —— 代表一律不計入任何團隊獎金。
 */
export async function getPartnershipPeriods(
  client: any,
  accommodationIds: string[],
): Promise<Record<string, PartnershipPeriod[]>> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const out: Record<string, PartnershipPeriod[]> = {};
  if (accIds.length === 0) return out;

  for (let i = 0; i < accIds.length; i += CHUNK) {
    const slice = accIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("accommodation_partnership_periods")
      .select(
        "accommodation_id, start_date, end_date, bonus_policy, counts_closer_commission, counts_team_bonus, payout_basis",
      )
      .in("accommodation_id", slice);
    for (const row of (data ?? []) as any[]) {
      const accId = String(row?.accommodation_id ?? "");
      if (!accId || !row?.start_date) continue;
      const legacyNone = row.bonus_policy === "none";
      const list = out[accId] ?? [];
      list.push({
        start_date: String(row.start_date).slice(0, 10),
        end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
        bonus_policy: legacyNone ? "none" : "full",
        counts_closer_commission: row.counts_closer_commission !== false && !legacyNone,
        counts_team_bonus: row.counts_team_bonus !== false && !legacyNone,
        payout_basis:
          row.payout_basis === "include_owner_direct"
            ? "include_owner_direct"
            : "exclude_owner_direct",
      });
      out[accId] = list;
    }
  }
  return out;
}

/** 各館別的團隊獎金實付基準（無設定時預設排除業主自帶）。取最新一段的設定。 */
export async function getPayoutBasisByAcc(
  client: any,
  accommodationIds: string[],
): Promise<Record<string, PayoutBasis>> {
  const periods = await getPartnershipPeriods(client, accommodationIds);
  const out: Record<string, PayoutBasis> = {};
  for (const [accId, list] of Object.entries(periods)) {
    const latest = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date)).pop();
    out[accId] = latest?.payout_basis ?? "exclude_owner_direct";
  }
  return out;
}

function addOneDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1));
  return dt.toISOString().slice(0, 10);
}

/** 採計用途：團隊獎金 vs 成交大師獎金（成交組／影音分潤） */
export type CountablePurpose = "team_bonus" | "closer_commission";

/** 把合作期間與資料月交集，換成可採計區間（不採計該用途的期間直接排除） */
export function periodsToCountableRanges(
  periods: PartnershipPeriod[] | undefined,
  monthStartDate: string,
  monthEndDate: string,
  purpose: CountablePurpose = "team_bonus",
): CountableRange[] {
  const out: CountableRange[] = [];
  for (const p of periods ?? []) {
    const counts =
      purpose === "closer_commission" ? p.counts_closer_commission : p.counts_team_bonus;
    if (!counts) continue;
    const start = p.start_date > monthStartDate ? p.start_date : monthStartDate;
    const periodEnd = p.end_date ? addOneDay(p.end_date) : monthEndDate;
    const end = periodEnd < monthEndDate ? periodEnd : monthEndDate;
    if (start < end) out.push({ start, end });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** 各館別在指定資料月可採計的日期區間 */
export async function getCountableRangesByAcc(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  purpose: CountablePurpose = "team_bonus",
): Promise<Record<string, CountableRange[]>> {
  const periods = await getPartnershipPeriods(client, accommodationIds);
  const out: Record<string, CountableRange[]> = {};
  for (const accId of Object.keys(periods)) {
    const ranges = periodsToCountableRanges(
      periods[accId],
      monthStartDate,
      monthEndDate,
      purpose,
    );
    if (ranges.length > 0) out[accId] = ranges;
  }
  return out;
}

/**
 * 取指定館別、指定月份、指定訂單來源白名單的分潤基準營收加總。
 * monthEndDate 為排他。
 */
export async function getAccommodationRevenue(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  allowedSources: string[],
): Promise<number> {
  const byAcc = await getAccommodationRevenueByAcc(
    client,
    accommodationIds,
    monthStartDate,
    monthEndDate,
    allowedSources,
  );
  return Object.values(byAcc).reduce((s, v) => s + v, 0);
}

/**
 * 雙軌營收：各館別「含業主自帶 / 排除業主自帶」的基準營收。
 *
 * 採計範圍：各館合作期間（可暫停／重啟）與資料月的交集。
 * 沒有任何有效合作期間的館別一律略過（不計入任何團隊獎金）。
 *
 * 口徑：資料月 >= STAY_REVENUE_SWITCH_MONTH 改用「入住營收」（與業主月結一致），
 * 之前的月份維持舊口徑（order_date + team_commission_price）。
 */
export async function getAccommodationRevenueDualByAcc(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  allowedSources: string[],
): Promise<Record<string, DualRevenue>> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const sources = Array.from(new Set((allowedSources ?? []).filter(Boolean)));
  const out: Record<string, DualRevenue> = {};
  if (accIds.length === 0 || sources.length === 0) return out;

  const rangesByAcc = await getCountableRangesByAcc(
    client,
    accIds,
    monthStartDate,
    monthEndDate,
    "team_bonus",
  );

  if (usesStayRevenue(monthStartDate)) {
    return await getStayRevenueDualByAcc(
      client,
      accIds,
      monthStartDate,
      monthEndDate,
      sources,
      rangesByAcc,
    );
  }

  // 舊口徑：以 order_date 落在可採計區間內的訂單為準
  for (const accId of accIds) {
    const ranges = rangesByAcc[accId] ?? [];
    for (const range of ranges) {
      const { data } = await client
        .from("orders")
        .select(
          "id, accommodation_id, owner_direct, order_meta(team_commission_price, is_excluded)",
        )
        .eq("accommodation_id", accId)
        .gte("order_date", range.start)
        .lt("order_date", range.end)
        .neq("order_status", "cancelled")
        .neq("order_status", "hold")
        .in("order_source", sources);

      for (const row of (data ?? []) as any[]) {
        const meta = Array.isArray(row?.order_meta) ? row.order_meta[0] : row?.order_meta;
        if (!meta) continue;
        if (meta.is_excluded === true) continue;
        const amt = Number(meta.team_commission_price ?? 0) || 0;
        if (!amt) continue;
        const cur = out[accId] ?? { incl: 0, excl: 0 };
        cur.incl += amt;
        if (row?.owner_direct !== true) cur.excl += amt;
        out[accId] = cur;
      }
    }
  }
  return out;
}

/**
 * 各館別營收（單軌）。依各館 payout_basis 決定回傳含／排除業主自帶的金額。
 * 未設定者預設「排除業主自帶」。
 */
export async function getAccommodationRevenueByAcc(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  allowedSources: string[],
): Promise<Record<string, number>> {
  const dual = await getAccommodationRevenueDualByAcc(
    client,
    accommodationIds,
    monthStartDate,
    monthEndDate,
    allowedSources,
  );
  const basis = await getPayoutBasisByAcc(client, Object.keys(dual));
  const out: Record<string, number> = {};
  for (const [accId, v] of Object.entries(dual)) {
    out[accId] = basis[accId] === "include_owner_direct" ? v.incl : v.excl;
  }
  return out;
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

/**
 * 取得「該成員在指定月份為場域簽約人」的館別清單。
 * teamcommission_venue_closing_assignments 為 append-only 版本化：
 * 依 accommodation_id 分組取 effective_from <= monthStartDate 的最新一筆。
 */
export async function getVenueClosingAccommodations(
  client: any,
  memberProfileId: string,
  monthStartDate: string,
): Promise<string[]> {
  if (!memberProfileId) return [];
  // 只要在「資料月內任一天」生效即計入該資料月（隔月發放）
  const monthLastDate = `${monthStartDate.slice(0, 7)}-31`;
  const { data } = await client
    .from("teamcommission_venue_closing_assignments")
    .select("accommodation_id, member_id, effective_from, created_at")
    .lte("effective_from", monthLastDate);

  const byAcc = new Map<string, any[]>();
  for (const row of (data ?? []) as any[]) {
    const key = row?.accommodation_id;
    if (!key) continue;
    const list = byAcc.get(key) ?? [];
    list.push(row);
    byAcc.set(key, list);
  }

  const matched: string[] = [];
  for (const [accId, list] of byAcc) {
    const latest = list.reduce((best, r) => {
      const ef = String(r.effective_from ?? "").localeCompare(String(best.effective_from ?? ""));
      if (ef > 0) return r;
      if (ef === 0 && String(r.created_at ?? "") > String(best.created_at ?? "")) return r;
      return best;
    });
    if (latest?.member_id === memberProfileId) matched.push(accId);
  }

  // 資料月內沒有任何有效合作期間（含暫停中／不採計）者不計場域成交獎金
  const monthStartExclusiveEnd = addOneDay(monthLastDate);
  const rangesByAcc = await getCountableRangesByAcc(
    client,
    matched,
    monthStartDate,
    monthStartExclusiveEnd,
  );
  const out = matched.filter((accId) => (rangesByAcc[accId] ?? []).length > 0);


  return out;
}

/** 由日期字串取 M/D 顯示 */
function mdLabel(date: string): string {
  const [, m, d] = date.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}`;
}

function minusOneDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) - 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * 若某館別在該資料月的可採計區間不是「整月」，回傳提醒文字；
 * 完整整月則回傳 null（不顯示提醒）。
 * monthEndDate 為排他（下個月 1 號）。
 */
export function formatCountableRangeNote(
  ranges: CountableRange[] | undefined,
  monthStartDate: string,
  monthEndDate: string,
): string | null {
  if (!ranges || ranges.length === 0) return null;
  const isFullMonth =
    ranges.length === 1 &&
    ranges[0].start <= monthStartDate &&
    ranges[0].end >= monthEndDate;
  if (isFullMonth) return null;
  const parts = ranges.map((r) => `${mdLabel(r.start)}–${mdLabel(minusOneDay(r.end))}`);
  return `本期僅採計合作期間 ${parts.join("、")}（非整月，與業主月結整月營收不同）`;
}
