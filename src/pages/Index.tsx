import { useEffect, useLayoutEffect } from "react";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAccommodationCache } from "@/hooks/use-accommodation-cache";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import { StructuredData } from "@/components/StructuredData";
import { SEOHead } from "@/components/SEOHead";
import { DevAccommodationSwitcher } from "@/components/DevAccommodationSwitcher";
import { getThemeClass } from "@/constants/themes";

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

const Index = () => {
  const { accommodationId, isLoading: subdomainLoading, error: subdomainError } = useSubdomain();
  const { setCurrentAccommodationId } = useAccommodation();
  
  // 使用快取 hook 管理資料
  const {
    info,
    heroPhotos,
    galleryPhotos,
    secondaryData,
    isLoading,
    error: dataError,
    refetch
  } = useAccommodationCache(accommodationId);

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

  if (subdomainLoading || isLoading) {
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

  if (dataError || !info) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive mb-2">{dataError || "無法載入資料"}</p>
          <p className="text-sm text-muted-foreground">請重新整理頁面或稍後再試</p>
          <button 
            onClick={refetch} 
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
