/**
 * 團隊獎金「入住營收」口徑（與 admin 業主月結『本月入住營收』對齊）。
 *
 * 與舊口徑（order_meta.team_commission_price + order_date）的差異：
 *  - 歸屬時點：入住日逐夜攤提，跨月依夜數拆分
 *  - 取消訂單：自然不計入（不需事後扣回）
 *  - 增值服務：只扣除館別設定的 commission_excluded_addon_types / _ids
 *  - 業主自帶／exempt 來源：排除
 *  - 幣別：依訂單匯率快照換算台幣
 *
 * 只服務「一、團隊獎金」；星探類與加盟／Starlink 不使用此檔。
 */

import { extractExcludedAddonTotal } from "./ownerSettlement";
import type { CountableRange } from "./teamBonusRevenue";

const CHUNK = 500;

/** 團隊獎金口徑切換生效資料月（含當月起改用入住營收） */
export const STAY_REVENUE_SWITCH_MONTH = "2026-07-01";

/** 該資料月是否已切換到入住營收口徑 */
export function usesStayRevenue(monthStartDate: string): boolean {
  return String(monthStartDate ?? "") >= STAY_REVENUE_SWITCH_MONTH;
}

function parseDay(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

interface PricingRuleLite {
  exempt_order_sources: string[];
  commission_excluded_addon_ids: string[] | null;
  commission_excluded_addon_types: string[] | null;
}

function toArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

async function getPricingRules(
  client: any,
  accIds: string[],
  monthStartDate: string,
): Promise<Record<string, PricingRuleLite>> {
  const out: Record<string, PricingRuleLite> = {};
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
    const latest = list.reduce((best, r) => {
      const ef = String(r.effective_from ?? "").localeCompare(String(best.effective_from ?? ""));
      if (ef > 0) return r;
      if (ef === 0 && String(r.created_at ?? "") > String(best.created_at ?? "")) return r;
      return best;
    });
    out[accId] = {
      exempt_order_sources: toArr(latest?.exempt_order_sources),
      commission_excluded_addon_ids: toArr(latest?.commission_excluded_addon_ids),
      commission_excluded_addon_types: toArr(latest?.commission_excluded_addon_types),
    };
  }
  return out;
}

function toTwd(amount: number, rate: number | null): number {
  if (!rate || rate <= 0) return amount;
  return amount / rate;
}

/**
 * 各館別在指定資料月的「入住營收」基準金額（已扣除設定的增值服務、排除 exempt、換算台幣）。
 * rangesByAcc：各館可採計的日期區間（含合作期間／白名單／行銷費裁切）。
 */
export async function getStayRevenueByAcc(
  client: any,
  accommodationIds: string[],
  monthStartDate: string,
  monthEndDate: string, // 排他
  allowedSources: string[],
  rangesByAcc: Record<string, CountableRange[]>,
): Promise<Record<string, number>> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean))).filter(
    (id) => (rangesByAcc[id] ?? []).length > 0,
  );
  const sources = Array.from(new Set((allowedSources ?? []).filter(Boolean)));
  const out: Record<string, number> = {};
  if (accIds.length === 0 || sources.length === 0) return out;

  const rules = await getPricingRules(client, accIds, monthStartDate);

  for (let i = 0; i < accIds.length; i += CHUNK) {
    const slice = accIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("orders")
      .select(
        "id, accommodation_id, check_in_date, check_out_date, final_price, order_source, owner_direct, currency_at_booking, exchange_rate_snapshot, custom_addon_details",
      )
      .in("accommodation_id", slice)
      .gt("check_out_date", monthStartDate)
      .lt("check_in_date", monthEndDate)
      .neq("order_status", "cancelled")
      .neq("guest_name", "保留單")
      .in("order_source", sources);

    for (const o of (data ?? []) as any[]) {
      const accId = String(o?.accommodation_id ?? "");
      if (!accId) continue;
      const rule = rules[accId];
      if (o?.owner_direct === true) continue;
      if (rule && o?.order_source && rule.exempt_order_sources.includes(String(o.order_source)))
        continue;

      const ci = String(o?.check_in_date ?? "").slice(0, 10);
      const co = String(o?.check_out_date ?? "").slice(0, 10);
      if (!ci || !co) continue;
      const totalNights = Math.max(
        1,
        Math.round((parseDay(co).getTime() - parseDay(ci).getTime()) / 86_400_000),
      );

      const ranges = rangesByAcc[accId] ?? [];
      let counted = 0;
      for (let n = 0; n < totalNights; n++) {
        const day = addDays(ci, n);
        if (day < monthStartDate || day >= monthEndDate) continue;
        if (ranges.some((r) => day >= r.start && day < r.end)) counted++;
      }
      if (counted === 0) continue;

      const ratio = counted / totalNights;
      const rate =
        o?.currency_at_booking && String(o.currency_at_booking) !== "TWD"
          ? Number(o?.exchange_rate_snapshot ?? 0) || 0
          : 0;
      const gross = toTwd((Number(o?.final_price) || 0) * ratio, rate);
      const excludedAddon = toTwd(
        extractExcludedAddonTotal(
          o?.custom_addon_details,
          rule?.commission_excluded_addon_ids ?? null,
          rule?.commission_excluded_addon_types ?? null,
        ) * ratio,
        rate,
      );
      const amount = Math.max(0, gross - excludedAddon);
      if (!amount) continue;
      out[accId] = (out[accId] ?? 0) + amount;
    }
  }
  return out;
}
