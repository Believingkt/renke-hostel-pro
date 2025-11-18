import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
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
import { preloadImageWithLink } from "@/utils/imagePreloader";
import heroSlide1 from "@/assets/hero-slide-1.jpg";
import heroSlide2 from "@/assets/hero-slide-2.jpg";
import heroSlide3 from "@/assets/hero-slide-3.jpg";

// 預載入首張圖片 - 使用 link preload 提高優先級
if (typeof window !== 'undefined') {
  preloadImageWithLink(heroSlide1);
}

interface HeroSectionProps {
  accommodationName?: string;
  heroMainTitle?: string;
  heroSubtitle?: string;
  heroDescription?: string;
  heroOverlayOpacity?: number;
  heroAutoplayDelay?: number;
}

interface HeroPhoto {
  id: string;
  photo_url: string;
  display_order: number;
  title?: string | null;
  subtitle?: string | null;
  secondary_subtitle?: string | null;
  cta_text?: string | null;
  cta_link?: string | null;
  text_color?: string | null;
  text_size?: string | null;
  title_size?: string | null;
  subtitle_size?: string | null;
  secondary_subtitle_size?: string | null;
  text_position_x?: string | null;
  text_position_y?: string | null;
  overlay_opacity?: number | null;
  autoplay_delay?: number | null;
}

const defaultHeroImages = [heroSlide1, heroSlide2, heroSlide3];

