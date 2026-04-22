import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAccommodationCache } from "@/hooks/use-accommodation-cache";
import { usePageAnalytics } from "@/hooks/use-page-analytics";
import { getThemeClass } from "@/constants/themes";
import { SEOHead } from "@/components/SEOHead";
import { StructuredData } from "@/components/StructuredData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  User,
  LogIn,
  MapPin,
  Star,
  Phone,
  Share2,
  ChevronRight,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";

import lokezeLogo from "@/assets/lakeze-portal-logo.png";

import VillaPhotoCarousel from "@/components/booking-villa/VillaPhotoCarousel";
import VillaOverviewBar from "@/components/booking-villa/VillaOverviewBar";
import CapacityPriceLadder, {
  type CapacityOption,
} from "@/components/booking-villa/CapacityPriceLadder";

import FacilitiesSection from "@/components/FacilitiesSection";
import LocationSection from "@/components/LocationSection";
import ReviewsSection from "@/components/ReviewsSection";
import FaqSection from "@/components/FaqSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";

const BookingVilla = () => {
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

  const themeClass = info?.theme_preset ? getThemeClass(info.theme_preset) : "";

  usePageAnalytics({ accommodationId: accId || null, enabled: !!accId && !!info });

  useLayoutEffect(() => {
    if (info) {
      const title = (info as any).seo_title || info.og_title || info.name;
      if (title && document.title !== title) document.title = title;
    }
  }, [(info as any)?.seo_title, info?.og_title, info?.name]);

  useEffect(() => {
    if (accId) setCurrentAccommodationId(accId);
  }, [accId, setCurrentAccommodationId]);

  // Auth state for header
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

  // Date params from URL
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");
  const checkIn = checkInStr ? new Date(checkInStr) : null;
  const checkOut = checkOutStr ? new Date(checkOutStr) : null;
  const nights =
    checkIn && checkOut ? Math.max(1, differenceInDays(checkOut, checkIn)) : 1;

  // Combined photo gallery (hero + gallery, mixed)
  const allPhotos = useMemo(() => {
    return [...heroPhotos, ...galleryPhotos].map((p: any) => ({
      id: p.id,
      photo_url: p.photo_url,
      title: p.title,
    }));
  }, [heroPhotos, galleryPhotos]);

  // Aggregate capacity stats from room types
  const villaStats = useMemo(() => {
    const rts = secondaryData?.roomTypes || [];
    if (rts.length === 0) return null;
    const totalRooms = rts.reduce(
      (s, r) => s + (r.room_count ?? 1),
      0
    );
    const minCapacity = Math.min(...rts.map((r: any) => r.capacity));
    const maxCapacity = rts.reduce(
      (s: number, r: any) => s + r.capacity * (r.room_count ?? 1),
      0
    );
    const totalSize = rts.reduce(
      (s: number, r: any) => s + (r.size_sqm || 0) * (r.room_count ?? 1),
      0
    );
    return {
      totalRooms,
      minCapacity,
      maxCapacity,
      totalSize: totalSize > 0 ? totalSize : null,
    };
  }, [secondaryData]);

  if (isLoading) return null;

  if (dataError || !info) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center px-6">
          <p className="text-lg font-semibold text-destructive mb-2">
            {dataError || "無法載入資料"}
          </p>
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

  const handleSelectOption = (opt: CapacityOption) => {
    const params = new URLSearchParams();
    params.set("acc", info.id);
    params.set("roomId", opt.roomTypeId);
    if (checkInStr) params.set("checkIn", checkInStr);
    if (checkOutStr) params.set("checkOut", checkOutStr);
    navigate(`/book?${params.toString()}`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: info.name,
          text: info.description || info.name,
          url: window.location.href,
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const region =
    [info.address ? null : (info as any).region_1, (info as any).region_2]
      .filter(Boolean)
      .join(" ") || (info as any).region_1 || null;

  return (
    <div className={`min-h-screen bg-background pb-24 ${themeClass}`}>
      <SEOHead
        title={(info as any).seo_title || info.og_title || info.name}
        description={
          (info as any).seo_description || info.og_description || info.description || ""
        }
        keywords={
          (info as any).meta_keywords
            ? (info as any).meta_keywords
                .split(",")
                .map((k: string) => k.trim())
                .filter(Boolean)
            : [info.name, "包棟", "民宿", "住宿"]
        }
        image={
          info.og_image_url ||
          heroPhotos?.[0]?.photo_url ||
          galleryPhotos?.[0]?.photo_url
        }
      />
      <StructuredData
        accommodationInfo={info}
        roomTypes={secondaryData?.roomTypes || []}
        averageRating={4.8}
        reviewCount={4}
      />

      {/* ── Sticky Header (Trip.com style: floating over hero on scroll-top) ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto h-12 px-2 flex items-center justify-between gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 shrink-0"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Link to="/booking" className="flex items-center gap-1.5 min-w-0">
            <img
              src={lokezeLogo}
              alt="Lakeze 人客多"
              className="h-12 object-contain"
            />
          </Link>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="h-9 w-9"
              aria-label="分享"
            >
              <Share2 className="h-4.5 w-4.5" />
            </Button>
            {isLoggedIn ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/member/profile")}
                className="h-9 w-9"
                aria-label={memberName || "會員中心"}
              >
                <User className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate("/member/auth")}
                className="h-8 px-2.5 text-xs gap-1 rounded-full text-white"
                style={{ background: "hsl(25, 70%, 55%)" }}
              >
                <LogIn className="h-3.5 w-3.5" />
                登入
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto">
        {/* ── 1. Photo Carousel (mixed hero + gallery) ── */}
        <VillaPhotoCarousel photos={allPhotos} accommodationName={info.name} />

        {/* ── 2. Title + Region + Rating ── */}
        <section className="px-4 py-3.5 bg-card border-b border-border/40">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h1 className="text-xl font-bold text-foreground leading-tight flex-1">
              {info.name}
            </h1>
            <div
              className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-white text-xs font-bold"
              style={{ background: "hsl(25, 70%, 50%)" }}
            >
              <Star className="h-3 w-3 fill-current" />
              4.8
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(info as any).type && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-border/60"
              >
                {(info as any).type}
              </Badge>
            )}
            {info.address && (
              <span className="flex items-center gap-0.5 line-clamp-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {info.address}
              </span>
            )}
          </div>
        </section>

        {/* ── 3. Villa Overview (rooms / capacity / size) ── */}
        {villaStats && (
          <VillaOverviewBar
            totalRooms={villaStats.totalRooms}
            minCapacity={villaStats.minCapacity}
            maxCapacity={villaStats.maxCapacity}
            totalSize={villaStats.totalSize}
            region={region}
          />
        )}

        {/* ── 4. Capacity × Price Plans (核心 CTA) ── */}
        <section className="py-4 bg-background">
          <div className="px-4 mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">
                選擇人數方案
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                整棟包棟 · 依入住人數選擇對應方案
                {checkIn && checkOut && (
                  <>
                    {" · "}
                    {format(checkIn, "MM/dd")}–{format(checkOut, "MM/dd")}
                  </>
                )}
              </p>
            </div>
            {!checkIn && (
              <button
                onClick={() => navigate("/booking")}
                className="text-[11px] font-medium underline text-muted-foreground"
              >
                選日期
              </button>
            )}
          </div>
          <CapacityPriceLadder
            roomTypes={secondaryData?.roomTypes || []}
            onSelect={handleSelectOption}
            nights={nights}
          />
        </section>

        {/* ── 5. About / Description ── */}
        {info.description && (
          <section className="px-4 py-4 bg-card border-y border-border/40">
            <h2 className="text-base font-bold text-foreground mb-2">關於這個空間</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {info.description}
            </p>
          </section>
        )}

        {/* ── 6. Room Types (showcase, not pricing) ── */}
        {(secondaryData?.roomTypes?.length || 0) > 0 && (
          <section className="py-4">
            <h2 className="text-base font-bold text-foreground px-4 mb-3">
              房間樣貌
            </h2>
            <div className="px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-none">
              {secondaryData!.roomTypes.map((room: any) => (
                <Card
                  key={room.id}
                  className="snap-start shrink-0 w-[72%] sm:w-64 overflow-hidden border-border/60"
                >
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    {room.room_photos?.[0] ? (
                      <img
                        src={room.room_photos[0].photo_url}
                        alt={room.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full" style={{ background: "hsl(25, 60%, 95%)" }} />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm text-foreground line-clamp-1">
                      {room.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {room.capacity} 人 {room.size_sqm ? `· ${room.size_sqm} 坪` : ""}
                    </p>
                    {room.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed">
                        {room.description}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ── 7. Facilities ── */}
        {info.show_facilities_section !== false &&
          (secondaryData?.facilities?.length || 0) > 0 && (
            <FacilitiesSection facilities={secondaryData!.facilities} />
          )}

        {/* ── 8. Location ── */}
        {info.show_location_section !== false && (
          <LocationSection
            address={info.address}
            locationInfo={secondaryData?.locationInfo}
          />
        )}

        {/* ── 9. Booking Info / 須知 ── */}
        {info.show_booking_info_section !== false && (
          <BookingInfoSection
            bookingSettings={secondaryData?.bookingSettings}
            checkInNotice={info.check_in_notice}
            customSections={secondaryData?.customBookingSections}
          />
        )}

        {/* ── 10. Reviews ── */}
        {info.show_reviews_section !== false && (
          <ReviewsSection accommodationId={info.id} />
        )}

        {/* ── 11. FAQ ── */}
        {info.show_faq_section !== false && (
          <FaqSection accommodationId={info.id} />
        )}

        {/* Contact callout */}
        {info.phone && (
          <section className="px-4 py-4">
            <Card className="p-3 flex items-center gap-3 border-border/60">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "hsl(25, 70%, 95%)" }}
              >
                <Phone className="h-4 w-4" style={{ color: "hsl(25, 70%, 45%)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">需要協助？直接聯絡民宿</p>
                <a
                  href={`tel:${info.phone}`}
                  className="font-semibold text-sm text-foreground"
                >
                  {info.phone}
                </a>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </section>
        )}
      </main>

      {/* ── Sticky Bottom Action Bar (mobile-first) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-border px-4 py-2.5 sm:hidden"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none mb-0.5">
              {checkIn && checkOut ? `共 ${nights} 晚 · 包棟起` : "包棟起"}
            </p>
            {villaStats &&
              (secondaryData?.roomTypes?.length || 0) > 0 && (
                <p
                  className="font-bold text-base leading-none"
                  style={{ color: "hsl(0, 75%, 50%)" }}
                >
                  NT$
                  {Math.min(
                    ...secondaryData!.roomTypes.map((r: any) => r.base_price)
                  ).toLocaleString()}
                </p>
              )}
          </div>
          <Button
            className="h-11 px-6 text-sm font-bold text-white rounded-full"
            style={{ background: "hsl(25, 70%, 50%)" }}
            onClick={() => {
              document
                .querySelector('section [class*="space-y-2"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            選擇人數方案
          </Button>
        </div>
      </div>

      <BookingFooter />
      <MobileBottomNav />
    </div>
  );
};

export default BookingVilla;
