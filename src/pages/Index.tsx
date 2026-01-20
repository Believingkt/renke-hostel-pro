import { useEffect, useState, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useAccommodation } from "@/contexts/AccommodationContext";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import { StructuredData } from "@/components/StructuredData";
import { SEOHead } from "@/components/SEOHead";
import { DevAccommodationSwitcher } from "@/components/DevAccommodationSwitcher";
import { getThemeClass, cacheAccommodationTheme } from "@/constants/themes";

// NOTE: 為避免自訂網域上 chunk 快取不一致造成的載入失敗，首屏與區塊組件改為 eager import。
import AboutSection from "@/components/AboutSection";
import RoomsSection from "@/components/RoomsSection";
import FacilitiesSection from "@/components/FacilitiesSection";
import PhotoGallerySection from "@/components/PhotoGallerySection";
import LocationSection from "@/components/LocationSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import ReviewsSection from "@/components/ReviewsSection";
import FaqSection from "@/components/FaqSection";
import Footer from "@/components/Footer";

interface AccommodationInfo {
  id: string;
  name: string;
  description: string;
  address: string;
  check_in_notice: string;
  phone?: string;
  email?: string;
  line_id?: string;
  facebook_url?: string;
  instagram_url?: string;
  threads_url?: string;
  youtube_url?: string;
  tiktok_url?: string;
  og_title?: string;
  og_description?: string;
  og_image_url?: string;
  hero_main_title?: string;
  hero_subtitle?: string;
  hero_description?: string;
  hero_overlay_opacity?: number;
  hero_autoplay_delay?: number;
  theme_preset?: string;
  short_url_alias?: string;
}

interface SecondaryData {
  roomTypes: any[];
  bookingSettings: any;
  facilities: any[];
  locationInfo: any;
}

