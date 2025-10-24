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
      .single();
    
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
        <RoomsSection />
        <BookingInfoSection />
        <LocationSection />
        <ReviewsSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
