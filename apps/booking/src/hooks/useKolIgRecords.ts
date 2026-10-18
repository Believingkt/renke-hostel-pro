import { useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { isContentPostUrl, normalizeIgHandle } from "@/lib/kolInviteValidation";

export type KolIgRecord = {
  id: string;
  name: string | null;
  venue_name: string | null;
  invited_at: string | null;
  cid_code: string | null;
  booking_status: string | null;
  primary_profile_id: string | null;
  scout_name: string | null;
};

export type KolIgName = { name: string; count: number };

// ilike 的 % 與 _ 是萬用字元，IG 帳號常含底線，必須跳脫才是「不分大小寫的完全相同」
export const escapeIlike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

// 同一 IG 的比對條件：帳號完全相同（不分大小寫），或舊資料存成 instagram.com/帳號/… 整串網址
export const igMatchOrFilter = (handle: string) => {
  const esc = escapeIlike(handle);
  return `ig_handle.ilike.${esc},ig_handle.ilike.*instagram.com/${esc}/*`;
};

// 依筆數（多→少）整理出此 IG 已使用過的名稱
export function groupKolNames(records: Pick<KolIgRecord, "name">[]): KolIgName[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const n = (r.name ?? "").trim();
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 同一個 IG 帳號（不分大小寫）的既有邀約紀錄，排除正在編輯的那筆 */
export function useKolIgRecords(igRaw: string, excludeId: string | null, enabled = true) {
  const [records, setRecords] = useState<KolIgRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const ig = normalizeIgHandle(igRaw ?? "");

  useEffect(() => {
    if (!enabled || !ig || isContentPostUrl(igRaw)) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("kol_profiles")
        .select("id, name, venue_name, invited_at, cid_code, booking_status, primary_profile_id, team_member_profiles:scout_id(display_name)")
        .or(igMatchOrFilter(ig))
        .eq("is_error", false)
        .neq("id", excludeId ?? "00000000-0000-0000-0000-000000000000")
        .order("invited_at", { ascending: true, nullsFirst: false })
        .limit(50);
      if (cancelled) return;
      setRecords(
        ((data as any[]) ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          venue_name: d.venue_name,
          invited_at: d.invited_at,
          cid_code: d.cid_code,
          booking_status: d.booking_status,
          primary_profile_id: d.primary_profile_id,
          scout_name: d.team_member_profiles?.display_name ?? null,
        })),
      );
      setLoading(false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ig, igRaw, excludeId, enabled]);

  return { records, loading };
}