const Index = () => {
  // 首屏資料（優先載入）
  const [info, setInfo] = useState<AccommodationInfo | null>(null);
  const [heroPhotos, setHeroPhotos] = useState<any[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<any[]>([]);
  
  // 次要資料（延遲載入）
  const [secondaryData, setSecondaryData] = useState<SecondaryData | null>(null);
  
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [lastLoadedAccId, setLastLoadedAccId] = useState<string | null>(null);
  const { accommodationId, isLoading: subdomainLoading, error: subdomainError } = useSubdomain();
  const { setCurrentAccommodationId } = useAccommodation();

  // 從資料庫讀取的主題設定
  const themeClass = info?.theme_preset ? getThemeClass(info.theme_preset) : '';

  // 使用 useLayoutEffect 在 DOM 更新前立即更新標題，減少視覺閃爍
  useLayoutEffect(() => {
    if (info) {
      const title = info.og_title || info.name;
      if (title && document.title !== title) {
        document.title = title;
      }
    }
  }, [info?.og_title, info?.name]);

  // 同步 subdomain 解析的 accommodationId 到 AccommodationContext
  useEffect(() => {
    if (accommodationId) {
      setCurrentAccommodationId(accommodationId);
    }
  }, [accommodationId, setCurrentAccommodationId]);

  // 添加超時保護，10秒後強制顯示錯誤
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!info) {
        setLoadTimeout(true);
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [info]);

  // 第一階段：載入首屏必要資料（info + photos）
  useEffect(() => {
    if (subdomainLoading || !accommodationId) return;

    // 如果 accommodationId 改變了，清除舊資料避免顯示錯誤內容
    if (lastLoadedAccId !== accommodationId) {
      setInfo(null);
      setHeroPhotos([]);
      setGalleryPhotos([]);
      setSecondaryData(null);
      setLastLoadedAccId(accommodationId);
    }

    const loadPrimaryData = async () => {
      try {
        // 同時載入 info 和 photos（首屏必要）
        const [infoRes, photosRes] = await Promise.all([
          supabase
            .from("accommodation_info")
            .select("id, name, description, address, check_in_notice, phone, email, line_id, facebook_url, instagram_url, threads_url, youtube_url, tiktok_url, og_title, og_description, og_image_url, hero_main_title, hero_subtitle, hero_description, hero_overlay_opacity, hero_autoplay_delay, theme_preset, short_url_alias")
            .eq("id", accommodationId)
            .maybeSingle(),
          supabase
            .from("accommodation_photos")
            .select("*")
            .eq("accommodation_id", accommodationId)
            .order("display_order")
        ]);
        
        if (infoRes.error) throw infoRes.error;
        
        if (!infoRes.data) {
          setLoadTimeout(true);
          return;
        }

        // 快取主題設定
        if (infoRes.data.theme_preset) {
          cacheAccommodationTheme(
            infoRes.data.id, 
            infoRes.data.short_url_alias, 
            infoRes.data.theme_preset
          );
        }

        const photos = photosRes.data || [];
        setInfo(infoRes.data);
        setHeroPhotos(photos.filter(p => p.photo_type === 'hero'));
        setGalleryPhotos(photos.filter(p => p.photo_type !== 'hero'));
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching primary data:', error);
        }
      }
    };

    loadPrimaryData();
  }, [accommodationId, subdomainLoading, lastLoadedAccId]);

  // 第二階段：延遲載入次要資料（首屏渲染後）
  useEffect(() => {
    if (!info) return;

    const loadSecondaryData = async () => {
      try {
        const [roomTypesRes, bookingSettingsRes, facilitiesRes, locationInfoRes] = await Promise.all([
          supabase
            .from("room_types")
            .select(`*, room_photos (photo_url, display_order)`)
            .eq("accommodation_id", info.id)
            .order("display_order"),
          supabase
            .from("booking_settings")
            .select("*")
            .eq("accommodation_id", info.id)
            .maybeSingle(),
          supabase
            .from("accommodation_facilities")
            .select("*")
            .eq("accommodation_id", info.id)
            .eq("is_available", true),
          supabase
            .from("location_info")
            .select("*")
            .eq("accommodation_id", info.id)
            .maybeSingle()
        ]);

        // 整理照片順序
        const roomTypesWithPhotos = (roomTypesRes.data || []).map(room => ({
          ...room,
          room_photos: (room.room_photos || []).sort((a: any, b: any) => a.display_order - b.display_order)
        }));

        setSecondaryData({
          roomTypes: roomTypesWithPhotos,
          bookingSettings: bookingSettingsRes.data,
          facilities: facilitiesRes.data || [],
          locationInfo: locationInfoRes.data
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching secondary data:', error);
        }
      }
    };

    loadSecondaryData();
  }, [info]);

  if (subdomainLoading) {
    return <div className="min-h-screen" />;
  }

  if (subdomainError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive mb-2">{subdomainError}</p>
          <p className="text-sm text-muted-foreground">請確認您的網址是否正確</p>
        </div>
      </div>
    );
  }

  if (loadTimeout) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive mb-2">無法載入資料</p>
          <p className="text-sm text-muted-foreground">請重新整理頁面或稍後再試</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            重新整理
          </button>
        </div>
      </div>
    );
  }

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 只等待首屏資料載入完成即顯示
  if (!info) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className={`min-h-screen ${themeClass}`}>
      {/* SEO Meta 標籤 */}
      <SEOHead
        title={info.og_title || info.name}
        description={info.og_description || info.description || "體驗山林中的寧靜時光，融合日式美學與自然的完美住宿空間。提供一泊二食、管家服務，打造專屬的度假體驗。"}
        keywords={[
          info.name,
          "豪華露營",
          "日式民宿",
          "山林住宿",
          "一泊二食",
          "管家服務",
          "度假",
          "寫真拍攝",
          info.address?.includes("南投") ? "南投住宿" : "台灣住宿",
          info.address?.includes("南投") ? "南投民宿" : "民宿"
        ]}
        image={info.og_image_url}
      />
      
      {/* 結構化資料 */}
      <StructuredData
        accommodationInfo={info}
        roomTypes={secondaryData?.roomTypes || []}
        averageRating={4.8}
        reviewCount={4}
      />

      <Navigation 
        accommodationName={info.name}
        onNavigate={scrollToSection} 
      />
      <main>
        {/* 首屏內容 - 直接載入 */}
        <HeroSection 
          accommodationName={info.name}
          heroMainTitle={info.hero_main_title}
          heroSubtitle={info.hero_subtitle}
          heroDescription={info.hero_description}
          heroOverlayOpacity={info.hero_overlay_opacity}
          heroAutoplayDelay={info.hero_autoplay_delay}
          heroPhotos={heroPhotos}
        />
        
        {/* 非首屏內容 */}
        <AboutSection description={info.description} accommodationId={info.id} />
        <RoomsSection roomTypes={secondaryData?.roomTypes || []} />
        <FacilitiesSection facilities={secondaryData?.facilities || []} />
        <PhotoGallerySection photos={galleryPhotos} />
        <LocationSection address={info.address} locationInfo={secondaryData?.locationInfo} />
        <BookingInfoSection
          bookingSettings={secondaryData?.bookingSettings}
          checkInNotice={info.check_in_notice}
        />
        <ReviewsSection accommodationId={info.id} />
        <FaqSection />
      </main>

      <Footer
        accommodationName={info.name}
        address={info.address}
        phone={info.phone}
        email={info.email}
        lineId={info.line_id}
        facebookUrl={info.facebook_url}
        instagramUrl={info.instagram_url}
        threadsUrl={info.threads_url}
        youtubeUrl={info.youtube_url}
        tiktokUrl={info.tiktok_url}
      />
      
      {/* 開發環境住宿切換器 */}
      <DevAccommodationSwitcher />
    </div>
  );
};

export default Index;
