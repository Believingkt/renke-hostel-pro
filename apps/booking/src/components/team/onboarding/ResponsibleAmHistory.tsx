import { useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { END_REASON_LABEL } from "@/lib/teamOnboarding";

interface HistoryRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  team_member_profiles: { display_name: string } | null;
}

const d = (v: string | null) => (v ? new Date(v).toLocaleDateString("zh-TW") : "");

export function ResponsibleAmHistory({ accommodationId, refreshKey }: { accommodationId: string; refreshKey: number }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("accommodation_responsible_am" as any)
      .select("id, started_at, ended_at, end_reason, team_member_profiles(display_name)")
      .eq("accommodation_id", accommodationId)
      .order("started_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!cancelled) setRows((data ?? []) as unknown as HistoryRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [accommodationId, refreshKey]);

  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="onboarding-responsible-history">
      <p className="text-sm font-medium">負責 AM 紀錄</p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {rows.map((r) => (
          <li key={r.id}>
            {r.team_member_profiles?.display_name ?? "—"}：{d(r.started_at)} ～ {r.ended_at ? `${d(r.ended_at)}（${END_REASON_LABEL[r.end_reason ?? ""] ?? r.end_reason}）` : "目前"}
          </li>
        ))}
      </ul>
    </div>
  );
}
