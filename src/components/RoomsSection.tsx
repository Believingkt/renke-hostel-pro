import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ZoomIn, Home } from "lucide-react";
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
  accommodation_id?: string;
  room_count?: number;
  quad_room_count?: number;
  triple_room_count?: number;
  double_room_count?: number;
  is_exclusive_package?: boolean;
  weekdayPricing?: PricingOption[];
  weekendPricing?: PricingOption[];
}

interface RoomsSectionProps {
  roomTypes: any[];
  sectionDescription?: string;
  customTitle?: string;
  customSubtitle?: string;
}

const roomImages: Record<string, string[]> = {
  "12人包區": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "14人包區": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "16人包區": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
  "18人包區": [roomDeluxe, roomStandard, roomSuite, roomDeluxe, roomStandard],
  "豪華和室": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "精緻套房": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "標準客房": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
};

const ExpandableDescription = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsClamped(el.scrollHeight > el.clientHeight);
    }
  }, [text]);

  return (
    <div className="mb-4 md:mb-5">
      <p
        ref={textRef}
        className={`text-sm text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}
      >
        {text}
      </p>
      {isClamped && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-primary hover:underline mt-1"
        >
          {expanded ? '收起' : '查看更多'}
        </button>
      )}
    </div>
  );
};

interface InventoryPricing {
  weekday_price?: number;
  weekend_price?: number;
  weekday_2_meals?: number;
  weekday_3_meals?: number;
  weekend_2_meals?: number;
  weekend_3_meals?: number;
}

const RoomCard = ({ room, isFirstRoom = false, sharedTemplateLabels, sharedHolidays, amenities, inventoryPricing }: { 
  room: RoomType & { room_photos?: { photo_url: string; display_order: number }[] }, 
  isFirstRoom?: boolean,
  sharedTemplateLabels?: { priceLabel?: string; price2MealsLabel?: string; price3MealsLabel?: string },
  sharedHolidays?: Set<string>,
  amenities?: string[],
  inventoryPricing?: InventoryPricing,
}) => {
  const databaseImages = room.room_photos?.map(p => p.photo_url) || [];
  const defaultImages = roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
  const images = databaseImages.length > 0 ? databaseImages : defaultImages;
  
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const templateLabels = sharedTemplateLabels || {};
  const roomAmenities = amenities || [];
  const pricing = inventoryPricing || {};

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

  // Build pricing display from inventory data
  const pricingRows: { label: string; weekday?: number; weekend?: number }[] = [];
  
  if (pricing.weekday_price != null || pricing.weekend_price != null) {
    pricingRows.push({
      label: templateLabels.priceLabel || '純住宿',
      weekday: pricing.weekday_price,
      weekend: pricing.weekend_price,
    });
  }
  if (pricing.weekday_2_meals != null || pricing.weekend_2_meals != null) {
    pricingRows.push({
      label: templateLabels.price2MealsLabel || '一泊二食',
      weekday: pricing.weekday_2_meals,
      weekend: pricing.weekend_2_meals,
    });
  }
  if (pricing.weekday_3_meals != null || pricing.weekend_3_meals != null) {
    pricingRows.push({
      label: templateLabels.price3MealsLabel || '一泊三食',
      weekday: pricing.weekday_3_meals,
      weekend: pricing.weekend_3_meals,
    });
  }

  // Room breakdown for exclusive packages
  const roomBreakdown: { label: string; count: number }[] = [];
  if (room.is_exclusive_package) {
    if (room.quad_room_count && room.quad_room_count > 0) roomBreakdown.push({ label: '四人房', count: room.quad_room_count });
    if (room.triple_room_count && room.triple_room_count > 0) roomBreakdown.push({ label: '三人房', count: room.triple_room_count });
    if (room.double_room_count && room.double_room_count > 0) roomBreakdown.push({ label: '雙人房', count: room.double_room_count });
  }

  return (
    <div>
    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-0 shadow-md h-full flex flex-col">
      <div className="relative overflow-hidden">
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {images.map((image, imgIndex) => (
              <CarouselItem key={imgIndex}>
                <div 
                  className="aspect-[4/3] cursor-pointer relative"
                  onClick={() => handleImageClick(imgIndex)}
                >
                  <OptimizedImage
                    src={image}
                    alt={`${room.name} - ${imgIndex + 1}`}
                    className="w-full h-full object-cover"
                    priority={isFirstRoom && imgIndex === 0}
                    width="800"
                    height="600"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                    <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 h-8 w-8 drop-shadow-lg" />
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {images.length > 1 && (
            <>
              <CarouselPrevious className="left-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CarouselNext className="right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" />
            </>
          )}
        </Carousel>
      </div>
      <CardContent className="p-3 md:p-4 lg:p-5 flex flex-col flex-grow">
        <div className="flex items-center gap-2 mb-2 md:mb-3">
          <h3 className="text-base md:text-lg lg:text-xl font-bold">{room.name}</h3>
          {room.name_en && (
            <span className="text-xs md:text-sm text-muted-foreground">{room.name_en}</span>
          )}
        </div>
        
        {room.description && <ExpandableDescription text={room.description} />}
        
        <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>最多 {room.capacity} 人</span>
          </div>
          {room.size_sqm > 0 && (
            <div className="flex items-center gap-1">
              <Home className="h-4 w-4" />
              <span>{room.size_sqm} 坪</span>
            </div>
          )}
        </div>

        {/* Room breakdown for exclusive packages */}
        {roomBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 md:mb-4">
            {roomBreakdown.map(item => (
              <span key={item.label} className="text-xs bg-secondary/50 text-secondary-foreground px-2 py-0.5 rounded-full">
                {item.label} ×{item.count}
              </span>
            ))}
          </div>
        )}
        
        {/* Amenities */}
        {roomAmenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 md:mb-4">
            {roomAmenities.slice(0, 6).map(amenity => (
              <span key={amenity} className="text-xs bg-secondary/50 text-secondary-foreground px-2 py-0.5 rounded-full">
                {amenity}
              </span>
            ))}
            {roomAmenities.length > 6 && (
              <span className="text-xs text-muted-foreground px-1">+{roomAmenities.length - 6}</span>
            )}
          </div>
        )}
        
        {/* Price display */}
        <div className="space-y-2 mb-4 md:mb-5 flex-grow">
          {pricingRows.length > 0 ? (
            <>
              {pricingRows.map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{row.label}</div>
                  <div className="flex items-center gap-2">
                    {row.weekday != null && row.weekend != null && row.weekday !== row.weekend ? (
                      <span className="text-sm font-bold text-primary">
                        NT$ {row.weekday.toLocaleString()} ~ {row.weekend.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-primary">
                        NT$ {(row.weekday ?? row.weekend ?? 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              {room.base_price > 0 ? (
                <span className="font-bold text-primary">NT$ {room.base_price.toLocaleString()} 起</span>
              ) : (
                <span>請洽詢價格</span>
              )}
            </div>
          )}
        </div>

        {/* Pricing legend */}
        {pricingRows.length > 0 && (
          <div className="mb-3">
            {(() => {
              const allPrices = pricingRows.flatMap(r => [r.weekday, r.weekend]).filter((p): p is number => p != null);
              const minPrice = Math.min(...allPrices);
              const maxPrice = Math.max(...allPrices);
              if (minPrice === maxPrice) return null;
              return (
                <div className="text-xs text-muted-foreground text-center">
                  價格範圍 NT$ {minPrice.toLocaleString()} ~ NT$ {maxPrice.toLocaleString()}
                </div>
              );
            })()}
          </div>
        )}
        <Link to={`/booking?roomId=${room.id}&step=dates`} className="mt-auto pt-4">
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 md:h-10 font-medium text-sm md:text-base">
            立即預訂
          </Button>
        </Link>
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

const RoomsSection = ({ roomTypes, sectionDescription, customTitle, customSubtitle }: RoomsSectionProps) => {
  const [sharedTemplateLabels, setSharedTemplateLabels] = useState<{ priceLabel?: string; price2MealsLabel?: string; price3MealsLabel?: string }>({});
  const [sharedHolidays, setSharedHolidays] = useState<Set<string>>(new Set());
  // Batch-fetched data for all rooms
  const [allAmenities, setAllAmenities] = useState<Record<string, string[]>>({});
  const [allInventoryPricing, setAllInventoryPricing] = useState<Record<string, InventoryPricing>>({});

  const accommodationId = roomTypes[0]?.accommodation_id;
  const roomTypeIds = roomTypes.map((r: any) => r.id);

  useEffect(() => {
    if (!accommodationId || roomTypeIds.length === 0) return;
    
    const fetchAllData = async () => {
      const today = new Date();
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(today.getDate() + 30);
      const todayStr = today.toISOString().split('T')[0];
      const futureStr = thirtyDaysLater.toISOString().split('T')[0];

      const [templatesResult, holidaysResult, amenitiesResult, inventoryResult] = await Promise.all([
        supabase
          .from('pricing_templates')
          .select('template_name, price, display_order')
          .eq('accommodation_id', accommodationId)
          .order('display_order', { ascending: true }),
        supabase
          .from('public_holidays')
          .select('holiday_date')
          .gte('holiday_date', todayStr)
          .lte('holiday_date', futureStr),
        // Batch fetch amenities for ALL room types
        supabase
          .from('room_amenities')
          .select('amenity_name, room_type_id')
          .in('room_type_id', roomTypeIds),
        // Batch fetch inventory pricing for ALL room types
        supabase
          .from('room_inventory_pricing')
          .select('price, price_2_meals, price_3_meals, date, room_type_id')
          .in('room_type_id', roomTypeIds)
          .gte('date', todayStr)
          .lte('date', futureStr)
          .eq('is_available', true)
          .order('date', { ascending: true }),
      ]);

      // Process template labels
      if (!templatesResult.error && templatesResult.data?.length) {
        const labels: { priceLabel?: string; price2MealsLabel?: string; price3MealsLabel?: string } = {};
        for (const t of templatesResult.data) {
          const name = t.template_name;
          if (name.includes('三食') && !labels.price3MealsLabel) labels.price3MealsLabel = name;
          else if (name.includes('二食') && !labels.price2MealsLabel) labels.price2MealsLabel = name;
          else if (!labels.priceLabel) labels.priceLabel = name;
        }
        if (!labels.priceLabel && templatesResult.data.length > 0) labels.priceLabel = templatesResult.data[0].template_name;
        setSharedTemplateLabels(labels);
      }

      // Process holidays
      if (holidaysResult.data) {
        setSharedHolidays(new Set(holidaysResult.data.map(h => h.holiday_date)));
      }

      // Process amenities - group by room_type_id
      if (!amenitiesResult.error && amenitiesResult.data) {
        const grouped: Record<string, string[]> = {};
        for (const item of amenitiesResult.data) {
          if (!grouped[item.room_type_id]) grouped[item.room_type_id] = [];
          grouped[item.room_type_id].push(item.amenity_name);
        }
        setAllAmenities(grouped);
      }

      // Process inventory pricing - group by room_type_id and compute min/max
      if (!inventoryResult.error && inventoryResult.data) {
        const grouped: Record<string, any[]> = {};
        for (const item of inventoryResult.data) {
          if (!grouped[item.room_type_id]) grouped[item.room_type_id] = [];
          grouped[item.room_type_id].push(item);
        }

        const pricingMap: Record<string, InventoryPricing> = {};
        for (const [roomId, data] of Object.entries(grouped)) {
          const allPrices = data.map(item => item.price).filter((p): p is number => p != null);
          const allPrices2Meals = data.map(item => item.price_2_meals).filter((p): p is number => p != null);
          const allPrices3Meals = data.map(item => item.price_3_meals).filter((p): p is number => p != null);
          
          const uniquePrices = [...new Set(allPrices)].sort((a, b) => a - b);
          const uniquePrices2Meals = [...new Set(allPrices2Meals)].sort((a, b) => a - b);
          const uniquePrices3Meals = [...new Set(allPrices3Meals)].sort((a, b) => a - b);
          
          pricingMap[roomId] = {
            weekday_price: uniquePrices.length > 0 ? uniquePrices[0] : undefined,
            weekend_price: uniquePrices.length > 1 ? uniquePrices[uniquePrices.length - 1] : (uniquePrices.length > 0 ? uniquePrices[0] : undefined),
            weekday_2_meals: uniquePrices2Meals.length > 0 ? uniquePrices2Meals[0] : undefined,
            weekday_3_meals: uniquePrices3Meals.length > 0 ? uniquePrices3Meals[0] : undefined,
            weekend_2_meals: uniquePrices2Meals.length > 1 ? uniquePrices2Meals[uniquePrices2Meals.length - 1] : (uniquePrices2Meals.length > 0 ? uniquePrices2Meals[0] : undefined),
            weekend_3_meals: uniquePrices3Meals.length > 1 ? uniquePrices3Meals[uniquePrices3Meals.length - 1] : (uniquePrices3Meals.length > 0 ? uniquePrices3Meals[0] : undefined),
          };
        }
        setAllInventoryPricing(pricingMap);
      }
    };

    fetchAllData();
  }, [accommodationId]);

  const displayRooms: RoomType[] = roomTypes.map(room => ({
    id: room.id,
    name: room.name,
    name_en: room.name_en || '',
    description: room.description || '',
    capacity: room.capacity,
    size_sqm: room.size_sqm || 0,
    base_price: room.base_price,
    accommodation_id: room.accommodation_id,
    room_count: room.room_count,
    quad_room_count: room.quad_room_count,
    triple_room_count: room.triple_room_count,
    double_room_count: room.double_room_count,
    is_exclusive_package: room.is_exclusive_package || false,
    room_photos: room.room_photos || [],
  }));

  if (!displayRooms || displayRooms.length === 0) {
    return null;
  }

  const shouldUseCarousel = displayRooms.length > 4;

  const renderRoomCard = (room: any, index: number) => (
    <RoomCard
      key={room.id}
      room={room}
      isFirstRoom={index === 0}
      sharedTemplateLabels={sharedTemplateLabels}
      sharedHolidays={sharedHolidays}
      amenities={allAmenities[room.id]}
      inventoryPricing={allInventoryPricing[room.id]}
    />
  );

  return (
    <section id="rooms" className="py-12 md:py-16 lg:py-20 bg-secondary/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">{customTitle || '房型導覽'}</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">
            {customSubtitle || sectionDescription || '精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗'}
          </p>

          {/* 手機版：永遠使用輪播並顯示箭頭 */}
          <div className="md:hidden">
            <Carousel
              opts={{
                align: "start",
                loop: false,
              }}
              className="w-full"
            >
              <CarouselContent className="-ml-4">
                {displayRooms.map((room, index) => (
                  <CarouselItem key={room.id} className="pl-4 basis-full">
                    {renderRoomCard(room, index)}
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="flex justify-center items-center gap-4 mt-6">
                <CarouselPrevious className="static translate-y-0 h-10 w-10 rounded-full border-2 border-primary bg-background hover:bg-primary hover:text-primary-foreground" />
                <CarouselNext className="static translate-y-0 h-10 w-10 rounded-full border-2 border-primary bg-background hover:bg-primary hover:text-primary-foreground" />
              </div>
            </Carousel>
          </div>

          {/* 平板/桌面版 */}
          <div className="hidden md:block">
            {shouldUseCarousel ? (
              <Carousel
                opts={{
                  align: "start",
                  loop: false,
                }}
                className="w-full"
              >
                <CarouselContent className="-ml-4">
                  {displayRooms.map((room, index) => (
                    <CarouselItem key={room.id} className="pl-4 basis-1/2 lg:basis-1/4">
                      {renderRoomCard(room, index)}
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="-left-4 lg:-left-6" />
                <CarouselNext className="-right-4 lg:-right-6" />
              </Carousel>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 lg:gap-6 items-stretch">
                {displayRooms.map((room, index) => renderRoomCard(room, index))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomsSection;
