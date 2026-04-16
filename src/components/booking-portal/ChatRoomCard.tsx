import { Building2, Users, Ruler, DollarSign } from "lucide-react";

interface RoomInfo {
  accommodation: string;
  roomName: string;
  capacity: string;
  price: string;
  area: string;
}

const parseRoomListings = (text: string): { rooms: RoomInfo[]; beforeText: string; afterText: string } | null => {
  const lines = text.split("\n");
  const roomPattern = /🏠\s*(.+?)\s*[-–]\s*(.+?)\s*[（(]\s*(\d+\s*人)\s*[）)]\s*💰\s*(NT\$\s*[\d,]+\/晚)\s*📐\s*(.+?坪)/;
  
  const rooms: RoomInfo[] = [];
  const beforeLines: string[] = [];
  const afterLines: string[] = [];
  let foundFirst = false;
  let doneWithRooms = false;

  for (const line of lines) {
    const match = line.match(roomPattern);
    if (match) {
      foundFirst = true;
      rooms.push({
        accommodation: match[1].trim(),
        roomName: match[2].trim(),
        capacity: match[3].trim(),
        price: match[4].trim(),
        area: match[5].trim(),
      });
    } else if (!foundFirst) {
      beforeLines.push(line);
    } else {
      doneWithRooms = true;
      afterLines.push(line);
    }
  }

  if (rooms.length < 2) return null;

  return {
    rooms,
    beforeText: beforeLines.join("\n").trim(),
    afterText: afterLines.join("\n").trim(),
  };
};

const ChatRoomCard = ({ room }: { room: RoomInfo }) => {
  const isZeroPrice = room.price.includes("0/晚");
  
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{room.accommodation}</span>
          </p>
          <p className="font-semibold text-sm text-foreground leading-snug">{room.roomName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {room.capacity}
        </span>
        <span className="flex items-center gap-1">
          <Ruler className="h-3 w-3" />
          {room.area}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className={`text-sm font-bold flex items-center gap-1 ${isZeroPrice ? "text-green-600" : "text-[hsl(25,70%,50%)]"}`}>
          <DollarSign className="h-3.5 w-3.5" />
          {isZeroPrice ? "洽詢價格" : room.price}
        </span>
      </div>
    </div>
  );
};

export { parseRoomListings, ChatRoomCard };
export type { RoomInfo };
