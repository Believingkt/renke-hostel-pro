import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getVillaFeatureIcon } from "@/lib/villa-feature-icons";
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
  Calendar,
  BedDouble,
  ChevronDown,
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
  getPackagePriceForTier,
  isPackageExcludedOnDate,
} from "@/hooks/use-accommodation-packages";
import { resolveChildRules, evaluateChildSelection } from "@/lib/child-rules";

import FacilitiesSection from "@/components/FacilitiesSection";
import LocationSection from "@/components/LocationSection";
import VillaLocationCompact from "@/components/booking-villa/VillaLocationCompact";
import ReviewsSection from "@/components/ReviewsSection";
import FaqSection from "@/components/FaqSection";
import SimilarStaysCarousel from "@/components/booking-villa/SimilarStaysCarousel";
import BookingInfoSection from "@/components/BookingInfoSection";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";
import EditSearchSheet from "@/components/booking-villa/EditSearchSheet";
import SectionTabsNav from "@/components/booking-villa/SectionTabsNav";

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
  // 追蹤底部 MobileBottomNav 是否被滾動隱藏（與 MobileBottomNav 內部邏輯一致）
  const [navHidden, setNavHidden] = useState(false);
  const [navHeight, setNavHeight] = useState(64);
  useEffect(() => {
    let lastY = 0;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY && y > 60) setNavHidden(true);
      else setNavHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('nav.fixed.bottom-0') as HTMLElement | null;
      if (nav) setNavHeight(Math.round(nav.getBoundingClientRect().height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    const nav = document.querySelector('nav.fixed.bottom-0');
    if (nav) ro.observe(nav);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const [editSearchOpen, setEditSearchOpen] = useState(false);
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
    ratingLabel: string;
    hostResponseText: string;
    contactType: string | null;
    contactValue: string | null;
    contactLabel: string | null;
    featureTagsOverride: Array<{ icon: string; label: string }> | null;
  } | null>(null);


  useEffect(() => {
    if (!accId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select(
          "villa_trust_badges, villa_overview_labels, google_reviews_cache, villa_header_rating_override, villa_header_rating_label_override, villa_header_review_count_override, villa_header_top_review_override, villa_header_host_response_text, villa_header_feature_tags, villa_header_contact_type, villa_header_contact_value, villa_header_contact_label"
        )
        .eq("id", accId)
        .maybeSingle();
      if (cancelled || !data) return;
      const d = data as any;
      const cache = d.google_reviews_cache as any;
      let topReview: { text: string; author: string } | null = null;
      if (d.villa_header_top_review_override) {
        topReview = { text: String(d.villa_header_top_review_override), author: "" };
      } else if (cache?.reviews && Array.isArray(cache.reviews) && cache.reviews.length > 0) {
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
      const badgesRaw = d.villa_trust_badges as any;
      const labelsRaw = d.villa_overview_labels as any;
      const ratingOverride =
        typeof d.villa_header_rating_override === "number"
          ? d.villa_header_rating_override
          : d.villa_header_rating_override != null
            ? Number(d.villa_header_rating_override)
            : null;
      const totalOverride =
        typeof d.villa_header_review_count_override === "number"
          ? d.villa_header_review_count_override
          : null;
      setExtras({
        villaTrustBadges:
          Array.isArray(badgesRaw) && badgesRaw.length > 0
            ? badgesRaw.filter((b: any) => b?.label)
            : null,
        villaOverviewLabels:
          labelsRaw && typeof labelsRaw === "object" ? labelsRaw : null,
        googleRating:
          ratingOverride != null
            ? ratingOverride
            : typeof cache?.rating === "number"
              ? cache.rating
              : null,
        googleTotal:
          totalOverride != null
            ? totalOverride
            : typeof cache?.totalReviews === "number"
              ? cache.totalReviews
              : null,
        googleTopReview: topReview,
        ratingLabel: d.villa_header_rating_label_override || "超棒",
        hostResponseText:
          d.villa_header_host_response_text || "房東通常在 60 分鐘內回覆",
        contactType: d.villa_header_contact_type || null,
        contactValue: d.villa_header_contact_value || null,
        contactLabel: d.villa_header_contact_label || null,
        featureTagsOverride: Array.isArray(d.villa_header_feature_tags)
          ? (d.villa_header_feature_tags as any[])
              .filter((t) => t && t.icon && t.label)
              .slice(0, 6)
              .map((t) => ({ icon: String(t.icon), label: String(t.label) }))
          : null,
      });

    })();


    return () => {
      cancelled = true;
    };
  }, [accId]);

  // 底部 CTA bar 維持常駐顯示（緊貼下方 MobileBottomNav），不再因捲動到入住方案而隱藏


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

  // 兒童加價（與搜尋頁邏輯一致：民宿層 child_age_rules + URL 的 children/infants/toddlers）
  const childCtx = useMemo(() => {
    if (!info) return null;
    const rules = resolveChildRules((info as any).child_age_rules, null);
    const sel = {
      infants: Math.max(0, parseInt(searchParams.get("infants") || "0", 10) || 0),
      toddlers: Math.max(0, parseInt(searchParams.get("toddlers") || "0", 10) || 0),
      children: Math.max(0, parseInt(searchParams.get("children") || "0", 10) || 0),
    };
    const adultsForEval = Math.max(1, parseInt(searchParams.get("adults") || "2", 10) || 2);
    const evalResult = evaluateChildSelection(rules, sel, nights || 1, adultsForEval);
    const tierOrder: Array<"infant" | "toddler" | "child"> = ["infant", "toddler", "child"];
    const ruleLines = tierOrder
      .map((key) => {
        const count = key === "infant" ? sel.infants : key === "toddler" ? sel.toddlers : sel.children;
        if (count <= 0) return null;
        const t = rules.tiers[key];
        const fee = t.fee_per_night > 0 ? `+NT$${t.fee_per_night.toLocaleString()}/位/晚` : "免費";
        const cap = t.max_count !== null ? `（上限 ${t.max_count} 位）` : "";
        return { key, label: t.label, ageRange: `${t.min_age}-${t.max_age} 歲`, feeText: fee, capText: cap, count };
      })
      .filter(Boolean) as Array<{ key: string; label: string; ageRange: string; feeText: string; capText: string; count: number }>;
    return { evalResult, ruleLines };
  }, [info, searchParams, nights]);
  const childExtraTotal = childCtx?.evalResult.extraFeeTotal ?? 0;
  const childExtraBreakdown = childCtx?.evalResult.breakdown ?? [];
  const childRuleLines = childCtx?.ruleLines ?? [];

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

  // 頂部圖片輪播：使用「精選照片（gallery）」，若無則 fallback 使用「輪播圖（hero）」
  const allPhotos = useMemo(() => {
    const source = (galleryPhotos && galleryPhotos.length > 0) ? galleryPhotos : (heroPhotos || []);
    return source.map((p: any) => ({
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

      {/* ── Desktop Search Bar ── */}
      <div className="hidden sm:block sticky top-20 md:top-24 z-40 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-2.5">
          <button
            onClick={() => setEditSearchOpen(true)}
            className="w-full rounded-full border border-border bg-muted/40 hover:bg-muted/60 px-4 py-2.5 flex items-center justify-between text-left transition gap-4"
          >
            <span className="flex items-center gap-2 text-sm text-foreground font-medium">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {checkIn && checkOut ? (
                <>{format(checkIn, "M月d日")} – {format(checkOut, "M月d日")}</>
              ) : (
                <span className="text-muted-foreground">選擇日期</span>
              )}
            </span>
            <span className="h-5 w-px bg-border" />
            <span className="flex items-center gap-4 text-sm text-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <BedDouble className="w-4 h-4 text-muted-foreground" />
                {Math.max(1, parseInt(searchParams.get("rooms") || "1", 10) || 1)} 間
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-muted-foreground" />
                {Math.max(1, parseInt(searchParams.get("adults") || "0", 10) || 1)} 大人
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Baby className="w-4 h-4" />
                {Math.max(0, parseInt(searchParams.get("infants") || "0", 10) || 0) +
                  Math.max(0, parseInt(searchParams.get("toddlers") || "0", 10) || 0) +
                  Math.max(0, parseInt(searchParams.get("children") || "0", 10) || 0)} 兒童
              </span>
            </span>
            <span
              className="ml-auto h-9 px-5 text-sm font-bold text-white rounded-full inline-flex items-center"
              style={{ background: "hsl(25, 76%, 50%)" }}
            >
              修改搜尋
            </span>
          </button>
        </div>
      </div>

      {/* ── Section Anchor Tabs（Trip.com 風格橫向頁籤） ── */}
      <SectionTabsNav
        tabs={[
          { id: "capacity-price-section", label: "入住方案" },
          { id: "facilities", label: "設施" },
          { id: "location", label: "交通建議" },
          { id: "reviews", label: "Google 評論" },
          { id: "faq", label: "常見問題" },
          { id: "about", label: "描述" },
          { id: "policy", label: "住宿政策" },
          { id: "notice", label: "注意事項" },
          { id: "similar", label: "鄰近住宿" },
        ]}
      />


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
                style={{ background: "hsl(25, 76%, 50%)" }}
              >
                {extras.googleRating <= 5 ? `${extras.googleRating.toFixed(1)}/5` : `${extras.googleRating.toFixed(1)}/10`}
              </span>
              <span className="text-[14px] font-semibold" style={{ color: "hsl(25, 76%, 50%)" }}>
                {extras.ratingLabel}
              </span>
              {extras.googleTotal != null && extras.googleTotal > 0 && (
                <button
                  onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-[13px] underline"
                  style={{ color: "hsl(25, 76%, 50%)" }}
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

        {/* ── 2b. Feature icons grid（後台覆寫優先；否則從 facilities 關鍵字配對） ── */}
        {(() => {
          const override = extras?.featureTagsOverride;
          let picked: { icon: typeof Wifi; label: string }[] = [];
          if (override && override.length > 0) {
            picked = override.map((t) => ({
              icon: getVillaFeatureIcon(t.icon) as typeof Wifi,
              label: t.label,
            }));
          } else {
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
            if (picked.length < 6) picked.unshift({ icon: Heart, label: "完善服務" });
            if (picked.length < 6) picked.push({ icon: ShieldCheck, label: "即時確認" });
          }
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
        {(() => {
          const ctype = extras?.contactType || (info.phone ? "phone" : null);
          const cvalue = extras?.contactValue || info.phone || "";
          if (!ctype || !cvalue) return null;
          const buildHref = (type: string, val: string) => {
            const v = val.trim();
            switch (type) {
              case "phone": return `tel:${v}`;
              case "sms": return `sms:${v}`;
              case "email": return `mailto:${v}`;
              case "line":
                return v.startsWith("http") ? v : `https://line.me/R/ti/p/${encodeURIComponent(v.replace(/^@/, "@"))}`;
              case "whatsapp":
                return `https://wa.me/${v.replace(/[^0-9]/g, "")}`;
              case "url":
              default:
                return v.startsWith("http") ? v : `https://${v}`;
            }
          };
          const defaultLabels: Record<string, string> = {
            phone: "聯絡人", sms: "傳簡訊", line: "LINE 聯繫",
            whatsapp: "WhatsApp", email: "寄信", url: "前往",
          };
          const btnLabel = extras?.contactLabel || defaultLabels[ctype] || "聯絡人";
          const href = buildHref(ctype, cvalue);
          const external = ctype === "line" || ctype === "whatsapp" || ctype === "url";
          return (
            <section className="px-4 py-3 bg-card border-b border-border/40">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "hsl(25, 76%, 50%)" }}
                >
                  <Phone className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground leading-tight">聯繫住宿</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{extras?.hostResponseText || "房東通常在 60 分鐘內回覆"}</p>
                </div>
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="text-[13px] font-medium underline whitespace-nowrap"
                  style={{ color: "hsl(25, 76%, 50%)" }}
                >
                  {btnLabel}
                </a>
              </div>
            </section>
          );
        })()}


        {/* Villa Overview 已移除 */}


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


        {/* Price anchor banner 已移除 */}


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
            入住方案
          </h2>





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
              freeCancelDays={secondaryData?.bookingSettings?.free_cancel_days ?? undefined}
              childExtraTotal={childExtraTotal}
              childExtraBreakdown={childExtraBreakdown}
              childRuleLines={childRuleLines}
            />

          </div>
        </section>

        {/* ── 6. Room Types 已整合到「選擇您的房間」方案卡內的房型分配（含縮圖），此區移除 ── */}


        {/* ── 7. Facilities ── */}
        {info.show_facilities_section !== false &&
          (secondaryData?.facilities?.length || 0) > 0 && (
            <div id="facilities">
              <FacilitiesSection facilities={secondaryData!.facilities} />
            </div>
          )}

        {/* ── 8. Location ── 統一使用 compact 版本（手機 + 桌機） ── */}
        {info.show_location_section !== false && (
          <div id="location">
            <VillaLocationCompact
              address={info.address}
              locationInfo={secondaryData?.locationInfo}
              rating={extras?.googleRating ?? null}
            />
          </div>
        )}

        {/* ── 9. Reviews ── */}
        {info.show_reviews_section !== false && (
          <div id="reviews">
            <ReviewsSection accommodationId={info.id} />
          </div>
        )}

        {/* ── 10. FAQ ── */}
        {info.show_faq_section !== false && (
          <div id="faq">
            <FaqSection accommodationId={info.id} />
          </div>
        )}

        {/* ── 11. About / Description ── */}
        {info.description && (
          <section id="about" className="px-4 py-4 bg-card border-y border-border/40">
            <h2 className="text-base font-bold text-foreground mb-2">關於這個空間</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {info.description}
            </p>
          </section>
        )}

        {/* ── 12. Booking Info / 住宿政策 + 注意事項 ── */}
        {info.show_booking_info_section !== false && (
          <div id="policy">
            <BookingInfoSection
              bookingSettings={secondaryData?.bookingSettings}
              checkInNotice={info.check_in_notice}
              customSections={secondaryData?.customBookingSections}
            />
            <span id="notice" className="block" />
          </div>
        )}

        {/* ── 13. Similar stays ── */}
        <div id="similar">
          <SimilarStaysCarousel excludeId={info.id} region={region} />
        </div>



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

      {/* ── Sticky Bottom Action Bar — Premium Stacked Bar (mobile) ── */}
      <div
        className={`fixed left-0 right-0 z-[60] w-full bg-white border-t border-gray-100 sm:hidden transition-transform duration-300 ease-out ${editSearchOpen ? "pointer-events-none" : ""}`}
        style={{
          bottom: `${Math.max(0, navHeight - 1)}px`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -4px 15px rgba(0,0,0,0.05)",
          transform: editSearchOpen
            ? "translateY(120%)"
            : navHidden
              ? `translateY(${Math.max(0, navHeight - 1)}px)`
              : "translateY(0)",
        }}
      >
        <div className="flex flex-col gap-2 px-4 py-3">
          {/* 上層：搜尋修改入口 */}
          <button
            onClick={() => setEditSearchOpen(true)}
            className="w-full flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 active:scale-[0.99] transition"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              {checkIn && checkOut ? (() => {
                const roomsN = Math.max(1, parseInt(searchParams.get("rooms") || "1", 10) || 1);
                const adultsN = Math.max(1, parseInt(searchParams.get("adults") || "0", 10) || 1);
                const kidsN =
                  Math.max(0, parseInt(searchParams.get("children") || "0", 10) || 0) +
                  Math.max(0, parseInt(searchParams.get("toddlers") || "0", 10) || 0) +
                  Math.max(0, parseInt(searchParams.get("infants") || "0", 10) || 0);
                return (
                  <>
                    {format(checkIn, "M/d")}–{format(checkOut, "M/d")}
                    {" · "}{roomsN}房
                    {" · "}{adultsN}大
                    {kidsN > 0 && <>{" · "}{kidsN}小</>}

                  </>
                );
              })() : (

                <span>選擇日期與人數</span>
              )}
            </span>
            <span className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: "#F08A3E" }}>
              修改
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* 下層：價格與主行動呼籲 */}
          <div className="flex justify-between items-center w-full">
            <div className="min-w-0">
              {(() => {
                let candidatePkgs = visiblePackages;
                if (visiblePackages.length > 0 && checkIn) {
                  const tier = detectTierByDate(checkIn, isHolidayDate(checkIn));
                  const tierPkgs = visiblePackages.filter((p) => p.applicable_tiers.includes(tier));
                  if (tierPkgs.length > 0) candidatePkgs = tierPkgs;
                }
                const searchAdults = Math.max(1, parseInt(searchParams.get("adults") || "0", 10) || 0);
                const totalGuests = searchAdults;
                const fitPkgs = candidatePkgs.filter((p) => (p.guest_count ?? 0) >= totalGuests);
                const pickFrom = fitPkgs.length > 0
                  ? fitPkgs.reduce((min, p) => (p.guest_count < min.guest_count ? p : min), fitPkgs[0])
                  : (candidatePkgs.length > 0
                      ? candidatePkgs.reduce((max, p) => ((p.guest_count ?? 0) > (max.guest_count ?? 0) ? p : max), candidatePkgs[0])
                      : null);
                const currentTier = checkIn ? detectTierByDate(checkIn, isHolidayDate(checkIn)) : null;
                const cheapestPkg = pickFrom
                  ? candidatePkgs
                      .filter((p) => p.guest_count === pickFrom.guest_count)
                      .reduce((min, p) => {
                        const pSale = currentTier ? getPackagePriceForTier(p, currentTier).sale : p.sale_price;
                        const mSale = currentTier ? getPackagePriceForTier(min, currentTier).sale : min.sale_price;
                        return pSale < mSale ? p : min;
                      }, pickFrom)
                  : null;

                const pkgMin = cheapestPkg
                  ? (currentTier ? getPackagePriceForTier(cheapestPkg, currentTier).sale : cheapestPkg.sale_price)
                  : null;
                const roomMin = (secondaryData?.roomTypes?.length || 0) > 0
                  ? Math.min(...secondaryData!.roomTypes.map((r: any) => r.base_price))
                  : null;
                const display = pkgMin ?? roomMin;
                if (display == null) {
                  return <span className="text-sm text-muted-foreground">查看方案</span>;
                }
                return (
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] text-gray-500">總價</span>
                      <span className="text-xl font-bold text-gray-800 tabular-nums">
                        NT${(display * Math.max(1, nights || 1) + childExtraTotal).toLocaleString()}
                      </span>
                    </div>
                    {childExtraTotal > 0 && (
                      <span className="text-[10px] font-medium leading-tight" style={{ color: "hsl(15, 78%, 48%)" }}>
                        含兒童加價 +NT${childExtraTotal.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            <Button
              className="h-11 px-6 text-[15px] font-bold text-white rounded-full shadow-md hover:shadow-lg active:scale-95 transition-all"
              style={{ backgroundColor: "#F08A3E" }}
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
      </div>


      <BookingFooter />
      {!editSearchOpen && <MobileBottomNav />}

      <EditSearchSheet
        open={editSearchOpen}
        onOpenChange={setEditSearchOpen}
        checkIn={checkIn}
        checkOut={checkOut}
        adults={Math.max(1, parseInt(searchParams.get("adults") || "0", 10) || 1)}
        children={Math.max(0, parseInt(searchParams.get("children") || "0", 10) || 0)}
        infants={Math.max(0, parseInt(searchParams.get("infants") || "0", 10) || 0)}
        toddlers={Math.max(0, parseInt(searchParams.get("toddlers") || "0", 10) || 0)}
        rooms={Math.max(1, parseInt(searchParams.get("rooms") || "1", 10) || 1)}
        availableDates={availableDateSet}
        onConfirm={({ checkIn: ci, checkOut: co, adults, children, infants, toddlers, rooms }) => {
          const params = new URLSearchParams(searchParams);
          params.set("checkIn", format(ci, "yyyy-MM-dd"));
          params.set("checkOut", format(co, "yyyy-MM-dd"));
          params.set("adults", String(adults));
          params.set("children", String(children));
          if (infants > 0) params.set("infants", String(infants));
          else params.delete("infants");
          if (toddlers > 0) params.set("toddlers", String(toddlers));
          else params.delete("toddlers");
          params.set("rooms", String(rooms));
          setSearchParams(params, { replace: true });
        }}
      />
    </div>
  );
};

export default BookingVilla;
