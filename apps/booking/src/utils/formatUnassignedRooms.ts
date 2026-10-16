export interface UnassignedRoom {
  room_type_id: string;
  requested_unit: string | null;
  reason: "occupied" | "no_free_unit";
}

export interface RoomTypeName { id: string; name: string | null }

export interface UnassignedRoomsSummary {
  heading: string;
  items: string[];
  text: string;
}

function describeRoom(room: UnassignedRoom, roomTypes: RoomTypeName[]): string {
  const name = roomTypes.find((rt) => rt.id === room.room_type_id)?.name?.trim() || "房型";
  if (room.reason === "occupied") {
    return room.requested_unit
      ? `${name}（原指定 ${room.requested_unit}，已被佔用）`
      : `${name}（原指定房號已被佔用）`;
  }
  return `${name}（無空房號）`;
}

// 依後端 unassigned_rooms 組出「哪幾間沒分配到房號、原因」；空陣列或非陣列回傳 null
export function formatUnassignedRooms(
  rooms: unknown,
  roomTypes: RoomTypeName[],
  ending: string,
): UnassignedRoomsSummary | null {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  const items = (rooms as UnassignedRoom[]).map((r) => describeRoom(r, roomTypes));
  const heading = `訂單已建立，但以下 ${items.length} 間未分配房號，${ending}`;
  return { heading, items, text: `${heading}：${items.join("、")}` };
}
