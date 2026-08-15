import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TeamRole } from "@/components/team/teamConfig";
import { isRateAdmin, MANAGER_SCOPE } from "@/lib/bonusRateMeta";

export interface GlobalRate {
  rate: number | null;
  fixed_amount: number | null;
  effective_from: string;
}

export interface VenueRate {
  accommodation_id: string;
  name: string;
  closer_rate: number | null;
  video_rate: number | null;
  effective_from: string;
}

interface State {
  globalRates: Record<string, GlobalRate>;
  venueRates: VenueRate[];
  loading: boolean;
}

/**
 * 讀取「目前資料庫最新生效版本」的獎金設定值。
 *
 * 注意：最新版本不一定等於某個資料月（獎金發放月份）當時採用的版本，
 * 已凍結的快照仍以快照當時的費率為準；此處僅供釐清公式計算邏輯。
 *
 * 逐館費率的可見範圍：管理員與主管可看全部；一般 AM 只看所轄館別。
 */
export function useCurrentBonusRates(roles: TeamRole[], userId?: string): State {
  const [state, setState] = useState<State>({ globalRates: {}, venueRates: [], loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [globalRes, venueRes, accRes] = await Promise.all([
        supabase
          .from("teamcommission_bonus_rate_settings")
          .select("bonus_type, rate, fixed_amount, effective_from")
          .lte("effective_from", today)
          .order("effective_from", { ascending: false }),
        supabase
          .from("accommodation_commission_settings")
          .select("accommodation_id, closer_rate, video_rate, effective_from")
          .lte("effective_from", today)
          .order("effective_from", { ascending: false }),
        supabase.from("accommodation_info").select("id, name").order("name"),
      ]);

      // 一般 AM 只看所轄館別
      let allowedIds: Set<string> | null = null;
      const isManager = roles.some((r) => MANAGER_SCOPE[r]);
      if (!isRateAdmin(roles) && !isManager && userId) {
        const { data: profile } = await supabase
          .from("team_member_profiles")
          .select("am_managed_accommodation_ids")
          .eq("user_id", userId)
          .maybeSingle();
        const ids = (profile?.am_managed_accommodation_ids ?? []) as string[];
        if (ids.length > 0) allowedIds = new Set(ids);
      }

      const globalRates: Record<string, GlobalRate> = {};
      for (const row of globalRes.data ?? []) {
        if (globalRates[row.bonus_type]) continue; // 已依生效日降冪，第一筆即最新
        globalRates[row.bonus_type] = {
          rate: row.rate,
          fixed_amount: row.fixed_amount,
          effective_from: row.effective_from,
        };
      }

      const nameById = new Map<string, string>(
        (accRes.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]),
      );

      const seen = new Set<string>();
      const venueRates: VenueRate[] = [];
      for (const row of venueRes.data ?? []) {
        if (seen.has(row.accommodation_id)) continue;
        seen.add(row.accommodation_id);
        if (allowedIds && !allowedIds.has(row.accommodation_id)) continue;
        venueRates.push({
          accommodation_id: row.accommodation_id,
          name: nameById.get(row.accommodation_id) ?? "（未知館別）",
          closer_rate: row.closer_rate,
          video_rate: row.video_rate,
          effective_from: row.effective_from,
        });
      }
      venueRates.sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));

      if (!cancelled) setState({ globalRates, venueRates, loading: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [roles.join(","), userId]);

  return state;
}
