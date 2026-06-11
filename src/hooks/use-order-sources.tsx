import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrderSourceOption {
  value: string;
  label: string;
}

export const FALLBACK_ORDER_SOURCES: OrderSourceOption[] = [
  { value: "website", label: "官網訂房" },
  { value: "manual", label: "現場訂房" },
  { value: "line", label: "Line@" },
  { value: "agoda", label: "Agoda" },
  { value: "booking", label: "Booking" },
  { value: "trip", label: "Trip" },
  { value: "travel_agency", label: "旅行社" },
  { value: "kol", label: "KOL互惠" },
  { value: "points_starchain", label: "星鏈會員" },
  { value: "official_use", label: "公務使用" },
  { value: "franchise_diff", label: "加盟價差" },
  { value: "owner_provided", label: "業主自帶" },
];

/**
 * 動態載入該住宿的訂單來源清單。
 * 若 accommodation_order_sources 表有資料則使用，否則 fallback 回原本寫死選項。
 */
export function useOrderSources(accommodationId?: string | null): OrderSourceOption[] {
  const [options, setOptions] = useState<OrderSourceOption[]>(FALLBACK_ORDER_SOURCES);

  useEffect(() => {
    let cancelled = false;
    if (!accommodationId) {
      setOptions(FALLBACK_ORDER_SOURCES);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("accommodation_order_sources")
        .select("name, display_order")
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true });

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setOptions(FALLBACK_ORDER_SOURCES);
        return;
      }
      setOptions(data.map((r) => ({ value: r.name, label: r.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  return options;
}
