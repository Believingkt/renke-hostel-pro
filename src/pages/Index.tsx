import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import RoomsSection from "@/components/RoomsSection";
import FacilitiesSection from "@/components/FacilitiesSection";
import PhotoGallerySection from "@/components/PhotoGallerySection";
import BookingInfoSection from "@/components/BookingInfoSection";
import LocationSection from "@/components/LocationSection";
import FaqSection from "@/components/FaqSection";
import ReviewsSection from "@/components/ReviewsSection";
import Footer from "@/components/Footer";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";
import { StructuredData } from "@/components/StructuredData";
import { SEOHead } from "@/components/SEOHead";

interface AccommodationData {
  info: {
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
  };
  roomTypes: any[];
  bookingSettings: any;
  facilities: any[];
  photos: any[];
  locationInfo: any;
}

const Index = () => {
  const [data, setData] = useState<AccommodationData | null>(null);
  const { accommodationId, isLoading: subdomainLoading, error: subdomainError } = useSubdomain();

  useEffect(() => {
    if (subdomainLoading || !accommodationId) return;

    const loadData = async () => {
      try {
        const { data: infoData } = await supabase
          .from("accommodation_info")
          .select("id, name, description, address, check_in_notice, phone, email, line_id, facebook_url, instagram_url, threads_url, youtube_url, tiktok_url, og_title, og_description, og_image_url, hero_main_title, hero_subtitle, hero_description, hero_overlay_opacity, hero_autoplay_delay")
          .eq("id", accommodationId)
          .single();
        
        if (infoData) {
          // 一次性加载所有数据，避免多次渲染导致的闪烁
          const [roomTypesRes, bookingSettingsRes, facilitiesRes, photosRes, locationInfoRes] = await Promise.all([
            supabase
              .from("room_types")
              .select(`
                *,
                room_photos (
                  photo_url,
                  display_order
                )
              `)
              .eq("accommodation_id", infoData.id)
              .order("display_order"),
            supabase
              .from("booking_settings")
              .select("*")
              .eq("accommodation_id", infoData.id)
              .maybeSingle(),
            supabase
              .from("accommodation_facilities")
              .select("*")
              .eq("accommodation_id", infoData.id)
              .eq("is_available", true),
            supabase
              .from("accommodation_photos")
              .select("*")
              .eq("accommodation_id", infoData.id)
              .order("display_order"),
            supabase
              .from("location_info")
              .select("*")
              .eq("accommodation_id", infoData.id)
              .maybeSingle()
          ]);

          // 整理照片順序
          const roomTypesWithPhotos = (roomTypesRes.data || []).map(room => ({
            ...room,
            room_photos: (room.room_photos || []).sort((a, b) => a.display_order - b.display_order)
          }));

          setData({
            info: infoData,
            roomTypes: roomTypesWithPhotos,
            bookingSettings: bookingSettingsRes.data,
            facilities: facilitiesRes.data || [],
            photos: photosRes.data || [],
            locationInfo: locationInfoRes.data
          });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching data:', error);
        }
      }
    };

    loadData();
  }, [accommodationId, subdomainLoading]);

  if (subdomainLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
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

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (!data) {
    return <FrontendSkeleton />;
  }

  return (
    <div className="min-h-screen">
      {/* SEO Meta 標籤 */}
      <SEOHead
        title={data.info.og_title || data.info.name}
        description={data.info.og_description || data.info.description || "體驗山林中的寧靜時光，融合日式美學與自然的完美住宿空間。提供一泊二食、管家服務，打造專屬的度假體驗。"}
        keywords={[
          data.info.name,
          "豪華露營",
          "日式民宿",
          "山林住宿",
          "一泊二食",
          "管家服務",
          "度假",
          "寫真拍攝",
          data.info.address.includes("南投") ? "南投住宿" : "台灣住宿",
          data.info.address.includes("南投") ? "南投民宿" : "民宿"
        ]}
        image={data.info.og_image_url}
      />
      
      {/* 結構化資料 */}
      <StructuredData
        accommodationInfo={data.info}
        roomTypes={data.roomTypes}
        averageRating={4.8}
        reviewCount={4}
      />

      <Navigation 
        accommodationName={data.info.name}
        onNavigate={scrollToSection} 
      />
      <main>
        <HeroSection 
          accommodationName={data.info.name}
          heroMainTitle={data.info.hero_main_title}
          heroSubtitle={data.info.hero_subtitle}
          heroDescription={data.info.hero_description}
          heroOverlayOpacity={data.info.hero_overlay_opacity}
          heroAutoplayDelay={data.info.hero_autoplay_delay}
        />
        <AboutSection description={data.info.description} accommodationId={data.info.id} />
        <RoomsSection roomTypes={data.roomTypes || []} />
        <FacilitiesSection facilities={data.facilities || []} />
        <PhotoGallerySection photos={data.photos || []} />
        <LocationSection
          address={data.info.address}
          locationInfo={data.locationInfo}
        />
        <BookingInfoSection 
          bookingSettings={data.bookingSettings}
          checkInNotice={data.info.check_in_notice}
        />
        <ReviewsSection />
        <FaqSection />
      </main>
      <Footer 
        accommodationName={data.info.name}
        address={data.info.address}
        phone={data.info.phone}
        email={data.info.email}
        lineId={data.info.line_id}
        facebookUrl={data.info.facebook_url}
        instagramUrl={data.info.instagram_url}
        threadsUrl={data.info.threads_url}
        youtubeUrl={data.info.youtube_url}
        tiktokUrl={data.info.tiktok_url}
      />
    </div>
  );
};

export default Index;
