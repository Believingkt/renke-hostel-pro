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
export type ChannelManager = "owlting" | "hotelnabe";

export interface OwltingPackageRequirement {
  required: boolean;
  /** 是否為「必填」（僅奧丁丁；hotelnabe 庫存推送只看房型，方案選填） */
  blocking: boolean;
  requiredRoomTypeIds: string[];
  /** 實際啟用的通路（未啟用時為 null） */
  channel: ChannelManager | null;
  /** 顯示用通路名稱：奧丁丁 / hotelnabe */
  channelLabel: string;
}

export function channelLabelOf(channel: ChannelManager | null): string {
  return channel === "hotelnabe" ? "hotelnabe" : channel === "owlting" ? "奧丁丁" : "";
}

/** 僅取得該民宿啟用中的通路（給 UI 決定是否顯示「對應方案」欄位） */
export async function getAccommodationChannel(
  accommodationId: string,
): Promise<ChannelManager | null> {
  if (!accommodationId) return null;
  const [owltingRes, hotelnabeRes] = await Promise.all([
    supabase
      .from("accommodation_owlting_config")
      .select("sync_enabled")
      .eq("accommodation_id", accommodationId)
      .maybeSingle(),
    supabase
      .from("accommodation_hotelnabe_config")
      .select("sync_enabled")
      .eq("accommodation_id", accommodationId)
      .maybeSingle(),
  ]);
  if (owltingRes.data?.sync_enabled === true) return "owlting";
  if (hotelnabeRes.data?.sync_enabled === true) return "hotelnabe";
  return null;
}


export async function checkOwltingPackageRequirement(
  accommodationId: string,
  roomTypeIds: string[],
): Promise<OwltingPackageRequirement> {
  const empty: OwltingPackageRequirement = {
    required: false,
    blocking: false,
    requiredRoomTypeIds: [],
    channel: null,
    channelLabel: "",
  };

  if (!accommodationId || roomTypeIds.length === 0) return empty;

  // (a) 物業層級同步開關（奧丁丁 或 旭海 hotelnabe）
  const [owltingRes, hotelnabeRes] = await Promise.all([
    supabase
      .from("accommodation_owlting_config")
      .select("sync_enabled")
      .eq("accommodation_id", accommodationId)
      .maybeSingle(),
    supabase
      .from("accommodation_hotelnabe_config")
      .select("sync_enabled")
      .eq("accommodation_id", accommodationId)
      .maybeSingle(),
  ]);
  const channel: ChannelManager | null =
    owltingRes.data?.sync_enabled === true
      ? "owlting"
      : hotelnabeRes.data?.sync_enabled === true
        ? "hotelnabe"
        : null;
  // 未串接任何通路 → 不強制填入對應方案
  if (!channel) return empty;

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

  return {
    required: requiredRoomTypeIds.length > 0,
    blocking: channel === "owlting" && requiredRoomTypeIds.length > 0,
    requiredRoomTypeIds,

    channel,
    channelLabel: channelLabelOf(channel),
  };
}
