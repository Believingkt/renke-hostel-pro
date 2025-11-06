import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, X, ZoomIn } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import roomDeluxe from "@/assets/room-deluxe.jpg";
import roomSuite from "@/assets/room-suite.jpg";
import roomStandard from "@/assets/room-standard.jpg";

interface PricingOption {
  type: string;
  price: number;
}

interface RoomType {
  id: string;
  name: string;
  name_en: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
  weekday_price?: number;
  weekend_price?: number;
  weekdayPricing?: PricingOption[];
  weekendPricing?: PricingOption[];
}

interface RoomsSectionProps {
  roomTypes: any[];
}

const roomImages: Record<string, string[]> = {
  // 包區房型
  "12人包區": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "14人包區": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "16人包區": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
  "18人包區": [roomDeluxe, roomStandard, roomSuite, roomDeluxe, roomStandard],
  // 資料庫中的房型
  "豪華和室": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "精緻套房": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "標準客房": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
};

const RoomCard = ({ room }: { room: RoomType & { room_photos?: { photo_url: string; display_order: number }[] } }) => {
  // 優先使用資料庫照片，沒有則使用預設照片
  const databaseImages = room.room_photos?.map(p => p.photo_url) || [];
  const defaultImages = roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
  const images = databaseImages.length > 0 ? databaseImages : defaultImages;
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsDialogOpen(true);
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-xl transition-shadow group border rounded-xl bg-card flex flex-col h-full">
        <div className="aspect-[4/3] overflow-hidden relative bg-muted flex-shrink-0">
          <Carousel 
            className="w-full h-full"
            opts={{ loop: true }}
          >
            <CarouselContent className="h-full">
              {images.map((image, index) => (
                <CarouselItem key={index} className="h-full">
                  <div 
                    className="relative cursor-pointer group/image h-full"
                    onClick={() => handleImageClick(index)}
                  >
                    <picture>
                      <img 
                        src={image} 
                        alt={`${room.name} - ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        width="512"
                        height="512"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    </picture>
                    <div className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 p-2 rounded-full transition-colors z-10">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
          </Carousel>
        </div>
      <CardContent className="p-4 md:p-6 flex flex-col flex-1">
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

        <div className="flex flex-wrap gap-2 mb-3">
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">山景陽台</span>
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">獨立衛浴</span>
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">免費WiFi</span>
          <span className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md">迎賓茶點</span>
        </div>
        
        <div className="pt-3 border-t space-y-3 mt-auto">
          {room.weekdayPricing && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">平日</p>
              <div className="space-y-1">
                {room.weekdayPricing.map((option, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-lg text-muted-foreground">{option.type}</span>
                    <span className="font-semibold text-xl text-primary">NT$ {option.price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {room.weekendPricing && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">假日</p>
              <div className="space-y-1">
                {room.weekendPricing.map((option, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-lg text-muted-foreground">{option.type}</span>
                    <span className="font-semibold text-xl text-primary">NT$ {option.price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link to={`/booking?roomId=${room.id}`}>
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-10 font-medium">
              立即預訂
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>

    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 border-0" aria-describedby={undefined}>
        <DialogClose className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-6 w-6 text-white drop-shadow-lg" />
          <span className="sr-only">關閉</span>
        </DialogClose>
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <img 
            src={images[selectedImageIndex]} 
            alt={`${room.name} - ${selectedImageIndex + 1}`}
            className="max-w-full max-h-full object-contain"
          />
          <Button
            variant="outline"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border-white/20"
            onClick={() => setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length)}
          >
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border-white/20"
            onClick={() => setSelectedImageIndex((prev) => (prev + 1) % images.length)}
          >
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

const RoomsSection = ({ roomTypes }: RoomsSectionProps) => {
  // 將資料庫的房型資料轉換為顯示格式，保留照片資料
  const displayRooms: RoomType[] = roomTypes.map(room => ({
    id: room.id,
    name: room.name,
    name_en: room.name_en || '',
    description: room.description || '',
    capacity: room.capacity,
    size_sqm: room.size_sqm || 0,
    base_price: room.base_price,
    room_photos: room.room_photos || [], // 保留照片資料
    weekdayPricing: (room.weekday_2_meals_price || room.weekday_3_meals_price) ? [
      ...(room.weekday_2_meals_price ? [{ type: "一泊二食", price: room.weekday_2_meals_price }] : []),
      ...(room.weekday_3_meals_price ? [{ type: "一泊三食", price: room.weekday_3_meals_price }] : [])
    ] : undefined,
    weekendPricing: (room.weekend_2_meals_price || room.weekend_3_meals_price) ? [
      ...(room.weekend_2_meals_price ? [{ type: "一泊二食", price: room.weekend_2_meals_price }] : []),
      ...(room.weekend_3_meals_price ? [{ type: "一泊三食", price: room.weekend_3_meals_price }] : [])
    ] : undefined,
  }));

  return (
    <section id="rooms" className="py-12 md:py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">房型導覽</h2>
          <p className="text-center text-muted-foreground mb-8 md:mb-16 text-base md:text-lg">
            精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {displayRooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomsSection;
