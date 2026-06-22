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
  ShieldCheck,
  Sparkles,
  Clock,
  Car,
  Wifi,
  Coffee,
  Heart,
  Utensils,
  Dog,
  Baby,
  Mountain,
  Trees,
  Waves,
  Flame,
  Music,
  Snowflake,
} from "lucide-react";
import { differenceInDays, format, formatISO } from "date-fns";

import lokezeLogo from "@/assets/lakeze-portal-logo.png";

import VillaPhotoCarousel from "@/components/booking-villa/VillaPhotoCarousel";
import VillaOverviewBar from "@/components/booking-villa/VillaOverviewBar";
import VillaAvailabilityCalendar from "@/components/booking-villa/VillaAvailabilityCalendar";
import CapacityPriceLadder, {
  type CapacityOption,
} from "@/components/booking-villa/CapacityPriceLadder";
import { isSensanAccommodation } from "@/lib/sensan-pricing";
import {
  useAccommodationPackages,
  useAccommodationHolidays,
  buildPricingTableFromPackages,
  aggregateIncludesFromPackages,
  detectTierByDate,
  isPackageExcludedOnDate,
} from "@/hooks/use-accommodation-packages";

import FacilitiesSection from "@/components/FacilitiesSection";
import LocationSection from "@/components/LocationSection";
import VillaLocationCompact from "@/components/booking-villa/VillaLocationCompact";
import ReviewsSection from "@/components/ReviewsSection";
import FaqSection from "@/components/FaqSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";

// 信任標籤可選圖示對照（後台填字串 key，前台對應 lucide icon）
export const TRUST_BADGE_ICONS: Record<string, typeof ShieldCheck> = {
  "shield-check": ShieldCheck,
  shield: ShieldCheck,
  clock: Clock,
  car: Car,
  wifi: Wifi,
  coffee: Coffee,
  heart: Heart,
  utensils: Utensils,
  dog: Dog,
  baby: Baby,
  mountain: Mountain,
  trees: Trees,
  waves: Waves,
  flame: Flame,
  music: Music,
  snowflake: Snowflake,
  sparkles: Sparkles,
};
export const TRUST_BADGE_ICON_OPTIONS = Object.keys(TRUST_BADGE_ICONS);

