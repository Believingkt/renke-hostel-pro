import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  parseSecondaryCurrency,
  type SecondaryCurrencyConfig,
} from "@/lib/currency";

/**
 * 取得某住宿的「副幣別顯示」設定（如旅行日 JPY）。
 * 回傳 null 表示該住宿未啟用副幣別顯示，呼叫端應走純 TWD 路徑。
 */
export function useSecondaryCurrency(
  accommodationId: string | null | undefined,
): {
  config: SecondaryCurrencyConfig | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["accommodation-secondary-currency", accommodationId],
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!accommodationId) return null;
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("secondary_currency, secondary_currency_rate")
        .eq("id", accommodationId)
        .maybeSingle();
      if (error) {
        console.warn("[useSecondaryCurrency] fetch error:", error);
        return null;
      }
      return parseSecondaryCurrency(data);
    },
  });

  return { config: data ?? null, isLoading };
}
