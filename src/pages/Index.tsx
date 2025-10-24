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

  useEffect(() => {
    // 在背景异步加载数据，不阻塞页面渲染
    const loadData = async () => {
      try {
        const { data: infoData } = await supabase
          .from("accommodation_info")
          .select("id, name, description, address, check_in_notice")
          .maybeSingle();
        
        if (infoData) {
          // 先设置基本信息
          setData({
            info: infoData,
            roomTypes: [],
            bookingSettings: null
          });
          
          // 继续加载其他数据
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
      }
    };

    // 使用 requestIdleCallback 在浏览器空闲时加载
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => loadData());
    } else {
      setTimeout(loadData, 0);
    }
  }, []);

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
        <RoomsSection roomTypes={data?.roomTypes || []} />
        <BookingInfoSection 
          bookingSettings={data?.bookingSettings}
          checkInNotice={data?.info.check_in_notice}
        />
        <LocationSection address={data?.info.address} />
        <ReviewsSection />
      </main>
      <Footer 
        accommodationName={data?.info.name}
        address={data?.info.address}
      />
    </div>
  );
};

export default Index;
