import { useEffect, useLayoutEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAccommodationCache, DEFAULT_SECTIONS_ORDER } from "@/hooks/use-accommodation-cache";
import { usePageAnalytics } from "@/hooks/use-page-analytics";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import { StructuredData } from "@/components/StructuredData";
import { SEOHead } from "@/components/SEOHead";
import { DevAccommodationSwitcher } from "@/components/DevAccommodationSwitcher";
import { getThemeClass, getCachedThemePreset } from "@/constants/themes";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";

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
import { CustomSectionDisplay, SingleCustomSection, CustomSection } from "@/components/CustomSectionDisplay";

const Index = () => {
  const [searchParams] = useSearchParams();
  const urlAccId = searchParams.get('accId');
  
  const { accommodationId: subdomainAccId, isLoading: subdomainLoading, error: subdomainError } = useSubdomain();
  const { setCurrentAccommodationId } = useAccommodation();
  
  // 優先使用 URL 中的 accId，否則使用 subdomain 解析結果
  const accommodationId = urlAccId || subdomainAccId;
  
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
  
  // 追蹤頁面瀏覽
  usePageAnalytics({ accommodationId, enabled: !!accommodationId && !!info });
  // 使用 useLayoutEffect 在 DOM 更新前立即更新標題，減少視覺閃爍
  useLayoutEffect(() => {
    if (info) {
      // 優先使用 seo_title，再用 og_title，最後用 name
      const title = (info as any).seo_title || info.og_title || info.name;
      if (title && document.title !== title) {
        document.title = title;
      }
    }
  }, [(info as any)?.seo_title, info?.og_title, info?.name]);

  // 同步 accommodationId 到 AccommodationContext（不再覆蓋 URL 參數）
  useEffect(() => {
    if (accommodationId) {
      setCurrentAccommodationId(accommodationId);
    }
  }, [accommodationId, setCurrentAccommodationId]);

  // 如果有 URL accId，不需等待 subdomain 解析完成
  // 嘗試從快取取得主題（用於載入畫面）
  const cachedTheme = accommodationId ? getCachedThemePreset(accommodationId) : null;
  const loadingThemeClass = cachedTheme ? getThemeClass(cachedTheme) : '';
  
  if ((!urlAccId && subdomainLoading) || isLoading) {
    return <div className={`min-h-screen ${loadingThemeClass}`} />;
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
        title={(info as any).seo_title || info.og_title || info.name}
        description={(info as any).seo_description || info.og_description || info.description || "體驗山林中的寧靜時光，融合日式美學與自然的完美住宿空間。提供一泊二食、管家服務，打造專屬的度假體驗。"}
        keywords={
          // 優先使用資料庫中的自訂關鍵字
          (info as any).meta_keywords 
            ? (info as any).meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
            : [
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
              ]
        }
        image={info.og_image_url || heroPhotos?.[0]?.photo_url || galleryPhotos?.[0]?.photo_url}
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
        sectionsOrder={info.homepage_sections_order || DEFAULT_SECTIONS_ORDER}
        sectionVisibility={{
          show_about_section: info.show_about_section,
          show_rooms_section: info.show_rooms_section,
          show_facilities_section: info.show_facilities_section,
          show_gallery_section: info.show_gallery_section,
          show_location_section: info.show_location_section,
          show_booking_info_section: info.show_booking_info_section,
          show_reviews_section: info.show_reviews_section,
          show_faq_section: info.show_faq_section,
          show_custom_images_section: info.show_custom_images_section,
        }}
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
        
        {/* 非首屏內容 - 根據後台設定的順序渲染 */}
        {(info.homepage_sections_order || DEFAULT_SECTIONS_ORDER).map((sectionKey) => {
          const sectionTitles = (info as any).homepage_section_titles || {};
          const titles = sectionTitles[sectionKey] || {};
          switch (sectionKey) {
            case 'about':
              return info.show_about_section !== false && (
                <AboutSection key="about" description={info.description} accommodationId={info.id} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'rooms':
              return info.show_rooms_section !== false && (
                <RoomsSection key="rooms" roomTypes={secondaryData?.roomTypes || []} sectionDescription={info.description} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'facilities':
              return info.show_facilities_section !== false && (
                <FacilitiesSection key="facilities" facilities={secondaryData?.facilities || []} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'gallery':
              return info.show_gallery_section !== false && (
                <PhotoGallerySection key="gallery" photos={galleryPhotos} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'location':
              return info.show_location_section !== false && (
                <LocationSection key="location" address={info.address} locationInfo={secondaryData?.locationInfo} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'booking_info':
              return info.show_booking_info_section !== false && (
                <BookingInfoSection
                  key="booking_info"
                  bookingSettings={secondaryData?.bookingSettings}
                  checkInNotice={info.check_in_notice}
                  customSections={secondaryData?.customBookingSections}
                  customTitle={titles.title}
                  customSubtitle={titles.subtitle}
                />
              );
            case 'reviews':
              return info.show_reviews_section !== false && (
                <ReviewsSection key="reviews" accommodationId={info.id} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'faq':
              return info.show_faq_section !== false && (
                <FaqSection key="faq" accommodationId={info.id} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'custom_images':
              // Legacy support: render all custom sections together
              return info.show_custom_images_section !== false && 
                secondaryData?.customImageSections && 
                secondaryData.customImageSections.length > 0 && (
                <CustomSectionDisplay key="custom_images" sections={secondaryData.customImageSections} />
              );
            default:
              // Check if it's an individual custom section key (custom_<uuid>)
              if (sectionKey.startsWith('custom_')) {
                const sectionId = sectionKey.replace('custom_', '');
                const section = secondaryData?.customImageSections?.find(
                  (s: CustomSection) => s.id === sectionId
                );
                if (section && section.is_enabled) {
                  return <SingleCustomSection key={sectionKey} section={section} />;
                }
              }
              return null;
          }
        })}
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
