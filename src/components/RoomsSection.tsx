import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ZoomIn } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { ImageViewerPortal } from "./ImageViewerPortal";
import { OptimizedImage } from "./OptimizedImage";
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
  room_count?: number;
  quad_room_count?: number;
  double_room_count?: number;
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

const RoomCard = ({ room, isFirstRoom = false }: { room: RoomType & { room_photos?: { photo_url: string; display_order: number }[] }, isFirstRoom?: boolean }) => {
  // 優先使用資料庫照片，沒有則使用預設照片
  const databaseImages = room.room_photos?.map(p => p.photo_url) || [];
  const defaultImages = roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
  const images = databaseImages.length > 0 ? databaseImages : defaultImages;
  
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [amenities, setAmenities] = useState<string[]>([]);

  useEffect(() => {
    loadAmenities();
  }, [room.id]);

  const loadAmenities = async () => {
    try {
      const { data, error } = await supabase
        .from('room_amenities')
        .select('amenity_name')
        .eq('room_type_id', room.id)
        .limit(8); // 限制顯示數量

      if (error) throw error;
      setAmenities(data?.map(item => item.amenity_name) || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading amenities:', error);
      }
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
  };

  const handleCloseViewer = () => {
    setSelectedImageIndex(null);
    setTimeout(() => {
      const roomsSection = document.getElementById('rooms');
      if (roomsSection) {
        roomsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handlePrevImage = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex - 1 + images.length) % images.length);
    }
  };

  const handleNextImage = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex + 1) % images.length);
    }
  };

  return (
    <div className="h-full">
      <Card className="overflow-hidden hover:shadow-xl transition-shadow group border rounded-xl bg-card flex flex-col h-full">
        <div className="aspect-[16/10] md:aspect-[4/3] overflow-hidden relative bg-muted flex-shrink-0">
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
                    <OptimizedImage
                      src={image}
                      alt={`${room.name} - 房型照片 ${index + 1}`}
                      className="w-full h-full object-cover"
                      width="800"
                      height="600"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      priority={isFirstRoom && index === 0}
                      autoSrcSet={true}
                      imageType="medium"
                    />
                    <div className="absolute top-3 md:top-4 right-3 md:right-4 bg-black/40 hover:bg-black/60 p-1.5 md:p-2 rounded-full transition-colors z-10">
                      <ZoomIn className="h-4 w-4 md:h-5 md:w-5 text-white" />
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
          </Carousel>
        </div>
      <CardContent className="p-4 md:p-5 lg:p-6 flex flex-col flex-1 min-h-0">
        <h3 className="text-lg md:text-xl lg:text-2xl font-bold mb-2 text-foreground">{room.name}</h3>
        
        <div className="space-y-2 md:space-y-3 mb-4 md:mb-5">
          {(room.room_count || room.quad_room_count || room.double_room_count) && (
            <div className="text-sm md:text-base text-foreground/80 font-medium leading-relaxed">
              {room.room_count && room.room_count > 0 && <span className="font-semibold">{room.room_count} 間房</span>}
              {((room.quad_room_count && room.quad_room_count > 0) || (room.double_room_count && room.double_room_count > 0)) && (
                <span className="ml-2 text-muted-foreground text-xs md:text-sm">
                  (
                  {room.quad_room_count && room.quad_room_count > 0 && <span>四人房 {room.quad_room_count} 間</span>}
                  {room.quad_room_count && room.quad_room_count > 0 && room.double_room_count && room.double_room_count > 0 && <span>、</span>}
                  {room.double_room_count && room.double_room_count > 0 && <span>雙人房 {room.double_room_count} 間</span>}
                  )
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="font-medium">{room.capacity} 人</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span className="font-medium">{room.size_sqm} ㎡</span>
            </div>
          </div>
        </div>
        
        <p className="text-xs md:text-sm mb-4 md:mb-5 text-muted-foreground leading-relaxed h-10 md:h-12 overflow-hidden">{room.description}</p>

        <div className="flex flex-wrap gap-1.5 md:gap-2 h-14 md:h-16 content-start overflow-hidden">
          {amenities.length > 0 ? (
            amenities.map((amenity, index) => (
              <span key={index} className="px-2 md:px-3 py-0.5 md:py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md h-fit whitespace-nowrap">
                {amenity}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">尚未設定設施</span>
          )}
        </div>
        
        <div className="pt-3 border-t mt-3">
          <div className="space-y-2 md:space-y-3 md:min-h-[180px] lg:min-h-[200px]">
            {room.weekdayPricing && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">平日</p>
                <div className="space-y-1">
                  {room.weekdayPricing.map((option, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-muted-foreground">{option.type}</span>
                      <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {option.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {room.weekendPricing && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">假日</p>
                <div className="space-y-1">
                  {room.weekendPricing.map((option, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-muted-foreground">{option.type}</span>
                      <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {option.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Link to={`/booking?roomId=${room.id}&step=dates`}>
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 md:h-10 font-medium mt-3 md:mt-4 text-sm md:text-base">
              立即預訂
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>

    {selectedImageIndex !== null && (
      <ImageViewerPortal
        imageUrl={images[selectedImageIndex]}
        onClose={handleCloseViewer}
        onPrev={handlePrevImage}
        onNext={handleNextImage}
      />
    )}
    </div>
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
    room_count: room.room_count,
    quad_room_count: room.quad_room_count,
    double_room_count: room.double_room_count,
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
    <section id="rooms" className="py-12 md:py-16 lg:py-20 bg-secondary/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">房型導覽</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">
            精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 lg:gap-6 items-stretch">
            {displayRooms.map((room, index) => (
              <RoomCard key={room.id} room={room} isFirstRoom={index === 0} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomsSection;
