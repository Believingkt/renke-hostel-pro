import { supabase } from "@/integrations/supabase/client";

/**
 * 判斷「對應方案（accommodation_packages）」是否為必填。
 *
 * 必填條件（三者需同時成立）：
 *   (a) 該物業 accommodation_owlting_config.sync_enabled = true
 *   (b) 該房型未被 owlting_room_type_sync 排除（sync_enabled ≠ false）
 *   (c) 該房型不屬於任何 owlting_room_type_group（群組房型 RatePlanCode 由群組決定）
 *
 * 只要 roomTypeIds 中有「任一」符合以上三條件的房型，就要求填 package_id。
 */
export interface OwltingPackageRequirement {
  required: boolean;
  requiredRoomTypeIds: string[];
}

export async function checkOwltingPackageRequirement(
  accommodationId: string,
  roomTypeIds: string[],
): Promise<OwltingPackageRequirement> {
  const empty: OwltingPackageRequirement = { required: false, requiredRoomTypeIds: [] };
  if (!accommodationId || roomTypeIds.length === 0) return empty;

  // (a) 物業層級同步開關
  const { data: cfg } = await supabase
    .from("accommodation_owlting_config")
    .select("sync_enabled")
    .eq("accommodation_id", accommodationId)
    .maybeSingle();
  if (!cfg || cfg.sync_enabled !== true) return empty;

  const uniqueIds = Array.from(new Set(roomTypeIds.filter(Boolean)));
  if (uniqueIds.length === 0) return empty;

  // (b) 房型層級同步排除（sync_enabled=false 的排除）
  const { data: syncRows } = await supabase
    .from("owlting_room_type_sync")
    .select("room_type_id, sync_enabled")
    .eq("accommodation_id", accommodationId)
    .in("room_type_id", uniqueIds);
  const excludedIds = new Set(
    (syncRows || []).filter((r: any) => r.sync_enabled === false).map((r: any) => r.room_type_id),
  );

  // (c) 群組房型（在群組內 → 不必填）
  const { data: groupRows } = await supabase
    .from("owlting_room_type_group_members")
    .select("room_type_id")
    .in("room_type_id", uniqueIds);
  const groupedIds = new Set((groupRows || []).map((r: any) => r.room_type_id));

  const requiredRoomTypeIds = uniqueIds.filter(
    (id) => !excludedIds.has(id) && !groupedIds.has(id),
  );

  return { required: requiredRoomTypeIds.length > 0, requiredRoomTypeIds };
}
