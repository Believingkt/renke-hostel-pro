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

// 對於舊的英文 raw 值提供顯示 mapping；查無則直接顯示原值
const RAW_LABEL_MAP: Record<string, string> = {
  manual: "現場訂房",
  owner_provided: "業主自帶",
  website: "官網訂房",
  line: "Line@",
  agoda: "Agoda",
  booking: "Booking",
  trip: "Trip",
  travel_agency: "旅行社",
  kol: "KOL互惠",
  points_starchain: "星鏈會員",
  official_use: "公務使用",
  franchise_diff: "加盟價差",
  accommodation_voucher: "住宿票卷",
};

/**
 * 動態載入該住宿的訂單來源清單：
 * 1. accommodation_order_sources（設定的下拉選項，含 display_order）
 * 2. orders 表內所有實際存在的 distinct order_source（避免舊資料 / 特殊來源被隱藏）
 * 兩者合併並去重，按 display_order 排序，未設定的附加在後。
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
      const [configRes, ordersRes] = await Promise.all([
        supabase
          .from("accommodation_order_sources")
          .select("name, display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true }),
        supabase
          .from("orders")
          .select("order_source")
          .eq("accommodation_id", accommodationId)
          .not("order_source", "is", null),
      ]);

      if (cancelled) return;

      const configured = configRes.data ?? [];
      const distinctFromOrders = Array.from(
        new Set(
          (ordersRes.data ?? [])
            .map((r: { order_source: string | null }) => r.order_source)
            .filter((v): v is string => !!v && v.trim() !== "")
        )
      );

      if (configured.length === 0 && distinctFromOrders.length === 0) {
        setOptions(FALLBACK_ORDER_SOURCES);
        return;
      }

      const seen = new Set<string>();
      const merged: OrderSourceOption[] = [];

      // 1) 先放後台設定的順序
      for (const c of configured) {
        if (!c.name || seen.has(c.name)) continue;
        seen.add(c.name);
        merged.push({ value: c.name, label: RAW_LABEL_MAP[c.name] ?? c.name });
      }

      // 2) 再補資料庫實際存在但設定中沒有的
      for (const v of distinctFromOrders) {
        if (seen.has(v)) continue;
        seen.add(v);
        merged.push({ value: v, label: RAW_LABEL_MAP[v] ?? v });
      }

      setOptions(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  return options;
}
