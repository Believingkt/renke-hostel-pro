import { supabase } from "@/integrations/supabase/client";

export type RoomFacilityScope = "whole" | "single";

/**
 * 讀取館別的「客房設施」（已由原 room_amenities 合併至 accommodation_facilities，
 * 以 room_scope = 'whole'（包棟）/ 'single'（單間）區分）。
 * 若尚未設定，回退到舊的 room_amenities 資料。
 */
export async function fetchRoomScopeAmenities(
  accommodationId: string,
  roomTypes: Array<{ id: string; is_exclusive_package?: boolean | null }>
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  if (!accommodationId || roomTypes.length === 0) return result;

  // 後台開關：包棟／單間各自可獨立關閉前台顯示
  const { data: info } = await supabase
    .from("accommodation_info")
    .select("show_room_facilities_whole, show_room_facilities_single")
    .eq("id", accommodationId)
    .maybeSingle();
  const showWhole = (info as any)?.show_room_facilities_whole !== false;
  const showSingle = (info as any)?.show_room_facilities_single !== false;
  if (!showWhole && !showSingle) return result;

  const { data } = await supabase
    .from("accommodation_facilities")
    .select("facility_name, room_scope, is_available")
    .eq("accommodation_id", accommodationId)
    .in("room_scope", ["whole", "single"]);

  const byScope: Record<RoomFacilityScope, string[]> = { whole: [], single: [] };
  (data || []).forEach((row: any) => {
    if (row.is_available === false) return;
    const s = row.room_scope as RoomFacilityScope;
    if (byScope[s]) byScope[s].push(row.facility_name);
  });
  if (!showWhole) byScope.whole = [];
  if (!showSingle) byScope.single = [];

  const hasScoped = byScope.whole.length > 0 || byScope.single.length > 0;
  if (hasScoped) {
    for (const rt of roomTypes) {
      const scope: RoomFacilityScope = rt.is_exclusive_package ? "whole" : "single";
      const enabled = scope === "whole" ? showWhole : showSingle;
      if (!enabled) {
        result[rt.id] = [];
        continue;
      }
      result[rt.id] = byScope[scope].length > 0 ? byScope[scope] : byScope.single.concat(byScope.whole);
    }
    return result;
  }


  // Legacy fallback
  const { data: legacy } = await supabase
    .from("room_amenities")
    .select("amenity_name, room_type_id")
    .in("room_type_id", roomTypes.map((r) => r.id));
  (legacy || []).forEach((row: any) => {
    (result[row.room_type_id] ||= []).push(row.amenity_name);
  });
  return result;
}
