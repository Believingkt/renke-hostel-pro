/**
 * 共用：成交組分潤「月營收抽成門檻」判斷。
 *
 * 與業主月結 (src/lib/ownerSettlement.ts) 相同語意：
 * - commission_threshold = 0 → 全額抽成（factor = 1）
 * - 當月營收 <= 門檻 → 完全不抽成（factor = 0）
 * - 當月營收 > 門檻 → 僅超額部分抽成（factor = (revenue - threshold) / revenue）
 *
 * 月營收基礎：以「入住月份（check_in_date）」為準的當月毛營收（final_price，
 * 含 exempt 訂單，排除取消單與非台幣單），與業主月結 getStandardThresholdBase 一致。
 */

export interface MinimalSupabaseClient {
  from: (table: string) => any;
}

interface RuleRow {
  accommodation_id: string;
  effective_from: string | null;
  created_at: string | null;
  commission_threshold: number | null;
}

export function commissionThresholdFactor(revenueBase: number, threshold: number): number {
  if (!threshold || threshold <= 0) return 1;
  if (revenueBase <= 0) return 0;
  if (revenueBase <= threshold) return 0;
  return (revenueBase - threshold) / revenueBase;
}

function monthKey(value: string | null | undefined): string {
  if (!value) return "";
  const m = String(value).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}

/**
 * 建立門檻係數判斷器。
 * @returns (accommodationId, checkInDate) => factor（0 ~ 1）
 */
export async function buildThresholdFactorResolver(
  client: MinimalSupabaseClient,
  accommodationIds: string[],
): Promise<(accId: string, checkInDate: string | null | undefined) => number> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));
  const rulesByAcc = new Map<string, RuleRow[]>();
  const revenueByAccMonth = new Map<string, number>();

  if (accIds.length === 0) return () => 1;

  try {
    const { data } = await client
      .from("owner_settlement_pricing_rules")
      .select("accommodation_id, effective_from, created_at, commission_threshold")
      .in("accommodation_id", accIds);
    for (const row of (data ?? []) as RuleRow[]) {
      if (!row?.accommodation_id) continue;
      const list = rulesByAcc.get(row.accommodation_id) ?? [];
      list.push(row);
      rulesByAcc.set(row.accommodation_id, list);
    }
    for (const list of rulesByAcc.values()) {
      list.sort((a, b) => {
        const ef = String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? ""));
        if (ef !== 0) return ef;
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      });
    }
  } catch {
    return () => 1;
  }

  // 只有存在 >0 門檻的館別才需要撈營收
  const accNeedingRevenue = accIds.filter((id) =>
    (rulesByAcc.get(id) ?? []).some((r) => Number(r.commission_threshold ?? 0) > 0)
  );
  if (accNeedingRevenue.length === 0) return () => 1;

  try {
    const pageSize = 1000;
    for (let page = 0; ; page++) {
      const { data, error } = await client
        .from("orders")
        .select("accommodation_id, check_in_date, final_price, order_status, currency_at_booking")
        .in("accommodation_id", accNeedingRevenue)
        .neq("order_status", "cancelled")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      for (const o of rows) {
        const cur = o.currency_at_booking;
        if (cur && cur !== "TWD") continue;
        const key = `${o.accommodation_id}|${monthKey(o.check_in_date)}`;
        revenueByAccMonth.set(key, (revenueByAccMonth.get(key) ?? 0) + Number(o.final_price ?? 0));
      }
      if (rows.length < pageSize) break;
    }
  } catch {
    return () => 1;
  }

  function thresholdFor(accId: string, mKey: string): number {
    const list = rulesByAcc.get(accId);
    if (!list || list.length === 0 || !mKey) return 0;
    const monthStart = `${mKey}-01`;
    const hit = list.find((r) => String(r.effective_from ?? "") <= monthStart);
    return Number(hit?.commission_threshold ?? 0) || 0;
  }

  return (accId: string, checkInDate: string | null | undefined) => {
    const mKey = monthKey(checkInDate);
    const threshold = thresholdFor(accId, mKey);
    if (threshold <= 0) return 1;
    const revenue = revenueByAccMonth.get(`${accId}|${mKey}`) ?? 0;
    return commissionThresholdFactor(revenue, threshold);
  };
}
