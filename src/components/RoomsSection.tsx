import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  weekdayPricing?: PricingOption[];
  weekendPricing?: PricingOption[];
}

interface RoomsSectionProps {
  roomTypes: RoomType[];
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

const RoomCard = ({ room }: { room: RoomType }) => {
  const images = roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsDialogOpen(true);
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-xl transition-shadow group border rounded-xl bg-card">
        <div className="aspect-[4/3] overflow-hidden relative bg-muted">
          <Carousel className="w-full h-full">
            <CarouselContent>
              {images.map((image, index) => (
                <CarouselItem key={index}>
                  <div 
                    className="relative cursor-pointer group/image"
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
                    <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover/image:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
          </Carousel>
          <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium z-10">
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
        
        <div className="pt-4 border-t space-y-3">
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
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-10 font-medium mt-3">
              立即預訂
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>

    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0">
        <DialogClose className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-6 w-6 text-white drop-shadow-lg" />
          <span className="sr-only">關閉</span>
        </DialogClose>
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <Carousel className="w-full h-full" opts={{ startIndex: selectedImageIndex }}>
            <CarouselContent className="h-full">
              {images.map((image, index) => (
                <CarouselItem key={index} className="flex items-center justify-center h-full">
                  <img 
                    src={image} 
                    alt={`${room.name} - ${index + 1}`}
                    className="max-w-full max-h-full object-contain"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-4" />
            <CarouselNext className="right-4" />
          </Carousel>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

const RoomsSection = ({ roomTypes }: RoomsSectionProps) => {
  // 使用固定的包區數據
  const defaultRooms: RoomType[] = [
    {
      id: "12-people",
      name: "12人包區",
      name_en: "三間房 | 四人：3間",
      description: "適合中小型團體的豪華包區，提供完整的露營設施與舒適空間",
      capacity: 12,
      size_sqm: 150,
      base_price: 30000,
      weekdayPricing: [
        { type: "一泊二食", price: 30000 },
        { type: "一泊三食", price: 38400 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 33000 },
        { type: "一泊三食", price: 42000 },
      ],
    },
    {
      id: "14-people",
      name: "14人包區",
      name_en: "四間房 | 雙人1間 +四人3間",
      description: "寬敞舒適的包區空間，適合家庭或朋友團體聚會",
      capacity: 14,
      size_sqm: 180,
      base_price: 32700,
      weekdayPricing: [
        { type: "一泊二食", price: 32700 },
        { type: "一泊三食", price: 42500 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 36000 },
        { type: "一泊三食", price: 46500 },
      ],
    },
    {
      id: "16-people",
      name: "16人包區",
      name_en: "五間房 | 雙人2間 +四人3間",
      description: "大型團體的理想選擇，享受自然與慢活的豪華體驗",
      capacity: 16,
      size_sqm: 200,
      base_price: 38700,
      weekdayPricing: [
        { type: "一泊二食", price: 38700 },
        { type: "一泊三食", price: 49900 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 42500 },
        { type: "一泊三食", price: 54500 },
      ],
    },
    {
      id: "18-people",
      name: "18人包區",
      name_en: "18 People Package",
      description: "最大容量包區，提供頂級的團體露營體驗",
      capacity: 18,
      size_sqm: 220,
      base_price: 49500,
      weekdayPricing: [
        { type: "一泊二食", price: 49500 },
        { type: "一泊三食", price: 62100 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 54600 },
        { type: "一泊三食", price: 67200 },
      ],
    },
  ];

  // 直接使用固定的包區數據，不使用資料庫的舊資料
  const displayRooms = defaultRooms;

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
