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
          .select("id, name, description, address, check_in_notice, phone, email, line_id, facebook_url, instagram_url")
          .eq("id", accommodationId)
          .single();
        
        if (infoData) {
          // 先设置基本信息
          setData({
            info: infoData,
            roomTypes: [],
            bookingSettings: null,
            facilities: [],
            photos: [],
            locationInfo: null
          });
          
          // 继续加载其他数据
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
    return null;
  }

  return (
    <div className="min-h-screen">
      <Navigation 
        accommodationName={data.info.name || "森山寫照"}
        onNavigate={scrollToSection} 
      />
      <main>
        <HeroSection accommodationName={data.info.name || "森山寫照"} />
        <AboutSection description={data.info.description} />
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
      />
    </div>
  );
};

export default Index;
