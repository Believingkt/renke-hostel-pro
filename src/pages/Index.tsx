import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import RoomsSection from "@/components/RoomsSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import LocationSection from "@/components/LocationSection";
import ReviewsSection from "@/components/ReviewsSection";
import Footer from "@/components/Footer";

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
  const [showRooms, setShowRooms] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  useEffect(() => {
    fetchAllData();
    
    // 延迟加载非关键内容
    const roomsTimer = setTimeout(() => setShowRooms(true), 200);
    const reviewsTimer = setTimeout(() => setShowReviews(true), 400);
    
    return () => {
      clearTimeout(roomsTimer);
      clearTimeout(reviewsTimer);
    };
  }, []);

  const fetchAllData = async () => {
    try {
      // 一次性獲取所有必要資料
      const { data: infoData } = await supabase
        .from("accommodation_info")
        .select("id, name, description, address, check_in_notice")
        .maybeSingle();
      
      if (infoData) {
        // 先设置基本信息，立即显示页面
        setData({
          info: infoData,
          roomTypes: [],
          bookingSettings: null
        });
        
        // 在后台加载其他数据
        Promise.all([
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
        ]).then(([roomTypesRes, bookingSettingsRes]) => {
          setData(prev => prev ? {
            ...prev,
            roomTypes: roomTypesRes.data || [],
            bookingSettings: bookingSettingsRes.data
          } : null);
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen">
      <Navigation 
        accommodationName={data?.info.name || "森山寫造"} 
        onNavigate={scrollToSection} 
      />
      <main>
        <HeroSection accommodationName={data?.info.name || "森山寫造"} />
        <AboutSection description={data?.info.description} />
        {showRooms && <RoomsSection roomTypes={data?.roomTypes || []} />}
        <BookingInfoSection 
          bookingSettings={data?.bookingSettings}
          checkInNotice={data?.info.check_in_notice}
        />
        <LocationSection address={data?.info.address} />
        {showReviews && <ReviewsSection />}
      </main>
      <Footer 
        accommodationName={data?.info.name}
        address={data?.info.address}
      />
    </div>
  );
};

export default Index;
