import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { taipeiToday } from "@lakeze/shared/lib/teamBonusRevenue";

export type MergeGroups = Map<string, { id: string; name: string }[]>;
export type Rates = Record<string, { rate: number | null; fixed_amount: number | null }>;

const RATE_TYPES = ["am_performance", "closer_performance", "kol_commission", "am_venue_bonus", "kol_monthly", "venue_closing"];

export const fmtMoney = (n: number | null | undefined) => (n == null ? "（未設定）" : `${Math.round(n).toLocaleString("zh-TW")} 元`);
export const fmtRate = (r: number | null | undefined) => (r == null ? "（未設定）" : `${Number((r * 100).toFixed(2))}%`);

/** 讀本館旗標、全站合併群組（含成員館名）與本月採用的獎金費率 */
export function useVenueBonusFlags(accId: string) {
  const [state, setState] = useState({ exclude: false, group: "", groups: new Map() as MergeGroups, rates: {} as Rates, loaded: false });

  const load = useCallback(async () => {
    const sb = supabase as any;
    const asOf = `${taipeiToday().slice(0, 7)}-01`;
    const [flagsRes, rateRes] = await Promise.all([
      sb.from("teamcommission_venue_bonus_flags").select("accommodation_id, exclude_from_commission, fixed_merge_group"),
      sb.from("teamcommission_bonus_rate_settings").select("bonus_type, rate, fixed_amount, effective_from")
        .in("bonus_type", RATE_TYPES).lte("effective_from", asOf).order("effective_from", { ascending: false }),
    ]);
    const flags = (flagsRes.data ?? []) as any[];
    const grouped = flags.filter((f) => f.fixed_merge_group);
    const ids = grouped.map((f) => f.accommodation_id);
    const { data: accs } = ids.length ? await sb.from("accommodation_info").select("id, name").in("id", ids) : { data: [] };
    const nameOf = new Map<string, string>((accs ?? []).map((a: any) => [a.id, a.name]));
    const groups: MergeGroups = new Map();
    for (const f of grouped) {
      const list = groups.get(f.fixed_merge_group) ?? [];
      list.push({ id: f.accommodation_id, name: nameOf.get(f.accommodation_id) ?? "（未知館別）" });
      groups.set(f.fixed_merge_group, list);
    }
    const rates: Rates = {};
    for (const r of (rateRes.data ?? []) as any[]) {
      if (!rates[r.bonus_type]) rates[r.bonus_type] = { rate: r.rate == null ? null : Number(r.rate), fixed_amount: r.fixed_amount == null ? null : Number(r.fixed_amount) };
    }
    const mine = flags.find((f) => f.accommodation_id === accId);
    setState({ exclude: !!mine?.exclude_from_commission, group: mine?.fixed_merge_group ?? "", groups, rates, loaded: true });
  }, [accId]);

  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
}
