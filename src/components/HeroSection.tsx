import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import { Calendar as CalendarIcon, Users, Search, Image as ImageIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isSaturday, addMonths, startOfMonth, endOfMonth, formatISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { validateDateRange } from "@/lib/schemas/booking";
import { supabase } from "@/integrations/supabase/client";
import { OptimizedImage } from "@/components/OptimizedImage";
import { generateBlurDataURLs } from "@/utils/imageBlurHelper";
import { preloadImageWithLink } from "@/utils/imagePreloader";
import heroSlide1 from "@/assets/hero-slide-1.jpg";
import heroSlide2 from "@/assets/hero-slide-2.jpg";
import heroSlide3 from "@/assets/hero-slide-3.jpg";
import EmptySectionPlaceholder from "./EmptySectionPlaceholder";

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
  heroPhotos?: HeroPhoto[];
  onFirstImageLoad?: () => void;
  compact?: boolean;
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

// 空值佔位符元件 - Hero 特製版
const HeroEmptyPlaceholder = () => (
  <section id="home" className="pt-16 relative">
    <div className="relative h-[580px] md:h-[700px] w-full bg-gradient-to-br from-muted/30 to-muted/10 flex items-center justify-center">
      <div className="text-center max-w-lg mx-auto px-4">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/40">
          <ImageIcon className="h-12 w-12" />
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-muted-foreground/60 mb-4">
          首頁輪播圖
        </h2>
        <p className="text-muted-foreground/50 text-sm md:text-base">
          尚未設定首頁輪播圖片，請至後台上傳精選照片
        </p>
      </div>
    </div>
  </section>
);

const HeroSection = ({ 
  accommodationName = "",
  heroMainTitle = "",
  heroSubtitle = "",
  heroDescription = "",
  heroOverlayOpacity = 40,
  heroAutoplayDelay = 8,
  heroPhotos: providedHeroPhotos = [],
  onFirstImageLoad,
  compact = false,
}: HeroSectionProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isIndividualBookingPage = /^\/booking\/[^/]+$/.test(location.pathname);
  const useCompactHero = compact || isIndividualBookingPage;
  const { checkInDate, setCheckInDate, checkOutDate, setCheckOutDate, guests, setGuests, currentAccommodationId } = useAccommodation();
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set([0]));
  const [isCheckInDateOpen, setIsCheckInDateOpen] = useState(false);
  const [isCheckOutDateOpen, setIsCheckOutDateOpen] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<Date[]>([]);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [partiallyAvailableDates, setPartiallyAvailableDates] = useState<Set<string>>(new Set());
  const [hasInventoryData, setHasInventoryData] = useState(false);
  const [heroPhotos, setHeroPhotos] = useState<HeroPhoto[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const [blurDataURLs, setBlurDataURLs] = useState<Map<string, string>>(new Map());
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [hasNoData, setHasNoData] = useState(false);

  // 使用數據庫圖片，不再使用默認圖片
  const slides = heroPhotos;

  // 使用傳入的 photos 或載入數據庫圖片
  useEffect(() => {
    // 如果已經有傳入的 photos，直接使用
    if (providedHeroPhotos && providedHeroPhotos.length > 0) {
      const photosWithDefaults = providedHeroPhotos.map(photo => ({
        ...photo,
        title_size: photo.title_size || 'medium',
        subtitle_size: photo.subtitle_size || 'medium',
        secondary_subtitle_size: photo.secondary_subtitle_size || 'medium'
      }));
      setHeroPhotos(photosWithDefaults);
      setHasNoData(false);
      setIsLoadingPhotos(false);
      return;
    }

    // 否則從數據庫獲取
    const fetchHeroPhotos = async () => {
      const { data: accommodations } = await supabase
        .from('accommodation_info')
        .select('id')
        .limit(1)
        .maybeSingle();

      const accommodationId = currentAccommodationId || accommodations?.id;

      if (!accommodationId) {
        setHasNoData(true);
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
          .limit(5);

        if (error) throw error;

        if (data && data.length > 0) {
          // 確保所有圖片都有默認的 title_size
          const photosWithDefaults = data.map(photo => ({
            ...photo,
            title_size: photo.title_size || 'medium',
            subtitle_size: photo.subtitle_size || 'medium',
            secondary_subtitle_size: photo.secondary_subtitle_size || 'medium'
          }));
          setHeroPhotos(photosWithDefaults);
          setHasNoData(false);
          
          // 立即為首張圖片生成模糊預覽
          const firstImageUrl = photosWithDefaults[0]?.photo_url;
          if (firstImageUrl) {
            generateBlurDataURLs([firstImageUrl]).then(blurMap => {
              setBlurDataURLs(blurMap);
            });
            
            // 延遲為第2和第3張圖片生成模糊預覽
            setTimeout(() => {
              const otherImages = photosWithDefaults.slice(1, 3).map(p => p.photo_url);
              if (otherImages.length > 0) {
                generateBlurDataURLs(otherImages).then(otherBlurMap => {
                  setBlurDataURLs(prev => new Map([...prev, ...otherBlurMap]));
                });
              }
            }, 800);
          }
        } else {
          // 資料庫沒有 hero 圖片
          setHasNoData(true);
        }
      } catch (error) {
        console.error('Error fetching hero photos:', error);
        setHasNoData(true);
      } finally {
        setIsLoadingPhotos(false);
      }
    };

    fetchHeroPhotos();
  }, [currentAccommodationId, providedHeroPhotos]);

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

  // 載入房間庫存可用日期
  // AVAILABILITY_CACHE_VERSION：每次邏輯有變動時遞增，可強制清除舊版本快取
  const AVAILABILITY_CACHE_VERSION = 'v6-2026-04-29-date-value-fix';

  useEffect(() => {
    const loadAvailability = async () => {
      const accId = currentAccommodationId;
      if (!accId) return;

      // 檢查快取版本，舊版本一律清空
      try {
        const storedVersion = sessionStorage.getItem('availability_cache_version');
        if (storedVersion !== AVAILABILITY_CACHE_VERSION) {
          Object.keys(sessionStorage)
            .filter((k) => k.startsWith('availability_'))
            .forEach((k) => sessionStorage.removeItem(k));
          sessionStorage.setItem('availability_cache_version', AVAILABILITY_CACHE_VERSION);
        }
      } catch (_) {
        // sessionStorage 不可用，忽略
      }

      // 取得該住宿所有房型 (含 capacity / 包區屬性，用以判斷散客房型)
      const { data: roomTypes } = await supabase
        .from('room_types')
        .select('id, is_exclusive_package, is_bound_to_exclusive')
        .eq('accommodation_id', accId);

      if (!roomTypes || roomTypes.length === 0) return;

      const today = new Date();
      const todayStr = formatISO(today, { representation: 'date' });
      const sixMonthsLater = addMonths(today, 6);
      const endStr = formatISO(endOfMonth(sixMonthsLater), { representation: 'date' });

      // 先取庫存底表，建立完整日期清單
      const { data: inventoryRows } = await supabase
        .from('room_inventory_pricing')
        .select('date, available_rooms, is_available, price, room_type_id')
        .in('room_type_id', roomTypes.map(r => r.id))
        .gte('date', todayStr)
        .lte('date', endStr);

      if (!inventoryRows || inventoryRows.length === 0) {
        setHasInventoryData(false);
        return;
      }

      setHasInventoryData(true);

      // 收集所有日期
      const allDates = Array.from(new Set(inventoryRows.map(r => r.date))).sort();

      // 對每個房型呼叫 RPC 取得「調整後庫存」(已扣除訂單 + 包區互斥邏輯)
      const adjustedResults = await Promise.all(
        roomTypes.map(async (rt) => {
          const { data } = await supabase.rpc('get_adjusted_room_inventory_batch', {
            p_room_type_id: rt.id,
            p_dates: allDates,
            p_accommodation_id: accId,
          });
          return { roomTypeId: rt.id, rows: (data as any[]) || [] };
        })
      );

      const adjustedIndex = new Map<string, { available_rooms: number; is_blocked: boolean }>();
      for (const { roomTypeId, rows } of adjustedResults) {
        for (const row of rows) {
          // RPC 回傳欄位名為 date_value
          const dateKey = (row as any).date_value ?? (row as any).date;
          if (!dateKey) continue;
          adjustedIndex.set(`${roomTypeId}:${dateKey}`, {
            available_rooms: row.available_rooms ?? 0,
            is_blocked: row.is_blocked === true,
          });
        }
      }

      const baseIndex = new Map<string, { is_available: boolean; hasPrice: boolean }>();
      for (const row of inventoryRows) {
        baseIndex.set(`${row.room_type_id}:${row.date}`, {
          is_available: row.is_available !== false,
          hasPrice: row.price !== null && row.price !== undefined,
        });
      }

      // 規則：
      // - 散客房型（非包區）：任一散客有空即視為散客側可訂
      // - 包區房型：必須「每一個包區」都仍有庫存（rooms > 0 且未被封鎖）
      //   只要任一包區無庫存，整天即關閉
      // - 開啟條件：散客側有空 AND 所有包區皆有空
      const exclusiveTypes = roomTypes.filter((rt: any) => rt.is_exclusive_package);
      const nonExclusiveTypes = roomTypes.filter((rt: any) => !rt.is_exclusive_package);

      const available = new Set<string>();
      for (const date of allDates) {
        // 散客側：至少一個散客房型有空
        const guestOk = nonExclusiveTypes.some((rt: any) => {
          const adj = adjustedIndex.get(`${rt.id}:${date}`);
          if (!adj || adj.is_blocked) return false;
          return adj.available_rooms > 0;
        });

        // 包區側：每一個包區都必須仍有空
        const allExclusiveOk = exclusiveTypes.length === 0 || exclusiveTypes.every((rt: any) => {
          const adj = adjustedIndex.get(`${rt.id}:${date}`);
          if (!adj || adj.is_blocked) return false;
          return adj.available_rooms > 0;
        });

        if (guestOk && allExclusiveOk) available.add(date);
      }

      setAvailableDates(available);
      setPartiallyAvailableDates(new Set());
    };

    loadAvailability();

    // 視窗重新聚焦或顯示時重新驗證庫存（確保 publish 後資料即時）
    const handleRevalidate = () => {
      if (document.visibilityState === 'visible') {
        loadAvailability();
      }
    };
    window.addEventListener('focus', handleRevalidate);
    document.addEventListener('visibilitychange', handleRevalidate);

    return () => {
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleRevalidate);
    };
  }, [currentAccommodationId]);

  // 生成圖片模糊預覽 - 延遲執行以避免阻塞關鍵內容
  // 生成模糊預覽 - 僅為默認圖片
  useEffect(() => {
    if (slides.length === 0 || heroPhotos.length > 0) return; // 如果有數據庫圖片，跳過

    const generateBlurs = async () => {
      try {
        // 只為首張默認圖片生成模糊預覽
        const firstImageUrl = slides[0]?.photo_url;
        if (firstImageUrl) {
          const blurs = await generateBlurDataURLs([firstImageUrl]);
          setBlurDataURLs(blurs);
          
          // 延遲生成其他默認圖片的模糊預覽
          setTimeout(async () => {
            const otherUrls = slides.slice(1, 3).map(s => s.photo_url);
            if (otherUrls.length > 0) {
              const otherBlurs = await generateBlurDataURLs(otherUrls);
              setBlurDataURLs(prev => new Map([...prev, ...otherBlurs]));
            }
          }, 1000);
        }
      } catch (error) {
        console.error('生成模糊預覽失敗:', error);
      }
    };

    // 立即生成首張，不延遲
    generateBlurs();
  }, [slides, heroPhotos.length]);

  // 檢查是否為假日（星期六或國定假日）
  const isHoliday = (date: Date) => {
    if (isSaturday(date)) return true;
    return publicHolidays.some(holiday => 
      holiday.getFullYear() === date.getFullYear() &&
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
    );
  };

  // 檢查日期是否有空房
  const isDateAvailable = (date: Date) => {
    // 若尚無庫存資料（未設定），視為可用
    if (!hasInventoryData) return true;
    const dateStr = formatISO(date, { representation: 'date' });
    return availableDates.has(dateStr);
  };

  // 檢查日期是否無法預訂（過去 + 無庫存）
  const isDateUnavailable = (date: Date) => {
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    if (date < today) return true;
    return !isDateAvailable(date);
  };

  // 檢查日期是否「部分售完」（仍可訂，但部分散客房型已售完）
  const isDatePartiallyAvailable = (date: Date) => {
    if (!hasInventoryData) return false;
    const dateStr = formatISO(date, { representation: 'date' });
    return partiallyAvailableDates.has(dateStr);
  };

  useEffect(() => {
    if (!carouselApi || !autoplayEnabled) return;

    setCurrent(carouselApi.selectedScrollSnap());

    const handleSelect = () => {
      const index = carouselApi.selectedScrollSnap();
      setCurrent(index);
      
      // 智能預載入：優先下一張，延遲上一張
      const nextIndex = (index + 1) % slides.length;
      const prevIndex = (index - 1 + slides.length) % slides.length;
      
      // 立即預載入下一張圖片（高優先級）
      if (slides[nextIndex] && !loadedImages.has(nextIndex)) {
        const img = new Image();
        img.fetchPriority = 'high';
        img.src = slides[nextIndex].photo_url;
        setLoadedImages(prev => new Set([...prev, nextIndex]));
      }
      
      // 延遲預載入上一張圖片（低優先級）
      setTimeout(() => {
        if (slides[prevIndex] && !loadedImages.has(prevIndex)) {
          const img = new Image();
          img.fetchPriority = 'low';
          img.src = slides[prevIndex].photo_url;
          setLoadedImages(prev => new Set([...prev, prevIndex]));
        }
      }, 300);
    };
    
    carouselApi.on("select", handleSelect);
    
    // 首次載入時快速預載入第二和第三張圖片
    const preloadTimer = setTimeout(() => {
      if (slides.length > 1 && !loadedImages.has(1)) {
        const img2 = new Image();
        img2.fetchPriority = 'high';
        img2.src = slides[1].photo_url;
        setLoadedImages(prev => new Set([...prev, 1]));
        
        // 稍後預載入第三張
        if (slides.length > 2) {
          setTimeout(() => {
            if (!loadedImages.has(2)) {
              const img3 = new Image();
              img3.fetchPriority = 'low';
              img3.src = slides[2].photo_url;
              setLoadedImages(prev => new Set([...prev, 2]));
            }
          }, 500);
        }
      }
    }, 300);
    
    // 監聯圖片查看器事件，停止/恢復輪播
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
      carouselApi.off("select", handleSelect);
      window.removeEventListener('viewer-opened', handleViewerOpened);
      window.removeEventListener('viewer-closed', handleViewerClosed);
    };
  }, [carouselApi, slides.length, autoplayEnabled, loadedImages]);

  // 自訂自動播放功能，使用全局延遲時間
  useEffect(() => {
    if (!carouselApi || !autoplayEnabled || slides.length === 0) return;

    const delay = heroAutoplayDelay * 1000; // 使用全局設定，轉換為毫秒

    const timer = setTimeout(() => {
      carouselApi.scrollNext();
    }, delay);

    return () => clearTimeout(timer);
  }, [carouselApi, current, slides, autoplayEnabled, heroAutoplayDelay]);

  // 載入中狀態
  if (isLoadingPhotos) {
    return (
      <section id="home" className="pt-16 relative">
        <div className="relative h-[580px] md:h-[700px] w-full bg-gradient-to-br from-muted/30 to-muted/10 animate-pulse" />
      </section>
    );
  }

  // 空值狀態：沒有設定任何輪播圖
  if (hasNoData || slides.length === 0) {
    return <HeroEmptyPlaceholder />;
  }

  // 確保 current 索引在有效範圍內
  const safeCurrentIndex = slides.length > 0 ? Math.min(current, slides.length - 1) : 0;
  const currentSlide = slides[safeCurrentIndex];

  return (
    <section id="home" className="pt-16 relative">
      <div className="relative">
        <Carousel
          opts={{ 
            loop: true,
            duration: 40, // 增加切換持續時間以實現更平滑的過渡
            align: "start",
            startIndex: 0,
          }}
          className="w-full"
          setApi={setCarouselApi}
        >
          <CarouselContent className="-ml-0">
            {slides.map((slide, index) => (
              <CarouselItem key={slide.id} className="pl-0">
                <div className={`relative ${useCompactHero ? 'h-[400px] md:h-[500px]' : 'h-[580px] md:h-[700px]'} w-full bg-gradient-to-br from-muted to-muted/50`}>
                  {index === 0 ? (
                    // 首張圖片：無過渡效果，直接顯示
                    <img
                      src={slide.photo_url}
                      alt={slide.title || `${accommodationName} - 首頁輪播圖 1`}
                      className="w-full h-full object-cover brightness-110"
                      loading="eager"
                      fetchPriority="high"
                      onLoad={onFirstImageLoad}
                      style={{ opacity: 1 }}
                    />
                  ) : (
                    // 其他圖片：使用 OptimizedImage
                    <OptimizedImage
                      src={slide.photo_url}
                      alt={slide.title || `${accommodationName} - 首頁輪播圖 ${index + 1}`}
                      className="w-full h-full object-cover brightness-110"
                      priority={false}
                      width="1920"
                      height="1080"
                      sizes="100vw"
                      blurDataURL={blurDataURLs.get(slide.photo_url)}
                      responsive={true}
                      autoSrcSet={true}
                      imageType="hero"
                    />
                  )}
                  <div 
                    className="absolute inset-0"
                    style={{ 
                      backgroundColor: `rgba(0, 0, 0, ${heroOverlayOpacity / 100})`
                    }}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* 輪播指示器 */}
          <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-20 hidden md:block">
            <div className="flex items-center gap-2 px-2 py-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => carouselApi?.scrollTo(index)}
                  className={cn(
                    "h-1 md:h-2 rounded-full transition-all duration-500 ease-out",
                    current === index 
                      ? "w-4 md:w-8 bg-white" 
                      : "w-1 md:w-2 bg-white/60 hover:bg-white/80 hover:w-2 md:hover:w-3"
                  )}
                  aria-label={`前往第 ${index + 1} 張輪播圖`}
                />
              ))}
            </div>
          </div>
        </Carousel>

        {/* 固定的標題覆蓋層 - 不隨圖片移動 */}
        {slides.length > 0 && currentSlide && (
          <div 
            className={`
              absolute left-1/2 -translate-x-1/2 pointer-events-none z-10
              w-full max-w-4xl px-4 ${useCompactHero ? 'pb-24 md:pb-40' : 'pb-32 md:pb-56'}
              text-center
              ${
                currentSlide.text_position_y === 'top' ? 'flex items-start justify-center pt-32 top-0' :
                currentSlide.text_position_y === 'bottom' ? 'flex items-end justify-center pb-32 bottom-0' :
                useCompactHero ? 'flex items-center justify-center top-[40%] -translate-y-1/2' :
                'flex items-center justify-center top-1/2 -translate-y-1/2'
              }
            `}
            style={{
              color: currentSlide.text_color === 'black' ? '#000' : currentSlide.text_color === 'primary' ? 'hsl(var(--primary))' : '#fff'
            }}
          >
            <div className={`w-full ${useCompactHero ? 'space-y-2.5 md:space-y-3' : 'space-y-3 md:space-y-4'}`}>
              {/* 主標題：優先使用圖片標題，否則使用全局標題或住宿名稱 */}
              <h1 
                className={cn(
                  "hero-title font-bold drop-shadow-lg leading-none tracking-tight font-sans",
                  useCompactHero ? "!text-4xl md:!text-5xl" : "text-5xl md:text-7xl"
                )}
              >
                {currentSlide.title || heroMainTitle || accommodationName}
              </h1>
              
              {/* 副標題：優先使用圖片副標題，否則使用全局副標題 */}
              {(currentSlide.subtitle || heroSubtitle) && (
                <p 
                  className={cn(
                    'drop-shadow-lg leading-tight transition-opacity duration-500',
                    useCompactHero
                      ? '!mt-1 md:!mt-1.5 !text-xl md:!text-3xl'
                      : (currentSlide.subtitle_size || 'medium') === 'small'
                        ? 'mt-3 md:mt-4 text-base md:text-2xl'
                        : (currentSlide.subtitle_size || 'medium') === 'large'
                          ? 'mt-3 md:mt-4 text-xl md:text-4xl'
                          : 'mt-3 md:mt-4 text-lg md:text-3xl'
                  )}
                >
                  {currentSlide.subtitle || heroSubtitle}
                </p>
              )}
              
              {/* 次標題：優先使用圖片次標題，否則使用全局次標題 */}
              {(currentSlide.secondary_subtitle || heroDescription) && (
                <p 
                  className={cn(
                    'drop-shadow-lg opacity-90 leading-relaxed transition-opacity duration-500',
                    useCompactHero
                      ? 'mt-1 text-base md:text-xl'
                      : (currentSlide.secondary_subtitle_size || 'small') === 'small'
                        ? 'mt-2 md:mt-3 text-sm md:text-xl'
                        : (currentSlide.secondary_subtitle_size || 'small') === 'large'
                          ? 'mt-2 md:mt-3 text-lg md:text-3xl'
                          : 'mt-2 md:mt-3 text-base md:text-2xl'
                  )}
                >
                  {currentSlide.secondary_subtitle || heroDescription}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 搜尋卡片 - 手机版垂直居中，桌面版在底部 */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 z-30 
                        max-md:top-1/2 max-md:-translate-y-1/2
                        md:top-auto md:translate-y-0 ${useCompactHero ? 'md:bottom-[80px]' : 'md:bottom-[140px]'}`}>

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
                        disabled={isDateUnavailable}
                        modifiers={{
                          holiday: (date) => isHoliday(date) && !isDateUnavailable(date),
                          available: (date) => !isDateUnavailable(date),
                          partial: (date) => isDatePartiallyAvailable(date)
                        }}
                        modifiersClassNames={{
                          holiday: "bg-primary/10 text-primary font-semibold rounded-md",
                          available: "!font-extrabold text-foreground",
                          partial: "relative after:content-[''] after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-orange-500"
                        }}
                        initialFocus
                        className="pointer-events-auto"
                        variant="frontend"
                      />
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t text-xs flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary/10 rounded-md border border-primary/20"></div>
                          <span className="text-muted-foreground">假日定價</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-background rounded-md border border-border"></div>
                          <span className="text-muted-foreground">平日定價</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 text-sm">30</span>
                          <span className="text-muted-foreground">已滿房</span>
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
                        defaultMonth={checkInDate || undefined}
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
                          holiday: (date) => isHoliday(date) && !isDateUnavailable(date),
                          available: (date) => !isDateUnavailable(date),
                          partial: (date) => isDatePartiallyAvailable(date)
                        }}
                        modifiersClassNames={{
                          holiday: "bg-primary/10 text-primary font-semibold rounded-md",
                          available: "!font-extrabold text-foreground",
                          partial: "relative after:content-[''] after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-orange-500"
                        }}
                        initialFocus
                        className="pointer-events-auto"
                        variant="frontend"
                      />
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t text-xs flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary/10 rounded-md border border-primary/20"></div>
                          <span className="text-muted-foreground">假日定價</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-background rounded-md border border-border"></div>
                          <span className="text-muted-foreground">平日定價</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 text-sm">30</span>
                          <span className="text-muted-foreground">已滿房</span>
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

              {/* 搜尋按鈕 — A5：跳頁前先用 zod 驗證日期 */}
              {(() => {
                const validation = validateDateRange(checkInDate, checkOutDate);
                const disabled = validation.ok === false;
                const errorMessage = validation.ok === false ? validation.error : null;
                const handleSearch = () => {
                  const v = validateDateRange(checkInDate, checkOutDate);
                  if (v.ok === false) {
                    toast({
                      title: "請完成日期選擇",
                      description: v.error,
                      variant: "destructive",
                    });
                    return;
                  }
                  const params = new URLSearchParams();
                  if (currentAccommodationId) params.set("acc", currentAccommodationId);
                  if (checkInDate) params.set("checkIn", format(checkInDate, "yyyy-MM-dd"));
                  if (checkOutDate) params.set("checkOut", format(checkOutDate, "yyyy-MM-dd"));
                  const qs = params.toString();
                  navigate(qs ? `/book?${qs}` : "/book");
                };
                return (
                  <div>
                    <Button
                      type="button"
                      onClick={handleSearch}
                      disabled={disabled}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm md:text-base h-11 md:h-14 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={!disabled ? { boxShadow: '0 4px 14px -3px hsl(25, 76%, 50% / 0.4)' } : undefined}
                      onMouseEnter={e => { if (!disabled) e.currentTarget.style.boxShadow = '0 8px 20px -3px hsl(25, 76%, 50% / 0.5)'; }}
                      onMouseLeave={e => { if (!disabled) e.currentTarget.style.boxShadow = '0 4px 14px -3px hsl(25, 76%, 50% / 0.4)'; }}
                    >
                      <Search className="mr-2 h-5 w-5" />
                      搜尋空房
                    </Button>
                    {errorMessage && (
                      <p className="mt-2 text-xs text-destructive text-center">
                        {errorMessage}
                      </p>
                    )}
                  </div>
                );
              })()}
          </CardContent>
        </Card>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
