import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCommissionExclusionResolver,
  type CommissionExclusionResolver,
} from "@/lib/commissionExclusionRule";

/** 尚未載入／查無規則時的安全 fallback：不排除任何增值服務（＝全部列入抽成） */
const NO_RULE: CommissionExclusionResolver = () => null;

/**
 * V3 團隊獎金基準用：各館「增值服務是否列入抽成」規則解析器。
 * 傳入本頁涉及的館別 id，回傳 (accommodationId, orderDate) => rule | null。
 */
export function useCommissionExclusionResolver(
  accommodationIds: Array<string | null | undefined>,
): CommissionExclusionResolver {
  const key = useMemo(
    () => Array.from(new Set((accommodationIds ?? []).filter(Boolean) as string[])).sort().join(","),
    [accommodationIds],
  );
  const [resolver, setResolver] = useState<CommissionExclusionResolver>(() => NO_RULE);

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setResolver(() => NO_RULE);
      return;
    }
    (async () => {
      const r = await buildCommissionExclusionResolver(supabase as any, ids);
      if (!cancelled) setResolver(() => r);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return resolver;
}
