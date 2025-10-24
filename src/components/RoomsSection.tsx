import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

const roomImages: Record<string, string> = {
  "豪華和室": roomDeluxe,
  "精緻套房": roomSuite,
  "標準客房": roomStandard,
};

const RoomsSection = () => {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  useEffect(() => {
    fetchRoomTypes();
  }, []);

  const fetchRoomTypes = async () => {
    const { data: infoData } = await supabase
      .from("accommodation_info")
      .select("id")
      .single();
    
    if (infoData) {
      const { data: roomsData } = await supabase
        .from("room_types")
        .select("*")
        .eq("accommodation_id", infoData.id)
        .order("display_order");
      
      if (roomsData) {
        setRoomTypes(roomsData);
      }
    }
  };

  return (
    <section id="rooms" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">房型導覽</h2>
          <p className="text-center text-muted-foreground mb-16 text-lg">
            精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {roomTypes.map((room) => (
              <Card key={room.id} className="overflow-hidden hover:shadow-xl transition-shadow group border-0 rounded-2xl">
                <div className="aspect-[4/3] overflow-hidden rounded-t-2xl">
                  <img 
                    src={roomImages[room.name] || roomStandard} 
                    alt={room.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-sm text-primary font-medium">{room.capacity}人</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-foreground">{room.name}</h3>
                  <p className="text-base text-primary mb-4 font-normal">{room.name_en}</p>
                  <p className="text-sm mb-6 text-muted-foreground leading-relaxed">{room.description}</p>
                  
                  <div className="flex items-center gap-4 mb-6 text-sm text-foreground font-medium">
                    <span>{room.capacity}人</span>
                    <span>{room.size_sqm}㎡</span>
                    <span>山景陽台</span>
                    <span>免費WiFi</span>
                  </div>

                  <Separator className="my-6" />
                  
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">起價</p>
                      <p className="text-3xl font-bold text-primary">
                        NT$ {room.base_price.toLocaleString()}
                      </p>
                    </div>
                    <Button className="bg-primary hover:bg-primary/90 rounded-lg px-6 h-11 font-medium">
                      立即預訂
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomsSection;
