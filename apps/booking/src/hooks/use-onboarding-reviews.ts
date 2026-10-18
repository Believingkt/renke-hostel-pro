import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

/** 總部：各館 final_check 送審狀態（submitted＝待核准、returned＝已退回） */
export function useOnboardingReviews(accommodationIds: string[]) {
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const key = accommodationIds.slice().sort().join(",");

  const load = useCallback(async () => {
    if (!key) return;
    const { data } = await supabase
      .from("accommodation_onboarding_steps")
      .select("accommodation_id, status")
      .eq("step_key", "final_check")
      .in("status", ["submitted", "returned"] as never)
      .in("accommodation_id", key.split(","));
    setStatusById(Object.fromEntries(((data ?? []) as { accommodation_id: string; status: string }[]).map((r) => [r.accommodation_id, r.status])));
  }, [key]);

  useEffect(() => { void load(); }, [load]);
  return { statusById, reload: load };
}
