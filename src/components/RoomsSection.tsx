import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Users } from "lucide-react";
import roomDeluxe from "@/assets/room-deluxe.jpg";
import roomSuite from "@/assets/room-suite.jpg";
import roomStandard from "@/assets/room-standard.jpg";

interface RoomType {
  id: string;
  name: string;
  name_en: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
}

interface RoomsSectionProps {
  roomTypes: RoomType[];
}

const roomImages: Record<string, string> = {
  "豪華和室": roomDeluxe,
  "精緻套房": roomSuite,
  "標準客房": roomStandard,
};

const RoomCard = ({ room }: { room: RoomType }) => {
  const imageSrc = roomImages[room.name] || roomStandard;

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-shadow group border rounded-xl bg-card">
      <div className="aspect-[4/3] overflow-hidden relative bg-muted">
        <picture>
          <img 
            src={imageSrc} 
            alt={room.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
            decoding="async"
            width="512"
            height="512"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </picture>
        <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
          {room.capacity}人
        </div>
      </div>
      <CardContent className="p-4 md:p-6">
        <h3 className="text-xl md:text-2xl font-bold mb-1 text-foreground">{room.name}</h3>
        <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">{room.name_en}</p>
        <p className="text-sm mb-4 md:mb-6 text-muted-foreground leading-relaxed">{room.description}</p>
        
        <div className="flex items-center gap-3 mb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{room.capacity}人</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>{room.size_sqm}㎡</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">山景陽台</span>
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">獨立衛浴</span>
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">免費WiFi</span>
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">迎賓茶點</span>
        </div>
        
        <div className="flex items-end justify-between pt-4 border-t">
          <div>
            <p className="text-xs text-muted-foreground mb-1">起價</p>
            <p className="text-2xl font-bold text-primary">
              NT$ {room.base_price.toLocaleString()}
            </p>
          </div>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-6 h-10 font-medium">
            立即預訂
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const RoomsSection = ({ roomTypes }: RoomsSectionProps) => {
  return (
    <section id="rooms" className="py-12 md:py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">房型導覽</h2>
          <p className="text-center text-muted-foreground mb-8 md:mb-16 text-base md:text-lg">
            精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {roomTypes.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomsSection;
