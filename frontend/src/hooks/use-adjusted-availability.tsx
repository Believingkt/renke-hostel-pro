/**
 * 後台房況「實際可售」顯示用 hook。
 *
 * SoT 說明：
 *  - 基礎庫存（base）：room_inventory_pricing.available_rooms（由既有畫面自行讀取）
 *  - 實際可售（adjusted）：一律走 RPC get_adjusted_room_inventory_batch，
 *    已含正式訂單佔用與有效的信用卡付款保留（active group-buy payment holds）；
 *    過期 / 轉單 / 取消者不計入。前端不自行做 base - orders - holds 的第二套計算。
 */
import { useEffect, useState } from "react";
import { fetchAdjustedInventoryForRoomTypes } from "@/lib/inventoryQuery";

export interface AdjustedCell {
  available: number;
  blocked: boolean;
}

export type AdjustedMap = Map<string, AdjustedCell>;

export const adjustedKey = (roomTypeId: string, date: string) => `${roomTypeId}_${date}`;

export function useAdjustedAvailability(
  roomTypeIds: string[],
  dates: string[],
  accommodationId?: string | null,
  refreshToken?: unknown,
) {
  const [map, setMap] = useState<AdjustedMap>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idsKey = roomTypeIds.join(",");
  const datesKey = dates.length ? `${dates[0]}~${dates[dates.length - 1]}:${dates.length}` : "";

  useEffect(() => {
    let cancelled = false;
    if (!accommodationId || roomTypeIds.length === 0 || dates.length === 0) {
      setMap(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    fetchAdjustedInventoryForRoomTypes(roomTypeIds, dates, accommodationId)
      .then((results) => {
        if (cancelled) return;
        const next: AdjustedMap = new Map();
        results.forEach(({ roomTypeId, rows }) => {
          rows.forEach((row) => {
            const date = row.date.includes("T") ? row.date.split("T")[0] : row.date;
            next.set(adjustedKey(roomTypeId, date), {
              available: row.is_blocked ? 0 : Number(row.available_rooms ?? 0),
              blocked: row.is_blocked,
            });
          });
        });
        setMap(next);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "實際可售查詢失敗");
        setMap(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, datesKey, accommodationId, refreshToken]);

  return { adjusted: map, loading, error };
}