const BookingVilla = () => {
  const { accId } = useParams<{ accId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setCurrentAccommodationId } = useAccommodation();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [bottomBarHidden, setBottomBarHidden] = useState(false);
  const [availableDateSet, setAvailableDateSet] = useState<Set<string> | null>(null);
  const [availMinPrice, setAvailMinPrice] = useState<number | null>(null);
  const [availEarliestDate, setAvailEarliestDate] = useState<string | null>(null);

  // 後台可編輯的包棟頁覆寫資料（信任標籤、Overview 標籤）+ Google 評論
  const [extras, setExtras] = useState<{
    villaTrustBadges: Array<{ icon: string; label: string }> | null;
    villaOverviewLabels: {
      rooms?: string | null;
      capacity?: string | null;
      size?: string | null;
      region?: string | null;
    } | null;
    googleRating: number | null;
    googleTotal: number | null;
    googleTopReview: { text: string; author: string } | null;
  } | null>(null);

  useEffect(() => {
    if (!accId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("villa_trust_badges, villa_overview_labels, google_reviews_cache")
        .eq("id", accId)
        .maybeSingle();
      if (cancelled || !data) return;
      const cache = data.google_reviews_cache as any;
      let topReview: { text: string; author: string } | null = null;
      if (cache?.reviews && Array.isArray(cache.reviews) && cache.reviews.length > 0) {
        const candidates = cache.reviews.filter((r: any) => r?.text && r.text.length > 5);
        if (candidates.length > 0) {
          const sorted = [...candidates].sort(
            (a: any, b: any) => (b.rating || 0) - (a.rating || 0)
          );
          const r = sorted[0];
          topReview = {
            text: String(r.text).slice(0, 70),
            author: r.authorName || "Google 使用者",
          };
        }
      }
      const badgesRaw = data.villa_trust_badges as any;
      const labelsRaw = data.villa_overview_labels as any;
      setExtras({
        villaTrustBadges:
          Array.isArray(badgesRaw) && badgesRaw.length > 0
            ? badgesRaw.filter((b: any) => b?.label)
            : null,
        villaOverviewLabels:
          labelsRaw && typeof labelsRaw === "object" ? labelsRaw : null,
        googleRating: typeof cache?.rating === "number" ? cache.rating : null,
        googleTotal: typeof cache?.totalReviews === "number" ? cache.totalReviews : null,
        googleTopReview: topReview,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [accId]);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < 6) return;
      // 下滑顯示，上滑隱藏（避免遮住內容）
      // 上滑顯示，下滑隱藏（避免遮住內容）
      if (delta > 0) setBottomBarHidden(true);
      else if (delta < 0) setBottomBarHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  // 載入該民宿的包區方案（非森山民宿透過資料驅動使用同一套階梯卡 UI）
  const { packages, loading: packagesLoading } = useAccommodationPackages(accId || null);
  const { isHolidayDate } = useAccommodationHolidays(accId || null);
  const isSensan = info ? isSensanAccommodation(info.name) : false;

  // 防呆：非森山且沒有設定任何包區方案的民宿，回到標準訂房頁
  useEffect(() => {
    if (packagesLoading) return;
    if (info && !isSensanAccommodation(info.name) && packages.length === 0) {
      const qs = searchParams.toString();
      navigate(`/booking/${info.id}${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }, [info, navigate, searchParams, packages.length, packagesLoading]);

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

  // 過濾掉「不適用日期區間」涵蓋入住日的方案；未選日期則顯示全部
  const visiblePackages = useMemo(() => {
    if (!checkIn) return packages;
    return packages.filter((p) => !isPackageExcludedOnDate(p, checkIn));
  }, [packages, checkIn]);

  const customPricingTable = useMemo(() => {
    if (visiblePackages.length === 0) return undefined;
    return buildPricingTableFromPackages(visiblePackages);
  }, [visiblePackages]);
  const customIncludes = useMemo(() => {
    if (visiblePackages.length === 0) return undefined;
    return aggregateIncludesFromPackages(visiblePackages);
  }, [visiblePackages]);
  const customIncludesTitle = useMemo(() => {
    if (visiblePackages.length === 0) return undefined;
    const count = customIncludes?.length || 0;
    return count > 0 ? `方案內容 · 含 ${count} 項` : "方案內容";
  }, [visiblePackages, customIncludes]);

  // Combined photo gallery (hero + gallery, mixed)
  const allPhotos = useMemo(() => {
    return [...heroPhotos, ...galleryPhotos].map((p: any) => ({
      id: p.id,
      photo_url: p.photo_url,
      title: p.title,
    }));
  }, [heroPhotos, galleryPhotos]);

  // Aggregate capacity stats from room types.
  // 「銷售方案」(如「12 人包區」) 為虛擬人數方案，不應計入實際房間數。
  const villaStats = useMemo(() => {
    const rts = secondaryData?.roomTypes || [];
    if (rts.length === 0) return null;
    const isVillaPlan = (r: any) =>
      /包棟|包區|whole|villa/i.test(r.name) || r.capacity >= 8;

    const realRooms = rts.filter((r: any) => !isVillaPlan(r));
    const villaPlans = rts.filter((r: any) => isVillaPlan(r));

    // 真實房間數（雙人房×3 + 四人房×3 = 6）
    const totalRooms = realRooms.length > 0
      ? realRooms.reduce((s: number, r: any) => s + (r.room_count ?? 1), 0)
      : rts.reduce((s: number, r: any) => s + (r.room_count ?? 1), 0);

    // 最少人數：取自真實房間的最小 capacity（如雙人房 = 2，但包棟通常從最小房型一間起算）
    // 此處使用「真實房間數」作為最少包棟人數（每間 1 人保底），或最小房型 capacity，取較大者
    const minRealCapacity = realRooms.length > 0
      ? Math.min(...realRooms.map((r: any) => r.capacity))
      : Math.min(...rts.map((r: any) => r.capacity));
    const minCapacity = realRooms.length > 0 ? totalRooms : minRealCapacity;

    // 最大人數：銷售方案的最大 capacity，或所有真實房間 capacity 加總
    const maxFromVilla = villaPlans.length > 0
      ? Math.max(...villaPlans.map((r: any) => r.capacity))
      : 0;
    const maxFromReal = realRooms.reduce(
      (s: number, r: any) => s + r.capacity * (r.room_count ?? 1),
      0
    );
    const maxCapacity = Math.max(maxFromVilla, maxFromReal);

    const totalSize = realRooms.reduce(
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

  const handleSelectOption = (opt: CapacityOption, subPlanKey?: string) => {
    const params = new URLSearchParams();
    params.set("acc", info.id);
    params.set("roomId", opt.roomTypeId);
    if (subPlanKey) params.set("plan", subPlanKey);
    if (checkInStr) params.set("checkIn", checkInStr);
    if (checkOutStr) params.set("checkOut", checkOutStr);
    const adultsStr = searchParams.get("adults");
    const childrenStr = searchParams.get("children");
    const roomsStr = searchParams.get("rooms");
    if (adultsStr) params.set("adults", adultsStr);
    if (childrenStr) params.set("children", childrenStr);
    if (roomsStr) params.set("rooms", roomsStr);
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
    <div className={`min-h-screen bg-stone-50 pb-24 ${themeClass}`}>
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
        averageRating={extras?.googleRating ?? undefined}
        reviewCount={extras?.googleTotal ?? undefined}
      />


      {/* ── Sticky Header (Trip.com style: floating over hero on scroll-top) ── */}
      <header
        className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className="max-w-3xl mx-auto h-16 sm:h-20 md:h-24 px-3 flex items-center justify-between gap-2"
          style={{
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 shrink-0"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Link to="/booking" className="flex items-center gap-1.5 min-w-0 flex-1 justify-center overflow-hidden">
            <img
              src={lokezeLogo}
              alt="Lakeze 人客多"
              className="h-12 sm:h-16 md:h-24 max-h-full max-w-full w-auto object-contain"
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

        {/* ── 2. Title + Region + Rating（Trip.com 風格） ── */}
        <section className="px-4 pt-4 pb-3 bg-card border-b border-border/40">
          <h1 className="text-[22px] font-bold text-foreground leading-tight flex items-center gap-2 flex-wrap">
            <span>{info.name}</span>
            {extras?.googleRating != null && (
              <span className="inline-flex items-center gap-0.5 text-[hsl(35,95%,55%)] text-base leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
              </span>
            )}
          </h1>

          {info.address && (
            <p className="text-[13px] text-muted-foreground mt-1.5 leading-snug">
              {info.address}
              <a
                href="#location"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("location")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="ml-2 underline text-foreground/90 font-medium whitespace-nowrap"
              >
                在地圖上檢視
              </a>
            </p>
          )}

          {extras?.googleRating != null && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-white text-[13px] font-bold"
                style={{ background: "hsl(217, 96%, 57%)" }}
              >
                {extras.googleRating.toFixed(1)}/10
              </span>
              <span className="text-[14px] font-semibold" style={{ color: "hsl(217, 96%, 57%)" }}>
                超棒
              </span>
              {extras.googleTotal != null && extras.googleTotal > 0 && (
                <button
                  onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-[13px] underline"
                  style={{ color: "hsl(217, 96%, 57%)" }}
                >
                  {extras.googleTotal} 則評論
                </button>
              )}
            </div>
          )}

          {extras?.googleTopReview && (
            <p className="mt-1.5 text-[14px] text-foreground/85 leading-snug">
              "{extras.googleTopReview.text}"
            </p>
          )}
        </section>

        {/* ── 2b. Feature icons grid（從 facilities 取前 6 個關鍵字配對 icon） ── */}
        {(() => {
          const all = secondaryData?.facilities || [];
          if (all.length === 0) return null;
          const matchers: { kw: string[]; icon: typeof Wifi; label: string }[] = [
            { kw: ["wi-fi", "wifi", "無線"], icon: Wifi, label: "免費 Wi-Fi" },
            { kw: ["停車", "parking"], icon: Car, label: "免費停車" },
            { kw: ["早餐", "breakfast", "餐"], icon: Utensils, label: "餐飲服務" },
            { kw: ["山景", "景觀", "view"], icon: Mountain, label: "景觀房" },
            { kw: ["陽台", "balcony", "庭院"], icon: Trees, label: "陽台/庭院" },
            { kw: ["親子", "嬰", "兒童", "family", "baby"], icon: Baby, label: "親子友善" },
            { kw: ["寵物", "pet", "dog"], icon: Dog, label: "寵物友善" },
            { kw: ["泳池", "水", "spa", "pool"], icon: Waves, label: "戲水設施" },
            { kw: ["bbq", "烤", "火"], icon: Flame, label: "烤肉/壁爐" },
            { kw: ["音響", "ktv", "music"], icon: Music, label: "影音設備" },
            { kw: ["空調", "冷氣", "ac"], icon: Snowflake, label: "空調" },
          ];
          const picked: { icon: typeof Wifi; label: string }[] = [];
          const usedLabels = new Set<string>();
          for (const f of all) {
            const name = (f.facility_name || "").toLowerCase();
            for (const m of matchers) {
              if (usedLabels.has(m.label)) continue;
              if (m.kw.some((k) => name.includes(k))) {
                picked.push({ icon: m.icon, label: m.label });
                usedLabels.add(m.label);
                break;
              }
            }
            if (picked.length >= 6) break;
          }
          // 補入完善服務 / 即時確認 預設 chip 讓畫面更滿
          if (picked.length < 6) picked.unshift({ icon: Heart, label: "完善服務" });
          if (picked.length < 6) picked.push({ icon: ShieldCheck, label: "即時確認" });
          if (picked.length === 0) return null;
          return (
            <section className="px-4 py-3 bg-card border-b border-border/40">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {picked.slice(0, 6).map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <div key={i} className="flex items-center gap-2 text-[13px] text-foreground/85">
                      <Icon className="h-4 w-4 shrink-0" style={{ color: "hsl(40, 95%, 50%)" }} />
                      <span className="line-clamp-1">{p.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* ── 2c. 聯繫住宿 row ── */}
        {info.phone && (
          <section className="px-4 py-3 bg-card border-b border-border/40">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "hsl(217, 96%, 57%)" }}
              >
                <Phone className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-foreground leading-tight">聯繫住宿</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">房東通常在 60 分鐘內回覆</p>
              </div>
              <a
                href={`tel:${info.phone}`}
                className="text-[13px] font-medium underline whitespace-nowrap"
                style={{ color: "hsl(217, 96%, 57%)" }}
              >
                聯絡人
              </a>
            </div>
          </section>
        )}

        {/* ── 3. Villa Overview ── */}
        {villaStats && (
          <VillaOverviewBar
            totalRooms={villaStats.totalRooms}
            minCapacity={villaStats.minCapacity}
            maxCapacity={villaStats.maxCapacity}
            totalSize={villaStats.totalSize}
            region={region}
            labels={extras?.villaOverviewLabels}
          />
        )}

        {/* ── Trust signals row（後台未設定則隱藏） ── */}
        {extras?.villaTrustBadges && extras.villaTrustBadges.length > 0 && (
          <section className="px-4 py-2.5 bg-card border-b border-border/40">
            <div className="flex items-center justify-around gap-1 text-[11px] text-muted-foreground">
              {extras.villaTrustBadges.map((b, i) => {
                const Icon = TRUST_BADGE_ICONS[b.icon] || ShieldCheck;
                return (
                  <span key={i} className="flex items-center gap-1">
                    <Icon className="h-3.5 w-3.5 text-emerald-600" />
                    {b.label}
                  </span>
                );
              })}
            </div>
          </section>
        )}


        {/* ── Price anchor banner（今天 ~ 下個月月底實際空房，剩 <10 天才顯示 · 促銷風格） ── */}
        {(() => {
          if (!availableDateSet) return null;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          // 抓到「下個月月底」（例：今天 5/18 → 6/30）
          const horizon = new Date(today.getFullYear(), today.getMonth() + 2, 0);
          horizon.setHours(0, 0, 0, 0);
          const horizonLabel = `${horizon.getMonth() + 1}/${horizon.getDate()}`;
          const upcoming = Array.from(availableDateSet)
            .filter((d) => {
              const dt = new Date(d + "T00:00:00");
              return dt >= today && dt <= horizon;
            })
            .sort();
          // 只在剩 <10 天可訂時顯示（促銷／快訊感）
          if (upcoming.length === 0 || upcoming.length >= 10) return null;
          const earliestStr = availEarliestDate && upcoming.includes(availEarliestDate)
            ? availEarliestDate
            : upcoming[0];
          const earliestDate = new Date(earliestStr + "T00:00:00");
          const daysUntil = Math.max(
            0,
            Math.round((earliestDate.getTime() - today.getTime()) / 86400000),
          );
          // 只用空房日曆算出的最低實際售價（含庫存覆寫 / 專案價 / 平假日邏輯），不再 fallback base_price
          const price = availMinPrice;
          const isHot = upcoming.length <= 7;
          const weekdayLabel = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][earliestDate.getDay()];
          return (
            <section className="px-4 pt-3">
              <div
                className="relative overflow-hidden rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-sm"
                style={{
                  background:
                    "linear-gradient(115deg, hsl(12, 90%, 55%) 0%, hsl(20, 95%, 58%) 55%, hsl(35, 95%, 60%) 100%)",
                  border: "1px solid hsl(15, 80%, 50%)",
                }}
              >
                {/* shimmer */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 opacity-40"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                    animation: "villaShimmer 2.6s linear infinite",
                  }}
                />
                <style>{`@keyframes villaShimmer{0%{transform:translateX(0)}100%{transform:translateX(500%)}}`}</style>

                <div className="min-w-0 relative">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wider px-1.5 py-0.5 rounded bg-white/95 text-[hsl(0,80%,45%)]">
                      <Sparkles className="h-3 w-3" />
                      限時
                    </span>
                    <span className="text-[10px] font-semibold text-white/95">
                      {horizonLabel} 前僅剩 <span className="font-extrabold">{upcoming.length}</span> 天可訂
                    </span>
                  </div>
                  <p className="text-[13px] font-bold leading-tight text-white drop-shadow-sm">
                    最快 {format(earliestDate, "M/d")}（{weekdayLabel}）
                    {daysUntil === 0 ? "・今天" : daysUntil <= 3 ? `・${daysUntil} 天後` : ""}
                    {price ? (
                      <>
                        {" · "}
                        <span className="text-white">NT$</span>
                        <span className="text-[15px]">{price.toLocaleString()}</span>
                        <span className="text-[11px] font-normal text-white/90"> 起 / 晚</span>
                      </>
                    ) : null}
                  </p>
                </div>

                {isHot && (
                  <span className="relative shrink-0 inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-white text-[hsl(0,80%,45%)] shadow animate-pulse">
                    🔥 熱訂中
                  </span>
                )}
              </div>
            </section>
          );
        })()}

        {/* ── 4. 即時空房日曆 ── */}
        <VillaAvailabilityCalendar
          accommodationId={info.id}
          selectedDate={checkIn}
          onAvailabilityComputed={({ dates, minPrice, earliestDate }) => {
            setAvailableDateSet(dates);
            setAvailMinPrice(minPrice);
            setAvailEarliestDate(earliestDate);
          }}
          onSelectDate={(d) => {
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            const fmt = (x: Date) => formatISO(x, { representation: "date" });
            const params = new URLSearchParams(searchParams);
            params.set("checkIn", fmt(d));
            params.set("checkOut", fmt(next));
            setSearchParams(params, { replace: true });
            // 滾動到「選擇人數方案」
            requestAnimationFrame(() => {
              document
                .getElementById("capacity-price-section")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />

        {/* ── 5. Capacity × Price Plans (核心 CTA) ── Trip.com style ── */}
        <section id="capacity-price-section" className="py-4 bg-background">
          <h2 className="text-[20px] font-bold text-foreground px-4 mb-3">
            選擇您的房間
          </h2>

          {/* 日期 + 人數 chip card */}
          <div className="px-4 mb-3">
            <button
              onClick={() => navigate("/booking")}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between text-left active:scale-[0.99] transition"
            >
              <span className="flex items-center gap-2 text-[14px] text-foreground font-medium">
                <span className="inline-block w-4 h-4 border border-current rounded-sm" />
                {checkIn && checkOut ? (
                  <>
                    {format(checkIn, "M月d日")}–{format(checkOut, "M月d日")}
                  </>
                ) : (
                  <span className="text-muted-foreground">選擇日期</span>
                )}
              </span>
              <span className="flex items-center gap-3 text-[14px] text-foreground font-medium">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3.5 h-3.5 border border-current rounded-sm" />
                  {Math.max(1, parseInt(searchParams.get("rooms") || "1", 10) || 1)}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {Math.max(1, parseInt(searchParams.get("adults") || "0", 10) || 1)}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Baby className="w-3.5 h-3.5" />
                  {Math.max(0, parseInt(searchParams.get("children") || "0", 10) || 0)}
                </span>
              </span>
            </button>
          </div>

          {/* Discount hint banner（有早鳥/折扣方案才顯示） */}
          {visiblePackages.some((p) => p.original_price && p.original_price > p.sale_price) && (() => {
            const maxDiscount = Math.max(
              ...visiblePackages
                .filter((p) => p.original_price && p.original_price > p.sale_price)
                .map((p) => (p.original_price as number) - p.sale_price)
            );
            return (
              <div className="px-4 mb-3">
                <div className="rounded-xl border border-[hsl(330,80%,90%)] bg-card px-3.5 py-2.5 flex items-center gap-2.5">
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white text-[11px] font-bold shrink-0"
                    style={{ background: "hsl(335, 80%, 55%)" }}
                  >
                    %
                  </span>
                  <p className="flex-1 text-[13px] font-semibold text-foreground leading-snug">
                    最高 NT${maxDiscount.toLocaleString()} 折扣
                    <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                      精選民宿優惠
                    </span>
                  </p>
                  <button
                    onClick={() => {
                      const el = document.querySelector('[data-capacity-list]');
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="text-[13px] font-semibold text-white px-3 py-1.5 rounded-md whitespace-nowrap"
                    style={{ background: "hsl(217, 96%, 57%)" }}
                  >
                    全部領取
                  </button>
                </div>
              </div>
            );
          })()}

          <div data-capacity-list>
            <CapacityPriceLadder
              roomTypes={secondaryData?.roomTypes || []}
              onSelect={handleSelectOption}
              nights={nights}
              checkIn={checkIn}
              selectedGuestCount={
                searchParams.get("adults")
                  ? parseInt(searchParams.get("adults") || "0", 10) || null
                  : null
              }
              pricingTable={customPricingTable}
              planIncludes={customIncludes}
              includesTitle={customIncludesTitle}
              enableFewPeople={isSensan || packages.some((p) => (p.tags || []).some((t) => t === "early_bird" || t === "few_people"))}
              isSensan={isSensan}
              isHolidayDate={isHolidayDate}
            />
          </div>
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

        {/* ── 6. Room Types (Trip.com 風格圖片拼貼卡片) ── */}
        {(secondaryData?.roomTypes?.length || 0) > 0 && (
          <section className="py-4 bg-background">
            <h2 className="text-[20px] font-bold text-foreground px-4 mb-3">
              房間樣貌
            </h2>
            <div className="px-4 space-y-4">
              {secondaryData!.roomTypes.map((room: any) => {
                const photos = room.room_photos || [];
                const main = photos[0]?.photo_url;
                const side = photos[1]?.photo_url;
                return (
                  <Card
                    key={room.id}
                    className="overflow-hidden border-border/60 shadow-sm"
                  >
                    {/* image collage */}
                    <div className="relative flex gap-1 h-[180px] bg-muted">
                      <div className="flex-[2] overflow-hidden">
                        {main ? (
                          <img
                            src={main}
                            alt={room.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full" style={{ background: "hsl(25, 60%, 95%)" }} />
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden relative">
                        {side ? (
                          <img
                            src={side}
                            alt={`${room.name} 2`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full" style={{ background: "hsl(25, 50%, 92%)" }} />
                        )}
                        {photos.length > 0 && (
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/55 backdrop-blur text-white text-[11px] font-medium">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
                            {photos.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* body */}
                    <div className="p-3.5">
                      <button
                        onClick={() => {
                          document
                            .getElementById("capacity-price-section")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="flex items-center gap-1 text-[15px] font-bold text-foreground"
                      >
                        {room.name}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {room.capacity} 人
                        </span>
                        {room.size_sqm && (
                          <span className="flex items-center gap-1">
                            <Mountain className="h-3.5 w-3.5" />
                            {room.size_sqm} 坪
                          </span>
                        )}
                        {(room.view || (info as any).type) && (
                          <span className="flex items-center gap-1">
                            <Trees className="h-3.5 w-3.5" />
                            {room.view || "景觀房"}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Wifi className="h-3.5 w-3.5" />
                          免費 Wi-Fi
                        </span>
                      </div>

                      {room.description && (
                        <p className="mt-2 text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {room.description}
                        </p>
                      )}

                      {/* CTA row */}
                      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-3">
                        {typeof room.base_price === "number" && (
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground leading-none">起價</p>
                            <p
                              className="font-bold text-[18px] leading-tight tabular-nums"
                              style={{ color: "hsl(217, 96%, 57%)" }}
                            >
                              NT${room.base_price.toLocaleString()}
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={() => {
                            document
                              .getElementById("capacity-price-section")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          className="h-10 px-5 text-[14px] font-bold text-white rounded-md"
                          style={{ background: "hsl(217, 96%, 57%)" }}
                        >
                          查看方案
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
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
          <div id="location">
            <LocationSection
              address={info.address}
              locationInfo={secondaryData?.locationInfo}
            />
          </div>
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
          <div id="reviews">
            <ReviewsSection accommodationId={info.id} />
          </div>
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
        className={`fixed left-0 right-0 z-[60] bg-white/95 backdrop-blur border-t border-border px-4 py-2.5 sm:hidden transition-transform duration-300 ${bottomBarHidden ? "translate-y-full" : "translate-y-0"}`}
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom))", paddingBottom: "0.625rem" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {(() => {
              let candidatePkgs = visiblePackages;
              if (visiblePackages.length > 0 && checkIn) {
                const tier = detectTierByDate(checkIn, isHolidayDate(checkIn));
                const tierPkgs = visiblePackages.filter((p) => p.applicable_tiers.includes(tier));
                if (tierPkgs.length > 0) candidatePkgs = tierPkgs;
              }
              const cheapestPkg = candidatePkgs.length > 0
                ? candidatePkgs.reduce((min, p) => (p.sale_price < min.sale_price ? p : min), candidatePkgs[0])
                : null;
              const pkgMin = cheapestPkg?.sale_price ?? null;
              const roomMin = (secondaryData?.roomTypes?.length || 0) > 0
                ? Math.min(...secondaryData!.roomTypes.map((r: any) => r.base_price))
                : null;
              const display = pkgMin ?? roomMin;
              const guestCount = cheapestPkg?.guest_count ?? villaStats?.minCapacity ?? null;
              const parts: string[] = [];
              if (checkIn && checkOut) parts.push(`共 ${nights} 晚`);
              parts.push(guestCount ? `包棟${guestCount}人起` : "包棟起");
              return (
                <>
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">
                    {parts.join(" · ")}
                  </p>
                  {display != null && (
                    <p
                      className="font-bold text-lg leading-none tabular-nums"
                      style={{ color: "hsl(217, 96%, 57%)" }}
                    >
                      NT${display.toLocaleString()}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          <Button
            className="h-11 px-6 text-[15px] font-bold text-white rounded-md shadow-md active:scale-95 transition-transform"
            style={{ background: "hsl(217, 96%, 57%)" }}
            onClick={() => {
              document
                .getElementById("capacity-price-section")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            選擇房型
          </Button>
        </div>
      </div>

      <BookingFooter />
      <MobileBottomNav />
    </div>
  );
};

export default BookingVilla;
