import { useMemo } from "react";
import { useSettingsCompleteness } from "@lakeze/shared/hooks/use-settings-completeness";
import type { CheckResult } from "@lakeze/shared/lib/settingsCompleteness/types";
import { RAGIC_COLUMNS } from "@lakeze/shared/lib/settingsCompleteness/ragicChecks";
import { BONUS_VENUE_COLUMNS } from "@lakeze/shared/lib/settingsCompleteness/bonusChecks";

/** onboarding 已另外顯示的檢查，不重複列入「其他設定缺口」 */
const SHOWN_SEPARATELY = new Set(["amScope", "kolQuota"]);

export interface VenueGap {
  key: string;
  label: string;
  result: CheckResult;
}

/** 依館別整理既有「設定完整性檢查」的缺口（合作條件、費率、獎金等） */
export function useVenueGaps() {
  const { ragicRows, bonusVenueRows, blockedChecks, loading, reload } = useSettingsCompleteness();

  const gapsByAcc = useMemo(() => {
    const blocked = new Set(blockedChecks);
    const labels = new Map([...RAGIC_COLUMNS, ...BONUS_VENUE_COLUMNS].map((c) => [c.key, c.label]));
    const out = new Map<string, VenueGap[]>();
    for (const row of [...ragicRows, ...bonusVenueRows]) {
      const list = out.get(row.accId) ?? [];
      for (const [key, result] of Object.entries(row.checks)) {
        if (SHOWN_SEPARATELY.has(key) || blocked.has(key) || result.level === "ok") continue;
        list.push({ key, label: labels.get(key) ?? key, result });
      }
      out.set(row.accId, list);
    }
    return out;
  }, [ragicRows, bonusVenueRows, blockedChecks]);

  return { gapsByAcc, loading, reload };
}
