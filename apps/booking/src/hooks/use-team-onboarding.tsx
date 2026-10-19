import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import type { OnboardingAmMember, OnboardingRow } from "@/lib/teamOnboarding";

/** 館別設定總覽資料：每館狀態＋可擔任負責 AM 的成員 */
export function useTeamOnboarding() {
  const [rows, setRows] = useState<OnboardingRow[]>([]);
  const [members, setMembers] = useState<OnboardingAmMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ov, am] = await Promise.all([
      supabase.rpc("team_onboarding_overview" as any),
      supabase.rpc("team_onboarding_am_members" as any),
    ]);
    setError(ov.error?.message ?? am.error?.message ?? null);
    setRows(((ov.data ?? []) as OnboardingRow[]) ?? []);
    setMembers(((am.data ?? []) as OnboardingAmMember[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, members, loading, error, reload: load };
}
