// 每月鎖定八種團隊獎金金額 → teamcommission_bonus_snapshots
//
// 設計原則（比照 create-commission-snapshots）：
// - 非 test_mode 時，只有台北時間「當月 10 日」實際執行，其餘回傳 skipped
// - snapshot_month = 上個月；payout_month = 執行當下月份（可用 test_month 覆寫 snapshot_month）
// - 所有版本判定（費率／白名單／角色綁定／簽約人／行銷費旗標）一律用
//   asOf = snapshot_month + "-01"，鎖定「結算月當時生效的版本」，
//   事後修改設定表不會回溯影響已鎖定月份
// - 逐筆 insert，UNIQUE(bonus_type, member_id, snapshot_month) 衝突（23505）視為 skipped
//
// 計算邏輯完全比照 src/pages/team/TeamHome.tsx 的即時試算，只是搬到後端並鎖定版本。
// 註：Edge Function 無法 import src/ 下的檔案，teamBonusRevenue.ts 的邏輯在此重寫一份。

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { isSuperAdmin, resolveCaller } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BONUS_TYPES = [
  "am_performance",
  "am_venue_bonus",
  "closer_performance",
  "am_manager",
  "closer_manager",
  "kol_commission",
  "kol_monthly",
  "venue_closing",
] as const;
type BonusType = (typeof BONUS_TYPES)[number];

const pad2 = (n: number) => String(n).padStart(2, "0");

function getTaipeiParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), day: Number(parts.day) };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ============================ 版本化設定查詢（asOf 版） ============================ */

interface Versioned {
  effective_from: string;
  created_at?: string;
}

/** 取 effective_from <= asOf 中 effective_from 最大者（同日取 created_at 最新） */
function pickCurrent<T extends Versioned>(rows: T[], asOf: string): T | null {
  const eligible = (rows ?? []).filter((r) => r?.effective_from && r.effective_from <= asOf);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) => {
    if (r.effective_from > best.effective_from) return r;
    if (r.effective_from === best.effective_from && (r.created_at ?? "") > (best.created_at ?? ""))
      return r;
    return best;
  });
}

interface BonusRateSetting {
  rate: number | null;
  fixed_amount: number | null;
}

async function getBonusRateSettings(
  client: any,
  asOf: string,
): Promise<Record<string, BonusRateSetting>> {
  const { data } = await client
    .from("teamcommission_bonus_rate_settings")
    .select("bonus_type, rate, fixed_amount, effective_from, created_at")
    .lte("effective_from", asOf);

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
    const cur = pickCurrent(list, asOf);
    if (!cur) continue;
    out[key] = {
      rate: cur.rate == null ? null : Number(cur.rate),
      fixed_amount: cur.fixed_amount == null ? null : Number(cur.fixed_amount),
    };
  }
  return out;
}

async function getRoleBinding(
  client: any,
  roleType: "am_manager" | "closer_manager" | "kol_bonus_recipient",
  asOf: string,
): Promise<string | null> {
  const { data } = await client
    .from("teamcommission_role_bindings")
    .select("member_id, effective_from, created_at")
    .eq("role_type", roleType)
    .lte("effective_from", asOf);
  const cur = pickCurrent((data ?? []) as any[], asOf);
  return cur?.member_id ?? null;
}

async function getRevenueSourceWhitelist(
  client: any,
  table:
    | "teamcommission_shared_revenue_source_whitelist"
    | "teamcommission_kol_revenue_source_whitelist",
  asOf: string,
): Promise<string[]> {
  const { data } = await client
    .from(table)
    .select("included_order_sources, effective_from, created_at")
    .lte("effective_from", asOf);
  const cur = pickCurrent((data ?? []) as any[], asOf);
  const sources = cur?.included_order_sources;
  if (!Array.isArray(sources)) return [];
  return sources.map((s: unknown) => String(s)).filter(Boolean);
}

const CHUNK = 500;

/** 團隊獎金口徑切換生效資料月（含當月起改用入住營收，與業主月結一致） */
const STAY_REVENUE_SWITCH_MONTH = "2026-07-01";

interface CountableRange {
  start: string;
  end: string; // 排他
}

function addOneDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

