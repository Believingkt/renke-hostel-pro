import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Users,
  ChevronRight,
  BedDouble,
  Building2,
  Maximize2,
} from "lucide-react";

export interface RoomTypeResult {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  capacity: number;
  size_sqm: number | null;
  room_count: number | null;
  photo_url: string | null;
  accommodation_id: string;
  accommodation_name: string;
  accommodation_type: string | null;
  accommodation_region_1: string | null;
  accommodation_region_2: string | null;
  /** Available rooms per night (min across stay dates), null if no date filter */
  available_rooms: number | null;
  /** Price for the stay dates (min daily price), null if no date filter */
  date_price: number | null;
}

interface RoomTypeCardProps {
  room: RoomTypeResult;
  onClick: () => void;
  hasDateFilter: boolean;
  nights: number;
}

const RoomTypeCard = ({ room, onClick, hasDateFilter, nights }: RoomTypeCardProps) => {
  const displayPrice = room.date_price ?? room.base_price;

  return (
    <Card
      className="overflow-hidden cursor-pointer group border-border/50 hover:border-border hover:shadow-md transition-all"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative h-44 bg-muted overflow-hidden">
        {room.photo_url ? (
          <img
            src={room.photo_url}
            alt={room.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "hsl(25, 60%, 95%)" }}
          >
            <BedDouble className="h-12 w-12" style={{ color: "hsl(25, 60%, 75%)" }} />
          </div>
        )}
        {room.accommodation_type && (
          <Badge
            className="absolute top-3 left-3 text-xs font-medium border-none text-white"
            style={{ background: "hsla(25, 70%, 45%, 0.85)" }}
          >
            {room.accommodation_type}
          </Badge>
        )}
        {hasDateFilter && room.available_rooms !== null && (
          <Badge
            className="absolute top-3 right-3 text-xs font-medium border-none text-white"
            style={{
              background:
                room.available_rooms <= 2
                  ? "hsla(0, 70%, 50%, 0.85)"
                  : "hsla(142, 60%, 40%, 0.85)",
            }}
          >
            剩 {room.available_rooms} 間
          </Badge>
        )}
      </div>

      {/* Info */}
      <CardContent className="p-4">
        <h3 className="font-semibold text-base line-clamp-1 text-foreground mb-0.5">
          {room.name}
        </h3>
        <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {room.accommodation_name}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          {(room.accommodation_region_1 || room.accommodation_region_2) && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {[room.accommodation_region_1, room.accommodation_region_2]
                .filter(Boolean)
                .join(" ")}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            {room.capacity} 人
          </span>
          {room.size_sqm && (
            <span className="flex items-center gap-0.5">
              <Maximize2 className="h-3 w-3" />
              {room.size_sqm} 坪
            </span>
          )}
        </div>

        {/* Price & CTA */}
        <div className="flex items-end justify-between pt-2 border-t border-border/50">
          <div>
            <span className="text-xs text-muted-foreground">每晚</span>
            <p className="font-bold text-lg" style={{ color: "hsl(25, 70%, 50%)" }}>
              NT$ {displayPrice.toLocaleString()}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1 shrink-0 text-primary hover:text-white"
          >
            立即預訂
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RoomTypeCard;
