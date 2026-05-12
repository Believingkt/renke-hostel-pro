import { useEffect, useLayoutEffect } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAccommodationCache, DEFAULT_SECTIONS_ORDER } from "@/hooks/use-accommodation-cache";
import { usePageAnalytics } from "@/hooks/use-page-analytics";
import { getThemeClass } from "@/constants/themes";
import { SEOHead } from "@/components/SEOHead";
import { StructuredData } from "@/components/StructuredData";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";
import { Button } from "@/components/ui/button";
import { User, LogIn, ArrowLeft } from "lucide-react";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import { useState } from "react";

// Content sections (same as Index page)
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import RoomsSection from "@/components/RoomsSection";
import FacilitiesSection from "@/components/FacilitiesSection";
import PhotoGallerySection from "@/components/PhotoGallerySection";
import LocationSection from "@/components/LocationSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import ReviewsSection from "@/components/ReviewsSection";
import FaqSection from "@/components/FaqSection";
import Footer from "@/components/Footer";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";
import { CustomSectionDisplay, SingleCustomSection, CustomSection } from "@/components/CustomSectionDisplay";
import OtherChannelsSection from "@/components/OtherChannelsSection";
import PackagesSection from "@/components/PackagesSection";
import { useAccommodationPackages } from "@/hooks/use-accommodation-packages";

const BookingAccommodation = () => {
  const { accId } = useParams<{ accId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setCurrentAccommodationId } = useAccommodation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState("");

  const {
    info,
    heroPhotos,
    galleryPhotos,
    secondaryData,
    isLoading,
    error: dataError,
    refetch,
  } = useAccommodationCache(accId || null);

  const { packages } = useAccommodationPackages(accId || null);
  const hasPackages = packages.length > 0;

  const themeClass = info?.theme_preset ? getThemeClass(info.theme_preset) : '';

  usePageAnalytics({ accommodationId: accId || null, enabled: !!accId && !!info });

  useLayoutEffect(() => {
    if (info) {
      const title = (info as any).seo_title || info.og_title || info.name;
      if (title && document.title !== title) {
        document.title = title;
      }
    }
  }, [(info as any)?.seo_title, info?.og_title, info?.name]);

  useEffect(() => {
    if (accId) {
      setCurrentAccommodationId(accId);
    }
  }, [accId, setCurrentAccommodationId]);

  // If roomId is in search params, redirect to booking flow
  useEffect(() => {
    const roomId = searchParams.get("roomId");
    if (accId && roomId) {
      const params = new URLSearchParams();
      params.set("acc", accId);
      params.set("roomId", roomId);
      const checkIn = searchParams.get("checkIn");
      const checkOut = searchParams.get("checkOut");
      const adults = searchParams.get("adults");
      const children = searchParams.get("children");
      const rooms = searchParams.get("rooms");
      if (checkIn) params.set("checkIn", checkIn);
      if (checkOut) params.set("checkOut", checkOut);
      if (adults) params.set("adults", adults);
      if (children) params.set("children", children);
      if (rooms) params.set("rooms", rooms);
      navigate(`/book?${params.toString()}`, { replace: true });
    }
  }, [accId, searchParams, navigate]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        const { data: member } = await supabase
          .from("platform_members")
          .select("name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (member) setMemberName(member.name);
      }
    };
    checkAuth();
  }, []);

  if (isLoading) {
    return null;
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
      <SEOHead
        title={(info as any).seo_title || info.og_title || info.name}
        description={(info as any).seo_description || info.og_description || info.description || ""}
        keywords={
          (info as any).meta_keywords
            ? (info as any).meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
            : [info.name, "民宿", "住宿"]
        }
        image={info.og_image_url || heroPhotos?.[0]?.photo_url || galleryPhotos?.[0]?.photo_url}
      />

      <StructuredData
        accommodationInfo={info}
        roomTypes={secondaryData?.roomTypes || []}
        averageRating={4.8}
        reviewCount={4}
      />

      {/* ── BookingPortal-style Header ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/booking")}
              className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">返回</span>
            </Button>
            <Link to="/booking" className="flex items-center gap-2">
              <img src={lokezeLogo} alt="Lakeze 人客多" className="h-24 object-contain" />
            </Link>
          </div>

          <div className="hidden md:flex flex-1" />

          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/member/profile")}
                className="gap-1.5"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{memberName || "會員中心"}</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate("/member/auth")}
                className="gap-1.5 rounded-full text-white"
                style={{ background: "hsl(25, 70%, 55%)" }}
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">登入 / 註冊</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content (same as Index page layout) ── */}
      <main>
        <HeroSection
          accommodationName={info.name}
          heroMainTitle={info.hero_main_title}
          heroSubtitle={info.hero_subtitle}
          heroDescription={info.hero_description}
          heroOverlayOpacity={info.hero_overlay_opacity}
          heroAutoplayDelay={info.hero_autoplay_delay}
          heroPhotos={heroPhotos}
          compact
        />

        {(info.homepage_sections_order || DEFAULT_SECTIONS_ORDER).map((sectionKey) => {
          const sectionTitles = (info as any).homepage_section_titles || {};
          const titles = sectionTitles[sectionKey] || {};
          switch (sectionKey) {
            case 'about':
              return info.show_about_section !== false && (
                <AboutSection key="about" description={info.description} accommodationId={info.id} customTitle={titles.title} customSubtitle={titles.subtitle} />
              );
            case 'rooms':
              if (info.show_rooms_section === false) return null;
              if (hasPackages) {
                return (
                  <PackagesSection
                    key="rooms"
                    accommodationId={info.id}
                    packages={packages}
                    customTitle={titles.title}
                    customSubtitle={titles.subtitle}
                  />
                );
              }
              return (
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
              return info.show_custom_images_section !== false &&
                secondaryData?.customImageSections &&
                secondaryData.customImageSections.length > 0 && (
                <CustomSectionDisplay key="custom_images" sections={secondaryData.customImageSections} />
              );
            default:
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
        {accId && <OtherChannelsSection accommodationId={accId} />}
      </main>

      <BookingFooter />
      <MobileBottomNav />
    </div>
  );
};

export default BookingAccommodation;