function nightsBetween(ci: string, co: string): number {
  const a = Date.parse(`${ci}T00:00:00Z`);
  const b = Date.parse(`${co}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/**
 * 各館別在資料月內「可採計的日期區間」（團隊獎金用途）。
 * 來源：accommodation_partnership_periods（可暫停／重啟；counts_team_bonus = false 不採計）。
 * 沒有任何有效區間的館別 —— 一律不計入任何團隊獎金。
 */
async function getCountableRangesByAcc(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
): Promise<Record<string, CountableRange[]>> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const out: Record<string, CountableRange[]> = {};
  if (accIds.length === 0) return out;

  for (let i = 0; i < accIds.length; i += CHUNK) {
    const slice = accIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("accommodation_partnership_periods")
      .select("accommodation_id, start_date, end_date, bonus_policy, counts_team_bonus")
      .in("accommodation_id", slice);
    for (const row of (data ?? []) as any[]) {
      const accId = String(row?.accommodation_id ?? "");
      if (!accId || !row?.start_date) continue;
      if (row?.bonus_policy === "none") continue;
      if (row?.counts_team_bonus === false) continue;
      const ps = String(row.start_date).slice(0, 10);
      const pe = row.end_date ? addOneDay(String(row.end_date).slice(0, 10)) : monthEndDate;
      const start = ps > monthStartDate ? ps : monthStartDate;
      const end = pe < monthEndDate ? pe : monthEndDate;
      if (start >= end) continue;
      const list = out[accId] ?? [];
      list.push({ start, end });
      out[accId] = list;
    }
  }
  return out;
}

/** 各館別的團隊獎金實付基準（含／排除業主自帶），未設定預設排除 */
async function getPayoutBasisByAcc(
  client: any,
  accommodationIds: string[],
): Promise<Record<string, "include_owner_direct" | "exclude_owner_direct">> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const out: Record<string, "include_owner_direct" | "exclude_owner_direct"> = {};
  if (accIds.length === 0) return out;
  const latestStart = new Map<string, string>();
  for (let i = 0; i < accIds.length; i += CHUNK) {
    const { data } = await client
      .from("accommodation_partnership_periods")
      .select("accommodation_id, start_date, payout_basis")
      .in("accommodation_id", accIds.slice(i, i + CHUNK));
    for (const row of (data ?? []) as any[]) {
      const accId = String(row?.accommodation_id ?? "");
      if (!accId) continue;
      const start = String(row?.start_date ?? "").slice(0, 10);
      if ((latestStart.get(accId) ?? "") > start) continue;
      latestStart.set(accId, start);
      out[accId] =
        row?.payout_basis === "include_owner_direct"
          ? "include_owner_direct"
          : "exclude_owner_direct";
    }
  }
  return out;
}


/** 只加總「被館別設定為不列入抽成」的增值服務金額 */
function excludedAddonTotal(
  details: unknown,
  excludedIds: string[],
  excludedTypes: string[],
): number {
  if (!Array.isArray(details)) return 0;
  if (excludedIds.length === 0 && excludedTypes.length === 0) return 0;
  let sum = 0;
  for (const item of details) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const addonId = rec.addon_id ? String(rec.addon_id) : "";
    const matched = addonId
      ? excludedIds.includes(addonId)
      : excludedTypes.includes(String(rec.addon_type ?? ""));
    if (matched) sum += Number(rec.total ?? 0) || 0;
  }
  return sum;
}

function toArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

/** 各館別當月生效的業主月結規則（exempt 來源 + 不列入抽成的增值服務） */
async function getOwnerRules(
  client: any,
  accIds: string[],
  monthStartDate: string,
): Promise<Record<string, { exempt: string[]; addonIds: string[]; addonTypes: string[] }>> {
  const out: Record<string, { exempt: string[]; addonIds: string[]; addonTypes: string[] }> = {};
  if (accIds.length === 0) return out;
  const byAcc = new Map<string, any[]>();
  for (let i = 0; i < accIds.length; i += CHUNK) {
    const { data } = await client
      .from("owner_settlement_pricing_rules")
      .select(
        "accommodation_id, effective_from, created_at, exempt_order_sources, commission_excluded_addon_ids, commission_excluded_addon_types",
      )
      .in("accommodation_id", accIds.slice(i, i + CHUNK))
      .lte("effective_from", monthStartDate);
    for (const row of (data ?? []) as any[]) {
      const key = row?.accommodation_id;
      if (!key) continue;
      const list = byAcc.get(key) ?? [];
      list.push(row);
      byAcc.set(key, list);
    }
  }
  for (const [accId, list] of byAcc) {
    const latest = pickCurrent(list, monthStartDate);
    out[accId] = {
      exempt: toArr(latest?.exempt_order_sources),
      addonIds: toArr(latest?.commission_excluded_addon_ids),
      addonTypes: toArr(latest?.commission_excluded_addon_types),
    };
  }
  return out;
}

/** 雙軌營收：含業主自帶 / 排除業主自帶 */
interface DualRevenue {
  incl: number;
  excl: number;
}

/** 加總後的營收：兩軌 + 依各館 payout_basis 決定的實付基準 */
interface RevenueTotals {
  incl: number;
  excl: number;
  payout: number;
  /** 本次加總實際採用的實付基準；各館不一致時為 "mixed" */
  basis: string | null;
}


/** 入住營收口徑（逐夜攤提、扣除設定的增值服務、換算台幣），回傳雙軌 */
async function getStayRevenueDualByAcc(
  client: any,
  accIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  sources: string[],
  rangesByAcc: Record<string, CountableRange[]>,
): Promise<Record<string, DualRevenue>> {
  const out: Record<string, DualRevenue> = {};
  const ids = accIds.filter((id) => (rangesByAcc[id] ?? []).length > 0);
  if (ids.length === 0) return out;
  const rules = await getOwnerRules(client, ids, monthStartDate);

  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await client
      .from("orders")
      .select(
        "id, accommodation_id, check_in_date, check_out_date, final_price, order_source, owner_direct, currency_at_booking, exchange_rate_snapshot, custom_addon_details",
      )
      .in("accommodation_id", ids.slice(i, i + CHUNK))
      .gt("check_out_date", monthStartDate)
      .lt("check_in_date", monthEndDate)
      .neq("order_status", "cancelled")
      .neq("order_status", "hold")
      .in("order_source", sources);

    for (const o of (data ?? []) as any[]) {
      const accId = String(o?.accommodation_id ?? "");
      if (!accId) continue;
      // 一、團隊獎金：完全以共用／獨立訂單來源白名單篩選，不套用 exempt_order_sources。
      // 業主自帶（owner_direct）不直接排除，而是分別累計到 incl / excl 兩軌。

      const rule = rules[accId];

      const ci = String(o?.check_in_date ?? "").slice(0, 10);
      const co = String(o?.check_out_date ?? "").slice(0, 10);
      if (!ci || !co) continue;
      const total = nightsBetween(ci, co);
      const ranges = rangesByAcc[accId] ?? [];
      let counted = 0;
      for (let n = 0; n < total; n++) {
        const day = new Date(Date.parse(`${ci}T00:00:00Z`) + n * 86_400_000)
          .toISOString()
          .slice(0, 10);

        if (day < monthStartDate || day >= monthEndDate) continue;
        if (ranges.some((r) => day >= r.start && day < r.end)) counted++;
      }
      if (counted === 0) continue;

      const ratio = counted / total;
      const rate =
        o?.currency_at_booking && String(o.currency_at_booking) !== "TWD"
          ? Number(o?.exchange_rate_snapshot ?? 0) || 0
          : 0;
      const conv = (v: number) => (rate > 0 ? v / rate : v);
      const amount = Math.max(
        0,
        conv((Number(o?.final_price) || 0) * ratio) -
          conv(
            excludedAddonTotal(
              o?.custom_addon_details,
              rule?.addonIds ?? [],
              rule?.addonTypes ?? [],
            ) * ratio,
          ),
      );
      if (!amount) continue;
      const cur = out[accId] ?? { incl: 0, excl: 0 };
      cur.incl += amount;
      if (o?.owner_direct !== true) cur.excl += amount;
      out[accId] = cur;
    }
  }
  return out;
}

/**
 * 分潤基準營收加總（雙軌），monthEndDate 為排他。
 * 採計範圍：各館合作期間 ∩ 資料月。
 * 口徑：資料月 >= STAY_REVENUE_SWITCH_MONTH 用入住營收，之前維持 order_date 舊口徑。
 */
async function getAccommodationRevenue(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string,
  allowedSources: string[],
): Promise<RevenueTotals> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const sources = Array.from(new Set((allowedSources ?? []).filter(Boolean)));
  const empty: RevenueTotals = { incl: 0, excl: 0, payout: 0 };
  if (accIds.length === 0 || sources.length === 0) return empty;

  const rangesByAcc = await getCountableRangesByAcc(
    client,
    accIds,
    monthStartDate,
    monthEndDate,
  );

  let byAcc: Record<string, DualRevenue> = {};

  if (monthStartDate >= STAY_REVENUE_SWITCH_MONTH) {
    byAcc = await getStayRevenueDualByAcc(
      client,
      accIds,
      monthStartDate,
      monthEndDate,
      sources,
      rangesByAcc,
    );
  } else {
    for (const accId of accIds) {
      for (const range of rangesByAcc[accId] ?? []) {
        const { data } = await client
          .from("orders")
          .select("id, owner_direct, order_meta(team_commission_price, is_excluded)")
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
          const cur = byAcc[accId] ?? { incl: 0, excl: 0 };
          cur.incl += amt;
          if (row?.owner_direct !== true) cur.excl += amt;
          byAcc[accId] = cur;
        }
      }
    }
  }

  const basis = await getPayoutBasisByAcc(client, Object.keys(byAcc));
  const totals: RevenueTotals = { incl: 0, excl: 0, payout: 0, basis: null };
  const usedBasis = new Set<string>();
  for (const [accId, v] of Object.entries(byAcc)) {
    totals.incl += v.incl;
    totals.excl += v.excl;
    const b = basis[accId] === "include_owner_direct" ? "include_owner_direct" : "exclude_owner_direct";
    usedBasis.add(b);
    totals.payout += b === "include_owner_direct" ? v.incl : v.excl;
  }
  totals.basis = usedBasis.size === 0 ? null : usedBasis.size === 1 ? [...usedBasis][0] : "mixed";
  return totals;

}




/** 各館別在該月是否約定收取行銷推廣費（append-only，逐館取最新一筆） */
async function getMarketingFeeFlags(
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
    const latest = pickCurrent(list, monthStartDate);
    out[accId] = latest?.charges_marketing_fee === true;
  }
  return out;
}

/** 該月「場域簽約人 → 館別」對照（append-only，逐館取最新一筆） */
async function getVenueClosingMap(
  client: any,
  monthStartDate: string,
): Promise<Map<string, string[]>> {
  // 規則：只要簽約人在「資料月內任一天」生效，該資料月即計入（隔月發放）。
  // 例：7/27 生效 → 7 月資料月計入 → 8/10 發放；8/1 生效 → 8 月資料月 → 9/10 發放。
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

  const closingRanges = await getCountableRangesByAcc(
    client,
    Array.from(byAcc.keys()),
    monthStartDate,
    addOneDay(monthLastDate),
  );

  const out = new Map<string, string[]>();
  for (const [accId, list] of byAcc) {
    // 資料月內沒有有效合作期間（未合作／暫停中／不採計）者不計場域成交獎金
    if ((closingRanges[accId] ?? []).length === 0) continue;

    const latest = pickCurrent(list, monthLastDate);
    const memberId = latest?.member_id as string | undefined;
    if (!memberId) continue;
    const arr = out.get(memberId) ?? [];
    arr.push(accId);
    out.set(memberId, arr);
  }
  return out;

}

/* ================================== 主流程 ================================== */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) {
      return jsonResponse({ success: false, error: authRes.error }, authRes.status);
    }
    if (!isSuperAdmin(authRes.ctx)) {
      return jsonResponse({ success: false, error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const testMode = body?.test_mode === true;
    const testMonth = typeof body?.test_month === "string" ? body.test_month : null;

    const tp = getTaipeiParts();

    // 每月 10 日才實際執行（cron 每日呼叫，其餘日期 skip）
    if (!testMode && tp.day !== 10) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "今日非發放日（每月10日），不執行",
        today_taipei: `${tp.y}-${pad2(tp.m)}-${pad2(tp.day)}`,
      });
    }

    const payoutYear = tp.y;
    const payoutMonth = tp.m;

    let snapYear: number;
    let snapMonth: number;
    if (testMonth && /^\d{4}-\d{2}$/.test(testMonth)) {
      const [y, m] = testMonth.split("-").map(Number);
      snapYear = y;
      snapMonth = m;
    } else {
      snapYear = payoutMonth === 1 ? payoutYear - 1 : payoutYear;
      snapMonth = payoutMonth === 1 ? 12 : payoutMonth - 1;
    }

    const snapshotMonthStr = `${snapYear}-${pad2(snapMonth)}`;
    const payoutMonthStr = `${payoutYear}-${pad2(payoutMonth)}`;

    // 結算月區間（Asia/Taipei 日期字串，end 為排他）與版本基準日
    const nextY = snapMonth === 12 ? snapYear + 1 : snapYear;
    const nextM = snapMonth === 12 ? 1 : snapMonth + 1;
    const monthStartDate = `${snapshotMonthStr}-01`;
    const monthEndDate = `${nextY}-${pad2(nextM)}-01`;
    const asOf = monthStartDate;

    const supabase = authRes.ctx.admin;

    /* ---------- 設定（全部以 asOf 鎖定版本） ---------- */
    const [rateSettings, sharedSources, kolSources, amManagerId, closerManagerId, kolRecipientId] =
      await Promise.all([
        getBonusRateSettings(supabase, asOf),
        getRevenueSourceWhitelist(supabase, "teamcommission_shared_revenue_source_whitelist", asOf),
        getRevenueSourceWhitelist(supabase, "teamcommission_kol_revenue_source_whitelist", asOf),
        getRoleBinding(supabase, "am_manager", asOf),
        getRoleBinding(supabase, "closer_manager", asOf),
        getRoleBinding(supabase, "kol_bonus_recipient", asOf),
      ]);

    /* ---------- 成員與角色 ---------- */
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .is("accommodation_id", null)
      .in("role", ["am", "am_manager", "closer", "closer_manager"]);
    if (roleErr) throw roleErr;

    const rolesByUser = new Map<string, Set<string>>();
    for (const r of (roleRows ?? []) as any[]) {
      const set = rolesByUser.get(r.user_id) ?? new Set<string>();
      set.add(String(r.role));
      rolesByUser.set(r.user_id, set);
    }

    const { data: profileRows, error: profErr } = await supabase
      .from("team_member_profiles")
      .select("id, user_id, display_name, am_managed_accommodation_ids, resigned_at");
    if (profErr) throw profErr;

    const profileByUserId = new Map<string, any>();
    const profileById = new Map<string, any>();
    for (const p of (profileRows ?? []) as any[]) {
      profileById.set(p.id, p);
      if (p.user_id) profileByUserId.set(p.user_id, p);
    }

    /* ---------- 全公司啟用館別與名稱 ---------- */
    const { data: accs, error: accErr } = await supabase
      .from("accommodation_info")
      .select("id, name, is_active");
    if (accErr) throw accErr;
    const accNameById = new Map<string, string>();
    const activeAccIds: string[] = [];
    for (const a of (accs ?? []) as any[]) {
      accNameById.set(a.id, String(a.name ?? ""));
      if (a.is_active) activeAccIds.push(a.id);
    }

    // 旅行日系列不列入抽成類獎金（AM績效、AM總管、成交組績效、成交大師管理、網紅營銷專利）
    const revenueAccIds = activeAccIds.filter(
      (id) => !(accNameById.get(id) ?? "").startsWith("旅行日"),
    );

    const companyRevenue = await getAccommodationRevenue(
      supabase,
      revenueAccIds,
      monthStartDate,
      monthEndDate,
      sharedSources,
    );
    const kolRevenue = await getAccommodationRevenue(
      supabase,
      revenueAccIds,
      monthStartDate,
      monthEndDate,
      kolSources,
    );

    /* ---------- 組出待寫入的 snapshot ---------- */
    interface Row {
      bonus_type: BonusType;
      member_id: string;
      snapshot_month: string;
      payout_month: string;
      base_revenue: number | null;
      base_revenue_incl_owner: number | null;
      base_revenue_excl_owner: number | null;
      rate: number | null;
      fixed_amount: number | null;
      venue_count: number | null;
      amount: number;
      amount_incl_owner: number | null;
      amount_excl_owner: number | null;
      settings_snapshot: Record<string, unknown>;
    }

    const rows: Row[] = [];
    const push = (r: Row) => {
      if (!r.member_id) return;
      if (!(r.amount > 0)) return; // 金額 0 或負數不寫入
      rows.push(r);
    };

    const rateOf = (bt: string) => rateSettings[bt]?.rate ?? null;
    const fixedOf = (bt: string) => rateSettings[bt]?.fixed_amount ?? null;

    // (1)(2) AM 績效獎金 / AM 場域獎金：具 am 或 am_manager 角色者
    const amPerfRate = rateOf("am_performance");
    const amVenueFixed = fixedOf("am_venue_bonus");
    for (const [userId, roleSet] of rolesByUser) {
      if (!roleSet.has("am") && !roleSet.has("am_manager")) continue;
      const profile = profileByUserId.get(userId);
      if (!profile) continue;

      const managed: string[] = Array.isArray(profile.am_managed_accommodation_ids)
        ? profile.am_managed_accommodation_ids.filter(Boolean)
        : [];
      // 旅行日系列不計入 AM 績效／場域獎金
      const managedNoTravel = managed.filter(
        (id) => !(accNameById.get(id) ?? "").startsWith("旅行日"),
      );
      if (managedNoTravel.length === 0) continue;

      const myRevenue = await getAccommodationRevenue(
        supabase,
        managedNoTravel,
        monthStartDate,
        monthEndDate,
        sharedSources,
      );

      push({
        bonus_type: "am_performance",
        member_id: profile.id,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: myRevenue.payout,
        base_revenue_incl_owner: myRevenue.incl,
        base_revenue_excl_owner: myRevenue.excl,
        rate: amPerfRate,
        fixed_amount: null,
        venue_count: managedNoTravel.length,
        amount: myRevenue.payout * Number(amPerfRate ?? 0),
        amount_incl_owner: myRevenue.incl * Number(amPerfRate ?? 0),
        amount_excl_owner: myRevenue.excl * Number(amPerfRate ?? 0),
        settings_snapshot: {
          as_of: asOf,
          rate: amPerfRate,
          shared_sources: sharedSources,
          accommodation_ids: managedNoTravel,
          excluded_travel_days: managed.filter((id) => !managedNoTravel.includes(id)),
        },
      });

      push({
        bonus_type: "am_venue_bonus",
        member_id: profile.id,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: null,
        base_revenue_incl_owner: null,
        base_revenue_excl_owner: null,
        rate: null,
        fixed_amount: amVenueFixed,
        venue_count: managedNoTravel.length,
        amount: Number(amVenueFixed ?? 0) * managedNoTravel.length,
        amount_incl_owner: null,
        amount_excl_owner: null,
        settings_snapshot: {
          as_of: asOf,
          fixed_amount: amVenueFixed,
          accommodation_ids: managedNoTravel,
          excluded_travel_days: managed.filter((id) => !managedNoTravel.includes(id)),
        },
      });

    }

    // (3) 成交組績效獎金：全公司營收 × rate，由「資料月底仍在職」的成交組成員均分
    const closerPerfRate = rateOf("closer_performance");
    const monthLastDateStr = `${snapshotMonthStr.slice(0, 7)}-31`;
    const isActiveAtMonthEnd = (profile: any) =>
      !profile?.resigned_at || String(profile.resigned_at).slice(0, 10) > monthLastDateStr;

    const closerProfiles: any[] = [];
    for (const [userId, roleSet] of rolesByUser) {
      if (!roleSet.has("closer") && !roleSet.has("closer_manager")) continue;
      const profile = profileByUserId.get(userId);
      if (!profile) continue;
      if (!isActiveAtMonthEnd(profile)) continue; // 離職者不參與均分
      closerProfiles.push(profile);
    }

    const closerPoolAmount = companyRevenue.payout * Number(closerPerfRate ?? 0);
    const closerPoolIncl = companyRevenue.incl * Number(closerPerfRate ?? 0);
    const closerPoolExcl = companyRevenue.excl * Number(closerPerfRate ?? 0);
    const closerHeadcount = closerProfiles.length;
    for (const profile of closerProfiles) {
      push({
        bonus_type: "closer_performance",
        member_id: profile.id,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: companyRevenue.payout,
        base_revenue_incl_owner: companyRevenue.incl,
        base_revenue_excl_owner: companyRevenue.excl,
        rate: closerPerfRate,
        fixed_amount: null,
        venue_count: null,
        amount: closerHeadcount > 0 ? closerPoolAmount / closerHeadcount : 0,
        amount_incl_owner: closerHeadcount > 0 ? closerPoolIncl / closerHeadcount : 0,
        amount_excl_owner: closerHeadcount > 0 ? closerPoolExcl / closerHeadcount : 0,
        settings_snapshot: {
          as_of: asOf,
          rate: closerPerfRate,
          shared_sources: sharedSources,
          accommodation_ids: activeAccIds,
          pool_amount: closerPoolAmount,
          split_headcount: closerHeadcount,
        },
      });
    }


    // (4)(5) AM 總管 / 成交組主管：角色綁定當月生效者，全公司營收 × rate
    const managerBindings: Array<[BonusType, string | null]> = [
      ["am_manager", amManagerId],
      ["closer_manager", closerManagerId],
    ];
    for (const [bt, memberId] of managerBindings) {
      if (!memberId || !profileById.has(memberId)) continue;
      // 資料月底已離職者不發管理職獎金
      if (!isActiveAtMonthEnd(profileById.get(memberId))) continue;

      const rate = rateOf(bt);
      push({
        bonus_type: bt,
        member_id: memberId,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: companyRevenue.payout,
        base_revenue_incl_owner: companyRevenue.incl,
        base_revenue_excl_owner: companyRevenue.excl,
        rate,
        fixed_amount: null,
        venue_count: null,
        amount: companyRevenue.payout * Number(rate ?? 0),
        amount_incl_owner: companyRevenue.incl * Number(rate ?? 0),
        amount_excl_owner: companyRevenue.excl * Number(rate ?? 0),
        settings_snapshot: {
          as_of: asOf,
          rate,
          shared_sources: sharedSources,
          accommodation_ids: activeAccIds,
          role_binding: bt,
        },
      });
    }

    // (6)(7) 網紅營銷抽成 / 月費：kol_bonus_recipient 綁定者
    if (kolRecipientId && profileById.has(kolRecipientId)) {
      const kolRate = rateOf("kol_commission");
      push({
        bonus_type: "kol_commission",
        member_id: kolRecipientId,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: kolRevenue.payout,
        base_revenue_incl_owner: kolRevenue.incl,
        base_revenue_excl_owner: kolRevenue.excl,
        rate: kolRate,
        fixed_amount: null,
        venue_count: null,
        amount: kolRevenue.payout * Number(kolRate ?? 0),
        amount_incl_owner: kolRevenue.incl * Number(kolRate ?? 0),
        amount_excl_owner: kolRevenue.excl * Number(kolRate ?? 0),
        settings_snapshot: {
          as_of: asOf,
          rate: kolRate,
          kol_sources: kolSources,
          accommodation_ids: activeAccIds,
          role_binding: "kol_bonus_recipient",
        },
      });


      // 月費：以「該資料月有合作期間（bonus_policy != none）的館別」計價
      // （旅行日系列合併只算一館，停用館別／無合作期間不計）
      const kolMonthlyFixed = fixedOf("kol_monthly");
      const kolMonthlyRanges = await getCountableRangesByAcc(
        supabase,
        activeAccIds,
        monthStartDate,
        monthEndDate,
      );
      const partneredAccIds = activeAccIds.filter(
        (id) => (kolMonthlyRanges[id]?.length ?? 0) > 0,
      );
      const travelDayIds = partneredAccIds.filter((id) =>
        (accNameById.get(id) ?? "").startsWith("旅行日"),
      );
      const kolMonthlyAccIds = [
        ...partneredAccIds.filter((id) => !(accNameById.get(id) ?? "").startsWith("旅行日")),
        ...(travelDayIds.length > 0 ? [travelDayIds[0]] : []),
      ];
      push({
        bonus_type: "kol_monthly",
        member_id: kolRecipientId,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: null,
        base_revenue_incl_owner: null,
        base_revenue_excl_owner: null,
        rate: null,
        fixed_amount: kolMonthlyFixed,
        venue_count: kolMonthlyAccIds.length,
        amount: Number(kolMonthlyFixed ?? 0) * kolMonthlyAccIds.length,
        amount_incl_owner: null,
        amount_excl_owner: null,

        settings_snapshot: {
          as_of: asOf,
          fixed_amount: kolMonthlyFixed,
          role_binding: "kol_bonus_recipient",
          accommodation_ids: kolMonthlyAccIds,
          accommodation_names: kolMonthlyAccIds.map((id) =>
            (accNameById.get(id) ?? "").startsWith("旅行日") ? "旅行日系列" : (accNameById.get(id) ?? id),
          ),
          travel_days_merged_ids: travelDayIds,
        },
      });
    }

    // (8) 場域成交獎金：該月生效簽約人，逐館 charges_marketing_fee = true 者各一份固定金額
    const venueClosingFixed = fixedOf("venue_closing");
    const closingMap = await getVenueClosingMap(supabase, monthStartDate);
    for (const [memberId, accIds] of closingMap) {
      if (!profileById.has(memberId)) continue;
      const flags = await getMarketingFeeFlags(supabase, accIds, monthStartDate);
      const hitIds = accIds.filter((id) => flags[id] === true);
      if (hitIds.length === 0) continue;
      push({
        bonus_type: "venue_closing",
        member_id: memberId,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        base_revenue: null,
        base_revenue_incl_owner: null,
        base_revenue_excl_owner: null,
        rate: null,
        fixed_amount: venueClosingFixed,
        venue_count: hitIds.length,
        amount: Number(venueClosingFixed ?? 0) * hitIds.length,
        amount_incl_owner: null,
        amount_excl_owner: null,

        settings_snapshot: {
          as_of: asOf,
          fixed_amount: venueClosingFixed,
          accommodation_ids: hitIds,
          accommodation_names: hitIds.map((id) => accNameById.get(id) ?? id),
          assigned_accommodation_ids: accIds,
        },
      });
    }

    /* ---------- 逐筆寫入（衝突時：未發放則覆寫更新，已發放則 skip） ---------- */
    const errors: Array<{ bonus_type: string; member_id: string; error: string }> = [];
    let created = 0;
    let skipped = 0;
    let updated = 0;

    // 已標記發放的快照 id（有標記者不覆寫）
    const { data: markRows } = await supabase
      .from("commission_payout_marks")
      .select("source_id, payout_status")
      .eq("source_table", "teamcommission_bonus_snapshots");
    const paidSnapshotIds = new Set(
      ((markRows ?? []) as any[])
        .filter((m) => m.payout_status === "paid")
        .map((m) => String(m.source_id)),
    );

    for (const row of rows) {
      const { error: insErr } = await supabase.from("teamcommission_bonus_snapshots").insert(row);
      if (insErr) {
        if ((insErr as any).code === "23505") {
          const { data: existing } = await supabase
            .from("teamcommission_bonus_snapshots")
            .select("id")
            .eq("bonus_type", row.bonus_type)
            .eq("member_id", row.member_id)
            .eq("snapshot_month", row.snapshot_month)
            .maybeSingle();
          if (existing?.id && !paidSnapshotIds.has(String(existing.id))) {
            const { error: updErr } = await supabase
              .from("teamcommission_bonus_snapshots")
              .update({
                payout_month: row.payout_month,
                base_revenue: row.base_revenue,
                base_revenue_incl_owner: row.base_revenue_incl_owner,
                base_revenue_excl_owner: row.base_revenue_excl_owner,
                rate: row.rate,
                fixed_amount: row.fixed_amount,
                venue_count: row.venue_count,
                amount: row.amount,
                amount_incl_owner: row.amount_incl_owner,
                amount_excl_owner: row.amount_excl_owner,
                settings_snapshot: row.settings_snapshot,

              })
              .eq("id", existing.id);
            if (updErr) {
              errors.push({
                bonus_type: row.bonus_type,
                member_id: row.member_id,
                error: updErr.message,
              });
            } else {
              updated++;
            }
          } else {
            skipped++;
          }
        } else {
          errors.push({
            bonus_type: row.bonus_type,
            member_id: row.member_id,
            error: insErr.message,
          });
        }
      } else {
        created++;
      }
    }


    console.log("[create-team-bonus-snapshots] done", {
      snapshotMonthStr,
      payoutMonthStr,
      candidates: rows.length,
      created,
      updated,
      skipped,
      errorCount: errors.length,
    });

    return jsonResponse({
      success: true,
      test_mode: testMode,
      snapshot_month: snapshotMonthStr,
      payout_month: payoutMonthStr,
      candidates: rows.length,
      created,
      updated,
      skipped,
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[create-team-bonus-snapshots] failed", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
