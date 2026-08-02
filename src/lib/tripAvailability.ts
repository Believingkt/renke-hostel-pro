/**
 * 行程模組「住宿即時房況」查詢。
 *
 * 一律走既有 RPC get_adjusted_room_inventory_batch（已扣既有訂單），
 * 不自行重算庫存；並沿用前台既有的「整天關閉」鎖定規則：
 *  - 森山寫照 / 奧莉薇雅 / 淞湘卉館：任一包棟（is_exclusive_package）被訂走或關閉 → 整天關閉
 *  - 哈庫納馬塔塔：包棟房型有 ≥2 個無庫存 → 整天關閉（散客不計入）
 */
import { supabase } from "@/integrations/supabase/client";

const HAKUNA_ACCOMMODATION_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const SENSAN_ACCOMMODATION_ID = "5f764d55-ae11-4631-80fe-2e611853deae";

/** 任一包棟被訂走即整天關閉 */
const STRICT_PACKAGE_ANY_BOOKED_IDS = new Set<string>([
  SENSAN_ACCOMMODATION_ID,
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8", // 奧莉薇雅生活小酒店
  "8e3e8866-3cb0-4654-91f3-d9b09a543301", // 淞湘卉館
]);

export interface RoomAvailability {
  roomTypeId: string;
  accommodationId: string;
  roomTypeName: string;
  accommodationName: string;
  available: number;
  /** 整天關閉（庫存被關閉，或觸發館別鎖定規則） */
  blocked: boolean;
}

interface AdjRow {
  date_value?: string;
  date?: string;
  available_rooms?: number;
  is_blocked?: boolean;
}

async function queryAdjusted(
  roomTypeId: string,
  accommodationId: string,
  dateStr: string,
): Promise<{ available: number; blocked: boolean }> {
  const { data, error } = await supabase.rpc("get_adjusted_room_inventory_batch", {
    p_room_type_id: roomTypeId,
    p_dates: [dateStr],
    p_accommodation_id: accommodationId,
  });
  if (error) throw error;
  const row = ((data as AdjRow[]) || [])[0];
  return {
    available: row?.available_rooms ?? 0,
    blocked: row?.is_blocked === true,
  };
}

/** 取得單一房型在指定日期的即時房況（含館別鎖定規則） */
export async function fetchRoomAvailability(
  roomTypeId: string,
  dateStr: string,
): Promise<RoomAvailability | null> {
  const { data: rt } = await supabase
    .from("room_types")
    .select("id, name, accommodation_id, is_exclusive_package")
    .eq("id", roomTypeId)
    .maybeSingle();
  if (!rt) return null;

  const accommodationId = rt.accommodation_id as string;
  const { data: acc } = await supabase
    .from("accommodation_info")
    .select("name")
    .eq("id", accommodationId)
    .maybeSingle();

  const self = await queryAdjusted(roomTypeId, accommodationId, dateStr);

  let blocked = self.blocked;

  const needsLockCheck =
    STRICT_PACKAGE_ANY_BOOKED_IDS.has(accommodationId) ||
    accommodationId === HAKUNA_ACCOMMODATION_ID;

  if (needsLockCheck && !blocked) {
    const { data: exclusiveTypes } = await supabase
      .from("room_types")
      .select("id")
      .eq("accommodation_id", accommodationId)
      .eq("is_exclusive_package", true);

    const ids = (exclusiveTypes || []).map((r) => r.id as string);
    if (ids.length > 0) {
      const results = await Promise.all(
        ids.map(async (id) => {
          if (id === roomTypeId) return self;
          try {
            return await queryAdjusted(id, accommodationId, dateStr);
          } catch {
            return { available: 0, blocked: false };
          }
        }),
      );
      const soldOutCount = results.filter((r) => r.blocked || r.available <= 0).length;

      if (STRICT_PACKAGE_ANY_BOOKED_IDS.has(accommodationId)) {
        // 任一包棟不可訂 → 整天關閉
        if (soldOutCount > 0) blocked = true;
      } else if (accommodationId === HAKUNA_ACCOMMODATION_ID) {
        // 包棟 ≥2 無庫存 → 整天關閉
        if (soldOutCount >= 2) blocked = true;
      }
    }
  }

  return {
    roomTypeId,
    accommodationId,
    roomTypeName: (rt.name as string) || "",
    accommodationName: (acc?.name as string) || "",
    available: blocked ? 0 : self.available,
    blocked,
  };
}
