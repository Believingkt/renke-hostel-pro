import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BonusMultiplierRow,
  payoutMonthKeyFromDataMonth,
  pickMultiplier,
} from "@/lib/bonusMultiplier";

/**
 * 讀取獎金加倍活動設定（全部期間），並提供以「資料月」或「發放月」查詢倍率的函式。
 * 所有團隊頁面共用同一支，確保加倍口徑一致。
 */
export function useBonusMultipliers() {
  const [rows, setRows] = useState<BonusMultiplierRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bonus_multiplier_settings")
        .select("bonus_type, multiplier, start_month, end_month, reason");
      if (cancelled) return;
      setRows((data as unknown as BonusMultiplierRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 依「發放月」(YYYY-MM) 取倍率 */
  const multiplierForPayoutMonth = useCallback(
    (bonusType: string, payoutMonthKey: string) => pickMultiplier(rows, bonusType, payoutMonthKey),
    [rows],
  );

  /** 依「資料月」(YYYY-MM) 取倍率（內部自動換算成發放月） */
  const multiplierForDataMonth = useCallback(
    (bonusType: string, dataMonthKey: string) =>
      pickMultiplier(rows, bonusType, payoutMonthKeyFromDataMonth(dataMonthKey)),
    [rows],
  );

  return { rows, loading, multiplierForPayoutMonth, multiplierForDataMonth };
}
