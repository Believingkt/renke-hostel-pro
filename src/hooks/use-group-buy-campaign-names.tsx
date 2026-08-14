import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerGroupBuyCampaignNames } from "@/utils/orderHelpers";

let cache: Promise<void> | null = null;

/**
 * 載入網紅團購活動 slug → 名稱對照（全站快取一次），
 * 讓訂單來源標籤能顯示「網紅團購 - 活動名稱」。
 */
export function useGroupBuyCampaignNames() {
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!cache) {
      cache = (async () => {
        const { data } = await supabase
          .from("group_buy_campaigns")
          .select("slug, title, kol_display_name");
        const map: Record<string, string> = {};
        for (const c of data ?? []) {
          if (!c.slug) continue;
          map[c.slug] = c.kol_display_name ? `${c.kol_display_name}・${c.title}` : c.title;
        }
        registerGroupBuyCampaignNames(map);
      })();
    }
    cache.then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);
}
