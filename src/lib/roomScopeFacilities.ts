import { supabase } from "@/integrations/supabase/client";

export type RoomScope = "whole" | "single";

export const ROOM_SCOPE_LABELS: Record<RoomScope, string> = {
  whole: "包棟",
  single: "單間",
};

/** 依房型判斷屬於包棟或單間 */
export function getRoomScope(roomType: { is_exclusive_package?: boolean | null }): RoomScope {
  return roomType?.is_exclusive_package ? "whole" : "single";
}

/**
 * 讀取某民宿的「包棟／單間」設施清單。
 * 整館通用設施（room_scope 為 null）不包含在內。
 */
export async function fetchScopedFacilities(
  accommodationId: string,
): Promise<Record<RoomScope, string[]>> {
  const result: Record<RoomScope, string[]> = { whole: [], single: [] };
  if (!accommodationId) return result;

  const { data, error } = await supabase
    .from("accommodation_facilities")
    .select("facility_name, room_scope, is_available")
    .eq("accommodation_id", accommodationId)
    .not("room_scope", "is", null);

  if (error || !data) return result;

  for (const row of data as Array<{ facility_name: string; room_scope: string | null; is_available: boolean | null }>) {
    if (!row.is_available) continue;
    const scope = row.room_scope as RoomScope;
    if (scope !== "whole" && scope !== "single") continue;
    if (!result[scope].includes(row.facility_name)) result[scope].push(row.facility_name);
  }

  return result;
}
