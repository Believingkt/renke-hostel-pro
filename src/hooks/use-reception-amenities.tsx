import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOrderAmenityMap,
  type ReceptionAmenityMap,
  type ReceptionAmenityItemRef,
} from "@/lib/receptionAmenities";

/**
 * Reception 專用：batch 讀取當前名單訂單的備品分配（read-only）。
 * 一次 query allocations + 一次 query items，避免 N+1。
 */
export function useReceptionAmenities(accommodationId: string | null | undefined, orderIds: string[]) {
  const [map, setMap] = useState<ReceptionAmenityMap>({});
  const [loading, setLoading] = useState(false);

  const key = orderIds.slice().sort().join(",");

  const load = useCallback(async () => {
    if (!accommodationId || orderIds.length === 0) {
      setMap({});
      return;
    }
    setLoading(true);
    try {
      const [allocRes, itemsRes] = await Promise.all([
        supabase
          .from("order_amenity_allocations")
          .select("order_id, amenity_item_id, quantity")
          .in("order_id", orderIds),
        supabase
          .from("amenity_items")
          .select("id, name, unit, display_order")
          .eq("accommodation_id", accommodationId),
      ]);
      if (allocRes.error || itemsRes.error) {
        setMap({});
        return;
      }
      setMap(
        buildOrderAmenityMap(
          (allocRes.data ?? []) as Array<{ order_id: string; amenity_item_id: string; quantity: number | null }>,
          (itemsRes.data ?? []) as ReceptionAmenityItemRef[],
        ),
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { amenityMap: map, amenityLoading: loading, reloadAmenities: load };
}
