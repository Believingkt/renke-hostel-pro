import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Calendar as CalendarIcon, Users, Search } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isSaturday } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { OptimizedImage } from "@/components/OptimizedImage";
import { generateBlurDataURLs } from "@/utils/imageBlurHelper";
import heroSlide1 from "@/assets/hero-slide-1.jpg";
import heroSlide2 from "@/assets/hero-slide-2.jpg";
import heroSlide3 from "@/assets/hero-slide-3.jpg";

// 預載入首張圖片
if (typeof window !== 'undefined') {
  const img = new Image();
  img.src = heroSlide1;
}

interface HeroSectionProps {
  accommodationName?: string;
  heroMainTitle?: string;
  heroSubtitle?: string;
  heroDescription?: string;
}

interface HeroPhoto {
  id: string;
  photo_url: string;
  display_order: number;
  title?: string | null;
  subtitle?: string | null;
  cta_text?: string | null;
  cta_link?: string | null;
}

const defaultHeroImages = [heroSlide1, heroSlide2, heroSlide3];

const HeroSection = ({ 
  accommodationName = "森山寫照",
  heroMainTitle = "山間的寧靜時光",
  heroSubtitle = "體驗日式美學與自然的完美融合",
  heroDescription = ""
}: HeroSectionProps) => {
  const { checkInDate, setCheckInDate, checkOutDate, setCheckOutDate, guests, setGuests, currentAccommodationId } = useAccommodation();
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set([0]));
  const [isCheckInDateOpen, setIsCheckInDateOpen] = useState(false);
  const [isCheckOutDateOpen, setIsCheckOutDateOpen] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<Date[]>([]);
  const [heroPhotos, setHeroPhotos] = useState<HeroPhoto[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const [blurDataURLs, setBlurDataURLs] = useState<Map<string, string>>(new Map());

  // 使用數據庫圖片或默認圖片，優先使用數據庫內容
  const slides = heroPhotos.length > 0 
    ? heroPhotos
    : defaultHeroImages.map((img, index) => ({
        id: `default-${index}`,
        photo_url: img,
        display_order: index + 1,
        title: null,
        subtitle: null,
        cta_text: null,
        cta_link: null
      }));

  // 載入首頁輪播圖
  useEffect(() => {
    const fetchHeroPhotos = async () => {
      // 獲取第一個 accommodation ID（公開前台）
      const { data: accommodations } = await supabase
        .from('accommodation_info')
        .select('id')
        .limit(1)
        .maybeSingle();

      const accommodationId = currentAccommodationId || accommodations?.id;

      if (!accommodationId) {
        setIsLoadingPhotos(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('accommodation_photos')
          .select('id, photo_url, display_order, title, subtitle, cta_text, cta_link')
          .eq('accommodation_id', accommodationId)
          .eq('photo_type', 'hero')
          .order('display_order');

        if (error) throw error;

        if (data && data.length > 0) {
          setHeroPhotos(data);
        }
      } catch (error) {
        console.error('Error fetching hero photos:', error);
      } finally {
        setIsLoadingPhotos(false);
      }
    };

    fetchHeroPhotos();
  }, [currentAccommodationId]);

  // 載入國定假日
  useEffect(() => {
    const loadPublicHolidays = async () => {
      const { data: accommodations } = await supabase
        .from('accommodation_info')
        .select('id')
        .limit(1)
        .single();

      if (accommodations?.id) {
        const { data: holidays } = await supabase
          .from('public_holidays')
          .select('holiday_date')
          .eq('accommodation_id', accommodations.id);

        if (holidays) {
          setPublicHolidays(holidays.map(h => new Date(h.holiday_date)));
        }
      }
    };

    loadPublicHolidays();
  }, []);

  // 生成圖片模糊預覽
  useEffect(() => {
    if (slides.length === 0) return;

    const generateBlurs = async () => {
      try {
        const imageUrls = slides.map(slide => slide.photo_url);
        const blurs = await generateBlurDataURLs(imageUrls);
        setBlurDataURLs(blurs);
      } catch (error) {
        console.error('生成模糊預覽失敗:', error);
      }
    };

    // 延遲生成，避免阻塞主線程
    const timer = setTimeout(generateBlurs, 100);
    return () => clearTimeout(timer);
  }, [slides]);

  // 檢查是否為假日（星期六或國定假日）
  const isHoliday = (date: Date) => {
    if (isSaturday(date)) return true;
    return publicHolidays.some(holiday => 
      holiday.getFullYear() === date.getFullYear() &&
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
    );
  };

  useEffect(() => {
    if (!carouselApi) return;

    setCurrent(carouselApi.selectedScrollSnap());

    carouselApi.on("select", () => {
      const index = carouselApi.selectedScrollSnap();
      setCurrent(index);
      
      // 延遲預載下一張圖片
      const nextIndex = (index + 1) % slides.length;
      setTimeout(() => {
        setLoadedImages(prev => new Set([...prev, index, nextIndex]));
      }, 500);
    });
    
    // 延遲預載第二張圖片
    const timer = setTimeout(() => {
      setLoadedImages(prev => new Set([...prev, 1]));
    }, 2000);
    
    // 監聽圖片查看器事件，停止/恢復輪播
    const handleViewerOpened = () => {
      const plugins = (carouselApi as any).plugins?.();
      if (plugins?.autoplay) {
        plugins.autoplay.stop();
      }
    };
    
    const handleViewerClosed = () => {
      const plugins = (carouselApi as any).plugins?.();
      if (plugins?.autoplay) {
        plugins.autoplay.play();
      }
    };
    
    window.addEventListener('viewer-opened', handleViewerOpened);
    window.addEventListener('viewer-closed', handleViewerClosed);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('viewer-opened', handleViewerOpened);
      window.removeEventListener('viewer-closed', handleViewerClosed);
    };
  }, [carouselApi]);

  return (
    <section id="home" className="pt-16 relative">
      <div className="relative">
        <Carousel
          opts={{ 
            loop: true,
            duration: 30,
            align: "start",
          }}
          plugins={[Autoplay({ delay: 8000, stopOnInteraction: true })]}
          className="w-full"
          setApi={setCarouselApi}
        >
          <CarouselContent className="-ml-0">
            {slides.map((slide, index) => (
              <CarouselItem key={slide.id} className="pl-0">
                <div className="relative h-[500px] md:h-[700px] w-full bg-gradient-to-br from-muted to-muted/50">
                  <OptimizedImage
                    src={slide.photo_url}
                    alt={slide.title || `${accommodationName} - 首頁輪播圖 ${index + 1}`}
                    className="w-full h-full object-cover brightness-110"
                    priority={index === 0}
                    width="1920"
                    height="1080"
                    sizes="100vw"
                    blurDataURL={blurDataURLs.get(slide.photo_url)}
                    responsive={true}
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center transition-all duration-700">
                    <div className="text-center text-white space-y-2 md:space-y-4 max-w-4xl px-4 pb-32 md:pb-56">
                      <h1 className="text-3xl md:text-7xl font-bold animate-fade-in drop-shadow-lg">
                        {slide.title || accommodationName}
                      </h1>
                      {slide.subtitle && (
                        <p className="text-lg md:text-3xl animate-fade-in drop-shadow-lg" style={{ animationDelay: "0.2s" }}>
                          {slide.subtitle}
                        </p>
                      )}
                      {!slide.subtitle && heroMainTitle && (
                        <>
                          <p className="text-lg md:text-3xl animate-fade-in drop-shadow-lg" style={{ animationDelay: "0.2s" }}>
                            {heroMainTitle}
                          </p>
                          {heroSubtitle && (
                            <p className="text-base md:text-xl animate-fade-in drop-shadow-lg" style={{ animationDelay: "0.4s" }}>
                              {heroSubtitle}
                            </p>
                          )}
                          {heroDescription && (
                            <p className="text-sm md:text-base animate-fade-in drop-shadow-lg" style={{ animationDelay: "0.6s" }}>
                              {heroDescription}
                            </p>
                          )}
                        </>
                      )}
                      {slide.cta_text && slide.cta_link && (
                        <div className="pt-4 animate-fade-in" style={{ animationDelay: "0.6s" }}>
                          <Button
                            asChild
                            size="lg"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all"
                          >
                            {slide.cta_link.startsWith('#') ? (
                              <a href={slide.cta_link} className="inline-flex items-center gap-2">
                                {slide.cta_text}
                              </a>
                            ) : (
                              <Link to={slide.cta_link} className="inline-flex items-center gap-2">
                                {slide.cta_text}
                              </Link>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* 輪播指示器 */}
          <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-2 px-2 py-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => carouselApi?.scrollTo(index)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-500 ease-out",
                    current === index 
                      ? "w-8 bg-white" 
                      : "w-2 bg-white/60 hover:bg-white/80 hover:w-3"
                  )}
                  aria-label={`前往第 ${index + 1} 張輪播圖`}
                />
              ))}
            </div>
          </div>
        </Carousel>

        {/* 搜尋卡片 - 手机版垂直居中，桌面版在底部 */}
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 z-30 
                        max-md:top-1/2 max-md:-translate-y-1/2
                        md:bottom-[140px] md:top-auto md:translate-y-0">
          <Card className="shadow-2xl bg-white/95 backdrop-blur-sm border-0 rounded-xl md:rounded-2xl">
            <CardContent className="p-4 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
                {/* 入住日期 */}
                <Popover open={isCheckInDateOpen} onOpenChange={setIsCheckInDateOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center h-12 md:h-16 px-3 md:px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors text-left w-full">
                      <CalendarIcon className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">入住日期</span>
                        <span className="text-sm text-foreground">
                          {checkInDate ? format(checkInDate, "yyyy/MM/dd", { locale: zhTW }) : "選擇日期"}
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3">
                      <Calendar
                        mode="single"
                        selected={checkInDate}
                        onSelect={(date) => {
                          setCheckInDate(date);
                          if (date) {
                            setIsCheckInDateOpen(false);
                            // 選完入住日期後自動打開退房日期選擇器
                            setTimeout(() => {
                              setIsCheckOutDateOpen(true);
                            }, 100);
                          }
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        modifiers={{
                          holiday: (date) => isHoliday(date)
                        }}
                        modifiersClassNames={{
                          holiday: "bg-primary/10 text-primary font-semibold rounded-md"
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary/10 rounded-md border border-primary/20"></div>
                          <span className="text-muted-foreground">假日定價</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-background rounded-md border border-border"></div>
                          <span className="text-muted-foreground">平日定價</span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* 退房日期 */}
                <Popover open={isCheckOutDateOpen} onOpenChange={setIsCheckOutDateOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center h-12 md:h-16 px-3 md:px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors text-left w-full">
                      <CalendarIcon className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">退房日期</span>
                        <span className="text-sm text-foreground">
                          {checkOutDate ? format(checkOutDate, "yyyy/MM/dd", { locale: zhTW }) : "選擇日期"}
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3">
                      <Calendar
                        mode="single"
                        selected={checkOutDate}
                        onSelect={(date) => {
                          setCheckOutDate(date);
                          // 選完退房日期後自動關閉
                          if (date) {
                            setIsCheckOutDateOpen(false);
                          }
                        }}
                        disabled={(date) => {
                          const today = new Date(new Date().setHours(0, 0, 0, 0));
                          if (date < today) return true;
                          if (checkInDate && date <= checkInDate) return true;
                          return false;
                        }}
                        modifiers={{
                          holiday: (date) => isHoliday(date)
                        }}
                        modifiersClassNames={{
                          holiday: "bg-primary/10 text-primary font-semibold rounded-md"
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary/10 rounded-md border border-primary/20"></div>
                          <span className="text-muted-foreground">假日定價</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-background rounded-md border border-border"></div>
                          <span className="text-muted-foreground">平日定價</span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* 住宿人數 */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center h-16 px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors text-left w-full">
                      <Users className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">住宿人數</span>
                        <span className="text-sm text-foreground">
                          {guests.adults}位大人{guests.children > 0 ? ` · ${guests.children}位兒童` : ""} · 1間客房
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="start">
                    <div className="space-y-4">
                      {/* 大人 */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-base">大人</div>
                          <div className="text-sm text-muted-foreground">18歲（含）或以上</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setGuests({ ...guests, adults: Math.max(1, guests.adults - 1) })}
                            className="w-10 h-10 rounded-lg border-2 border-primary text-primary hover:bg-primary/10 transition-colors flex items-center justify-center font-medium"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">{guests.adults}</span>
                          <button
                            onClick={() => setGuests({ ...guests, adults: Math.min(18, guests.adults + 1) })}
                            className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* 兒童 */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div>
                          <div className="font-medium text-base">兒童</div>
                          <div className="text-sm text-muted-foreground">0-17歲</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setGuests({ ...guests, children: Math.max(0, guests.children - 1) })}
                            className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">{guests.children}</span>
                          <button
                            onClick={() => setGuests({ ...guests, children: Math.min(10, guests.children + 1) })}
                            className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* 搜尋按鈕 */}
              <Link to="/booking" className="block">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm md:text-base h-11 md:h-14 font-medium rounded-lg shadow-md hover:shadow-lg transition-all">
                  <Search className="mr-2 h-5 w-5" />
                  搜尋空房
                </Button>
              </Link>
          </CardContent>
        </Card>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
