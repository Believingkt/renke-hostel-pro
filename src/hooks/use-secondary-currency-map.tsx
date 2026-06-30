import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseSecondaryCurrency, type SecondaryCurrencyConfig } from "@/lib/currency";

/**
 * 一次撈出「全平台所有有設定副幣別」的住宿 → Map<accId, config>
 * 用於後台跨民宿列表（訂單列表、營運分析等）批次顯示 JPY 等參考價
 */
export function useSecondaryCurrencyMap(): {
  map: Map<string, SecondaryCurrencyConfig>;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["accommodation-secondary-currency-map"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, secondary_currency, secondary_currency_rate")
        .not("secondary_currency", "is", null);
      if (error) {
        console.warn("[useSecondaryCurrencyMap] fetch error:", error);
        return new Map<string, SecondaryCurrencyConfig>();
      }
      const m = new Map<string, SecondaryCurrencyConfig>();
      (data || []).forEach((row: any) => {
        const cfg = parseSecondaryCurrency(row);
        if (cfg) m.set(row.id, cfg);
      });
      return m;
    },
  });

  return { map: data ?? new Map(), isLoading };
}
