import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";

// 懶加載非首屏組件以提升初始載入速度
const RoomsSection = lazy(() => import("@/components/RoomsSection"));
const BookingInfoSection = lazy(() => import("@/components/BookingInfoSection"));
const LocationSection = lazy(() => import("@/components/LocationSection"));
const ReviewsSection = lazy(() => import("@/components/ReviewsSection"));
const Footer = lazy(() => import("@/components/Footer"));

interface AccommodationData {
  info: {
    id: string;
    name: string;
    description: string;
    address: string;
    check_in_notice: string;
  };
  roomTypes: any[];
  bookingSettings: any;
}

const Index = () => {
  const [data, setData] = useState<AccommodationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 使用 requestIdleCallback 延遲非關鍵資料載入
    const timeoutId = setTimeout(() => {
      fetchAllData();
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, []);

  const fetchAllData = async () => {
    try {
      // 一次性獲取所有必要資料
      const { data: infoData } = await supabase
        .from("accommodation_info")
        .select("id, name, description, address, check_in_notice")
        .maybeSingle();
      
      if (infoData) {
        // 並行獲取房型和訂房設定
        const [roomTypesRes, bookingSettingsRes] = await Promise.all([
          supabase
            .from("room_types")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .order("display_order"),
          supabase
            .from("booking_settings")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .maybeSingle()
        ]);

        setData({
          info: infoData,
          roomTypes: roomTypesRes.data || [],
          bookingSettings: bookingSettingsRes.data
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation 
        accommodationName={data?.info.name} 
        onNavigate={scrollToSection} 
      />
      <main>
        <HeroSection accommodationName={data?.info.name} />
        <AboutSection description={data?.info.description} />
        <Suspense fallback={
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        }>
          <RoomsSection roomTypes={data?.roomTypes || []} />
          <BookingInfoSection 
            bookingSettings={data?.bookingSettings}
            checkInNotice={data?.info.check_in_notice}
          />
          <LocationSection address={data?.info.address} />
          <ReviewsSection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer 
          accommodationName={data?.info.name}
          address={data?.info.address}
        />
      </Suspense>
    </div>
  );
};

export default Index;
