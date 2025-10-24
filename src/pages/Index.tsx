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

interface AccommodationInfo {
  name: string;
  description: string;
}

const Index = () => {
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);

  useEffect(() => {
    fetchAccommodationData();
  }, []);

  const fetchAccommodationData = async () => {
    const { data } = await supabase
      .from("accommodation_info")
      .select("name, description")
      .maybeSingle();
    
    if (data) {
      setAccommodationInfo(data);
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
        accommodationName={accommodationInfo?.name} 
        onNavigate={scrollToSection} 
      />
      <main>
        <HeroSection accommodationName={accommodationInfo?.name} />
        <AboutSection description={accommodationInfo?.description} />
        <Suspense fallback={<div className="py-20 text-center text-muted-foreground">載入中...</div>}>
          <RoomsSection />
          <BookingInfoSection />
          <LocationSection />
          <ReviewsSection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
};

export default Index;