const HeroSection = ({ 
  accommodationName = "",
  heroMainTitle = "",
  heroSubtitle = "",
  heroDescription = "",
  heroOverlayOpacity = 40,
  heroAutoplayDelay = 8
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
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [showContent, setShowContent] = useState(false);

  // 使用數據庫圖片或默認圖片，優先使用數據庫內容
  const slides = heroPhotos.length > 0 
    ? heroPhotos
    : defaultHeroImages.map((img, index) => ({
        id: `default-${index}`,
        photo_url: img,
        display_order: index + 1,
        title: heroMainTitle || null,
        subtitle: heroSubtitle || null,
        secondary_subtitle: heroDescription || null,
        cta_text: null,
        cta_link: null,
        text_color: null,
        text_size: null,
        title_size: 'medium', // 確保默認值與預期一致
        subtitle_size: null,
        secondary_subtitle_size: null,
        text_position_x: null,
        text_position_y: null,
        overlay_opacity: null,
        autoplay_delay: null
      }));

  // 載入首頁輪播圖 - 優化載入策略
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
          .select(`
            id, 
            photo_url, 
            display_order, 
            title, 
            subtitle, 
            secondary_subtitle,
            cta_text, 
            cta_link,
            text_color,
            text_size,
            title_size,
            subtitle_size,
            secondary_subtitle_size,
            text_position_x,
            text_position_y,
            overlay_opacity,
            autoplay_delay
          `)
          .eq('accommodation_id', accommodationId)
          .eq('photo_type', 'hero')
          .order('display_order')
          .limit(5); // 限制只載入前5張圖片

        if (error) throw error;

        if (data && data.length > 0) {
          // 確保所有圖片都有默認的 title_size
          const photosWithDefaults = data.map(photo => ({
            ...photo,
            title_size: photo.title_size || 'medium'
          }));
          setHeroPhotos(photosWithDefaults);
        }
      } catch (error) {
        console.error('Error fetching hero photos:', error);
      } finally {
        setIsLoadingPhotos(false);
        // 延遲顯示內容，確保數據完全載入
        setTimeout(() => setShowContent(true), 100);
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

  // 生成圖片模糊預覽 - 延遲執行以避免阻塞關鍵內容
  useEffect(() => {
    if (slides.length === 0) return;

    const generateBlurs = async () => {
      try {
        // 只為前3張圖片生成模糊預覽
        const imageUrls = slides.slice(0, 3).map(slide => slide.photo_url);
        const blurs = await generateBlurDataURLs(imageUrls);
        setBlurDataURLs(blurs);
      } catch (error) {
        console.error('生成模糊預覽失敗:', error);
      }
    };

    // 延遲生成，優先載入關鍵內容
    const timer = setTimeout(generateBlurs, 500);
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
    if (!carouselApi || !autoplayEnabled) return;

    setCurrent(carouselApi.selectedScrollSnap());

    carouselApi.on("select", () => {
      const index = carouselApi.selectedScrollSnap();
      setCurrent(index);
      
      // 智能預載入下一張和上一張圖片
      const nextIndex = (index + 1) % slides.length;
      const prevIndex = (index - 1 + slides.length) % slides.length;
      
      // 立即預載入下一張圖片
      if (slides[nextIndex]) {
        const img = new Image();
        img.src = slides[nextIndex].photo_url;
      }
      
      // 延遲預載入上一張圖片
      setTimeout(() => {
        if (slides[prevIndex]) {
          const img = new Image();
          img.src = slides[prevIndex].photo_url;
        }
      }, 500);
      
      setLoadedImages(prev => new Set([...prev, index, nextIndex, prevIndex]));
    });
    
    // 首次載入時預載入第二和第三張圖片
    const preloadTimer = setTimeout(() => {
      setLoadedImages(prev => new Set([...prev, 1, 2]));
      
      // 預載入第二張圖片
      if (slides[1]) {
        const img = new Image();
        img.src = slides[1].photo_url;
      }
      
      // 延遲預載入第三張圖片
      setTimeout(() => {
        if (slides[2]) {
          const img = new Image();
          img.src = slides[2].photo_url;
        }
      }, 1000);
    }, 1500);
    
    // 監聽圖片查看器事件，停止/恢復輪播
    const handleViewerOpened = () => {
      setAutoplayEnabled(false);
    };
    
    const handleViewerClosed = () => {
      setAutoplayEnabled(true);
    };
    
    window.addEventListener('viewer-opened', handleViewerOpened);
    window.addEventListener('viewer-closed', handleViewerClosed);
    
    return () => {
      clearTimeout(preloadTimer);
      window.removeEventListener('viewer-opened', handleViewerOpened);
      window.removeEventListener('viewer-closed', handleViewerClosed);
    };
  }, [carouselApi, slides.length, autoplayEnabled]);

  // 自訂自動播放功能，使用全局延遲時間
  useEffect(() => {
    if (!carouselApi || !autoplayEnabled || slides.length === 0) return;

    const delay = heroAutoplayDelay * 1000; // 使用全局設定，轉換為毫秒

    const timer = setTimeout(() => {
      carouselApi.scrollNext();
    }, delay);

    return () => clearTimeout(timer);
  }, [carouselApi, current, slides, autoplayEnabled, heroAutoplayDelay]);

  return (
    <section id="home" className="pt-16 relative">
      {!showContent ? (
        <div className="h-screen bg-muted animate-pulse" />
      ) : (
        <div className="relative">
        <Carousel
          opts={{ 
            loop: true,
            duration: 40, // 增加切換持續時間以實現更平滑的過渡
            align: "start",
          }}
          className="w-full"
          setApi={setCarouselApi}
        >
          <CarouselContent className="-ml-0">
            {slides.map((slide, index) => (
              <CarouselItem key={slide.id} className="pl-0">
                <div className="relative h-[500px] md:h-[700px] w-full bg-gradient-to-br from-muted to-muted/50 transition-opacity duration-700">
                  <OptimizedImage
                    src={slide.photo_url}
                    alt={slide.title || `${accommodationName} - 首頁輪播圖 ${index + 1}`}
                    className="w-full h-full object-cover brightness-110 transition-transform duration-700 ease-out"
                    priority={index === 0}
                    width="1920"
                    height="1080"
                    sizes="100vw"
                    blurDataURL={blurDataURLs.get(slide.photo_url)}
                    responsive={true}
                    autoSrcSet={true}
                    imageType="hero"
                  />
                  <div 
                    className="absolute inset-0 transition-all duration-700"
                    style={{ 
                      backgroundColor: `rgba(0, 0, 0, ${heroOverlayOpacity / 100})`
                    }}
                  />
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

        {/* 固定的標題覆蓋層 - 不隨圖片移動 */}
        {slides.length > 0 && slides[current] && (
          <div 
            key={current}
            className={`
              absolute left-1/2 -translate-x-1/2 pointer-events-none z-10
              w-full max-w-4xl px-4 pb-32 md:pb-56
              text-center
              ${
                slides[current].text_position_y === 'top' ? 'flex items-start justify-center pt-32 top-0' :
                slides[current].text_position_y === 'bottom' ? 'flex items-end justify-center pb-32 bottom-0' :
                'flex items-center justify-center top-1/2 -translate-y-1/2'
              }
            `}
            style={{
              color: slides[current].text_color === 'black' ? '#000' : slides[current].text_color === 'primary' ? 'hsl(var(--primary))' : '#fff'
            }}
          >
            <div className="w-full space-y-3 md:space-y-4">
              <h1 
                className={`
                  font-bold animate-fade-in drop-shadow-lg
                  ${(slides[current].title_size || 'medium') === 'small' ? 'text-2xl md:text-5xl' : 
                    (slides[current].title_size || 'medium') === 'large' ? 'text-4xl md:text-8xl' : 
                    'text-3xl md:text-[80px]'}
                `}
              >
                {slides[current].title || accommodationName}
              </h1>
              {slides[current].subtitle && (
                <p 
                  className={`
                    animate-fade-in drop-shadow-lg mt-3 md:mt-4
                    ${(slides[current].subtitle_size || 'medium') === 'small' ? 'text-base md:text-2xl' : 
                      (slides[current].subtitle_size || 'medium') === 'large' ? 'text-xl md:text-4xl' : 
                      'text-lg md:text-3xl'}
                  `}
                  style={{ animationDelay: "0.2s" }}
                >
                  {slides[current].subtitle}
                </p>
              )}
              {slides[current].secondary_subtitle && (
                <p 
                  className={`
                    animate-fade-in drop-shadow-lg opacity-90 mt-2 md:mt-3
                    ${(slides[current].secondary_subtitle_size || 'small') === 'small' ? 'text-sm md:text-xl' : 
                      (slides[current].secondary_subtitle_size || 'small') === 'large' ? 'text-lg md:text-3xl' : 
                      'text-base md:text-2xl'}
                  `}
                  style={{ animationDelay: "0.4s" }}
                >
                  {slides[current].secondary_subtitle}
                </p>
              )}
              {!slides[current].subtitle && heroMainTitle && (
                <>
                  <p 
                    className={`
                      animate-fade-in drop-shadow-lg mt-3 md:mt-4
                      ${slides[current].text_size === 'small' ? 'text-base md:text-2xl' : 
                        slides[current].text_size === 'large' ? 'text-xl md:text-4xl' : 
                        'text-lg md:text-3xl'}
                    `}
                    style={{ animationDelay: "0.2s" }}
                  >
                    {heroMainTitle}
                  </p>
                  {heroSubtitle && (
                    <p 
                      className={`
                        animate-fade-in drop-shadow-lg mt-2 md:mt-3
                        ${slides[current].text_size === 'small' ? 'text-sm md:text-lg' : 
                          slides[current].text_size === 'large' ? 'text-lg md:text-2xl' : 
                          'text-base md:text-xl'}
                      `}
                      style={{ animationDelay: "0.4s" }}
                    >
                      {heroSubtitle}
                    </p>
                  )}
                  {heroDescription && (
                    <p 
                      className={`
                        animate-fade-in drop-shadow-lg mt-2 md:mt-3
                        ${slides[current].text_size === 'small' ? 'text-xs md:text-sm' : 
                          slides[current].text_size === 'large' ? 'text-base md:text-lg' : 
                          'text-sm md:text-base'}
                      `}
                      style={{ animationDelay: "0.6s" }}
                    >
                      {heroDescription}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

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
      )}
    </section>
  );
};

export default HeroSection;
