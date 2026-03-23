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
        className={`text-xs md:text-sm text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}
      >
        {text}
      </p>
      {isClamped && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:underline mt-1"
        >
          {expanded ? '收起' : '查看更多'}
        </button>
      )}
    </div>
  );
};

const RoomCard = ({ room, isFirstRoom = false, sharedTemplateLabels, sharedHolidays }: { 
  room: RoomType & { room_photos?: { photo_url: string; display_order: number }[] }, 
  isFirstRoom?: boolean,
  sharedTemplateLabels?: { priceLabel?: string; price2MealsLabel?: string; price3MealsLabel?: string },
  sharedHolidays?: Set<string>
}) => {
  // 優先使用資料庫照片，沒有則使用預設照片
  const databaseImages = room.room_photos?.map(p => p.photo_url) || [];
  const defaultImages = roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
  const images = databaseImages.length > 0 ? databaseImages : defaultImages;
  
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [amenities, setAmenities] = useState<string[]>([]);
  const templateLabels = sharedTemplateLabels || {};
  const [inventoryPricing, setInventoryPricing] = useState<{
    weekday_price?: number;
    weekend_price?: number;
    weekday_2_meals?: number;
    weekday_3_meals?: number;
    weekend_2_meals?: number;
    weekend_3_meals?: number;
  }>({});

  useEffect(() => {
    loadAmenities();
    loadInventoryPricing();
  }, [room.id]);

  const loadAmenities = async () => {
    try {
      const { data, error } = await supabase
        .from('room_amenities')
        .select('amenity_name')
        .eq('room_type_id', room.id)
        .limit(8);

      if (error) throw error;
      setAmenities(data?.map(item => item.amenity_name) || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading amenities:', error);
      }
    }
  };

  const loadInventoryPricing = async () => {
    try {
      const today = new Date();
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(today.getDate() + 30);

      const { data, error } = await supabase
        .from('room_inventory_pricing')
        .select('price, price_2_meals, price_3_meals, date')
        .eq('room_type_id', room.id)
        .gte('date', today.toISOString().split('T')[0])
        .lte('date', thirtyDaysLater.toISOString().split('T')[0])
        .eq('is_available', true)
        .order('date', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const allPrices = data.map(item => item.price).filter((p): p is number => p != null);
        const allPrices2Meals = data.map(item => item.price_2_meals).filter((p): p is number => p != null);
        const allPrices3Meals = data.map(item => item.price_3_meals).filter((p): p is number => p != null);
        
        const uniquePrices = [...new Set(allPrices)].sort((a, b) => a - b);
        const uniquePrices2Meals = [...new Set(allPrices2Meals)].sort((a, b) => a - b);
        const uniquePrices3Meals = [...new Set(allPrices3Meals)].sort((a, b) => a - b);
        
        setInventoryPricing({
          weekday_price: uniquePrices.length > 0 ? uniquePrices[0] : undefined,
          weekend_price: uniquePrices.length > 1 ? uniquePrices[uniquePrices.length - 1] : (uniquePrices.length > 0 ? uniquePrices[0] : undefined),
          weekday_2_meals: uniquePrices2Meals.length > 0 ? uniquePrices2Meals[0] : undefined,
          weekday_3_meals: uniquePrices3Meals.length > 0 ? uniquePrices3Meals[0] : undefined,
          weekend_2_meals: uniquePrices2Meals.length > 1 ? uniquePrices2Meals[uniquePrices2Meals.length - 1] : (uniquePrices2Meals.length > 0 ? uniquePrices2Meals[0] : undefined),
          weekend_3_meals: uniquePrices3Meals.length > 1 ? uniquePrices3Meals[uniquePrices3Meals.length - 1] : (uniquePrices3Meals.length > 0 ? uniquePrices3Meals[0] : undefined),
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading inventory pricing:', error);
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
          </Carousel>
        </div>
      <CardContent className="p-4 md:p-5 lg:p-6 flex flex-col flex-1 min-h-0">
        <h3 className="text-lg md:text-xl lg:text-2xl font-bold mb-2 text-foreground">{room.name}</h3>
        
        <div className="space-y-2 md:space-y-3 mb-4 md:mb-5">
          <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="font-medium">{room.capacity} 人</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span className="font-medium">{room.size_sqm} 坪</span>
            </div>
          </div>
        </div>
        
        {room.description && (
          <ExpandableDescription text={room.description} />
        )}

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
        
        <div className="pt-3 border-t mt-3 flex flex-col flex-1">
          <div className="space-y-2 md:space-y-3 flex-1">
            {/* 一般房型（雙人房、四人房）：顯示一泊一食 */}
            {!room.is_exclusive_package && (
              <>
                {inventoryPricing.weekday_price && inventoryPricing.weekend_price && inventoryPricing.weekday_price === inventoryPricing.weekend_price ? (
                  // 平日假日價格相同，合併顯示
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">平日/假日</p>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        {templateLabels.priceLabel && (
                          <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.priceLabel}</span>
                        )}
                        <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekday_price.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  // 平日假日價格不同，分開顯示
                  <>
                    {inventoryPricing.weekday_price && (
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">平日</p>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            {templateLabels.priceLabel && (
                              <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.priceLabel}</span>
                            )}
                            <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekday_price.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {inventoryPricing.weekend_price && (
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">假日</p>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            {templateLabels.priceLabel && (
                              <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.priceLabel}</span>
                            )}
                            <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekend_price.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {/* 包區房型（12~18人包區）：顯示一泊二食，18人包區不顯示一泊三食 */}
            {room.is_exclusive_package && (() => {
              // 判斷二食和三食的平日假日價格是否相同
              const is2MealsSamePrice = inventoryPricing.weekday_2_meals && inventoryPricing.weekend_2_meals && inventoryPricing.weekday_2_meals === inventoryPricing.weekend_2_meals;
              const is3MealsSamePrice = inventoryPricing.weekday_3_meals && inventoryPricing.weekend_3_meals && inventoryPricing.weekday_3_meals === inventoryPricing.weekend_3_meals;
              const show3Meals = room.capacity !== 18;
              
              // 如果兩者都相同或只有一種且相同，則合併顯示
              const allSamePrice = is2MealsSamePrice && (!show3Meals || !inventoryPricing.weekday_3_meals || is3MealsSamePrice);
              
              if (allSamePrice) {
                return (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">平日/假日</p>
                    <div className="space-y-1">
                      {inventoryPricing.weekday_2_meals && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.price2MealsLabel || '一泊二食'}</span>
                          <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekday_2_meals.toLocaleString()}</span>
                        </div>
                      )}
                      {inventoryPricing.weekday_3_meals && show3Meals && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.price3MealsLabel || '一泊三食'}</span>
                          <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekday_3_meals.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              
              return (
                <>
                  {(inventoryPricing.weekday_2_meals || (inventoryPricing.weekday_3_meals && show3Meals)) && (
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">平日</p>
                      <div className="space-y-1">
                        {inventoryPricing.weekday_2_meals && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.price2MealsLabel || '一泊二食'}</span>
                            <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekday_2_meals.toLocaleString()}</span>
                          </div>
                        )}
                        {inventoryPricing.weekday_3_meals && show3Meals && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.price3MealsLabel || '一泊三食'}</span>
                            <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekday_3_meals.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {(inventoryPricing.weekend_2_meals || (inventoryPricing.weekend_3_meals && show3Meals)) && (
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-1.5 md:mb-2">假日</p>
                      <div className="space-y-1">
                        {inventoryPricing.weekend_2_meals && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.price2MealsLabel || '一泊二食'}</span>
                            <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekend_2_meals.toLocaleString()}</span>
                          </div>
                        )}
                        {inventoryPricing.weekend_3_meals && show3Meals && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm text-muted-foreground">{templateLabels.price3MealsLabel || '一泊三食'}</span>
                            <span className="font-semibold text-lg md:text-xl lg:text-xl text-primary">NT$ {inventoryPricing.weekend_3_meals.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <Link to={`/booking?roomId=${room.id}&step=dates`} className="mt-auto pt-4">
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 md:h-10 font-medium text-sm md:text-base">
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

const RoomsSection = ({ roomTypes, sectionDescription, customTitle, customSubtitle }: RoomsSectionProps) => {
  // Shared data: fetch pricing_templates and public_holidays once for all room cards
  const [sharedTemplateLabels, setSharedTemplateLabels] = useState<{ priceLabel?: string; price2MealsLabel?: string; price3MealsLabel?: string }>({});
  const [sharedHolidays, setSharedHolidays] = useState<Set<string>>(new Set());

  const accommodationId = roomTypes[0]?.accommodation_id;

  useEffect(() => {
    if (!accommodationId) return;
    
    const fetchSharedData = async () => {
      const today = new Date();
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(today.getDate() + 30);

      const [templatesResult, holidaysResult] = await Promise.all([
        supabase
          .from('pricing_templates')
          .select('template_name, price, display_order')
          .eq('accommodation_id', accommodationId)
          .order('display_order', { ascending: true }),
        supabase
          .from('public_holidays')
          .select('holiday_date')
          .gte('holiday_date', today.toISOString().split('T')[0])
          .lte('holiday_date', thirtyDaysLater.toISOString().split('T')[0])
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
    };

    fetchSharedData();
  }, [accommodationId]);

  // 將資料庫的房型資料轉換為顯示格式，保留照片資料
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

  // 沒有資料時直接隱藏
  if (!displayRooms || displayRooms.length === 0) {
    return null;
  }

  const shouldUseCarousel = displayRooms.length > 4;

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
                    <RoomCard room={room} isFirstRoom={index === 0} sharedTemplateLabels={sharedTemplateLabels} sharedHolidays={sharedHolidays} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              {/* 手機版左右箭頭 - 置於卡片下方 */}
              <div className="flex justify-center items-center gap-4 mt-6">
                <CarouselPrevious className="static translate-y-0 h-10 w-10 rounded-full border-2 border-primary bg-background hover:bg-primary hover:text-primary-foreground" />
                <CarouselNext className="static translate-y-0 h-10 w-10 rounded-full border-2 border-primary bg-background hover:bg-primary hover:text-primary-foreground" />
              </div>
            </Carousel>
          </div>

          {/* 平板/桌面版：維持原有邏輯 */}
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
                      <RoomCard room={room} isFirstRoom={index === 0} sharedTemplateLabels={sharedTemplateLabels} sharedHolidays={sharedHolidays} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="-left-4 lg:-left-6" />
                <CarouselNext className="-right-4 lg:-right-6" />
              </Carousel>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 lg:gap-6 items-stretch">
                {displayRooms.map((room, index) => (
                  <RoomCard key={room.id} room={room} isFirstRoom={index === 0} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomsSection;
