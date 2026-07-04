import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import bookingHeroBg from "@/assets/booking-hero.jpg";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";
import PortalSearchBar from "@/components/booking-portal/PortalSearchBar";
import PortalAIChatPanel from "@/components/booking-portal/PortalAIChatPanel";
import { type RoomTypeResult } from "@/components/booking-portal/RoomTypeCard";
import RoomFilterBar, { type RoomFilters, type SortOption } from "@/components/booking-portal/RoomFilterBar";
import AccommodationCard, { type AccommodationCardData } from "@/components/booking-portal/AccommodationCard";
import AccommodationPhotoCarousel from "@/components/booking-portal/AccommodationPhotoCarousel";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { format, eachDayOfInterval, addDays } from "date-fns";
import {
  MapPin,
  User,
  LogIn,
  Gift,
  Ticket,
  TrendingUp,
  Search,
  BedDouble,
  MessageCircle,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  isSensanAccommodation,
  detectSensanTierByDate,
  pickSensanTier,
  getSensanRangeForTier,
} from "@/lib/sensan-pricing";
import { classifyDayTier } from "@/utils/templatePriceResolver";

interface AccommodationInfo {
  id: string;
  name: string;
  region_1: string | null;
  region_2: string | null;
  type: string | null;
  address: string | null;
  country: string | null;
  hero_photo_url?: string | null;
  hero_photos?: string[];
  about_title?: string | null;
  about_description?: string | null;
  // Portal 精選卡片獨立設定
  card_display_name?: string | null;
  card_location?: string | null;
  card_editor_title?: string | null;
  card_editor_body?: string | null;
  card_cta_label?: string | null;
  card_is_visible?: boolean;
  card_photos?: string[];
}

interface FacilityRow {
  accommodation_id: string | null;
  category: string;
  facility_name: string;
}

interface PricingTemplateRow {
  accommodation_id: string;
  room_type_id: string | null;
  template_name: string;
  price: number | null;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
}

interface PublicHolidayRow {
  accommodation_id: string | null;
  holiday_date: string;
}

const asPositivePrice = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 ? value : null;

const getTemplateFallbackPrice = (template: PricingTemplateRow) => {
  const candidates = [
    template.weekday_price,
    template.peak_price,
    template.weekend_price,
    template.price,
  ]
    .map(asPositivePrice)
    .filter((p): p is number => p !== null);
  return candidates.length ? Math.min(...candidates) : null;
};

const getTemplatePriceForDate = (
  template: PricingTemplateRow,
  date: Date | null | undefined,
  holidaySet: Set<string>,
) => {
  if (!date) return getTemplateFallbackPrice(template);
  const tier = classifyDayTier(date, holidaySet);
  const value =
    tier === "weekend"
      ? template.weekend_price ?? template.price
      : tier === "peak"
        ? template.peak_price ?? template.price ?? template.weekday_price
        : template.weekday_price ?? template.price;
  return asPositivePrice(value);
};

// Map facility keywords -> 包棟特色標籤
const FEATURE_TAG_RULES: Array<{ test: (name: string) => boolean; label: string }> = [
  { test: (n) => /寵物|pet/i.test(n), label: "寵物友善" },
  { test: (n) => /BBQ|烤肉|戶外用餐/i.test(n), label: "BBQ 烤肉" },
  { test: (n) => /廚房|kitchen/i.test(n), label: "獨立廚房" },
  { test: (n) => /泳池|游泳/i.test(n), label: "泳池" },
  { test: (n) => /KTV|卡拉OK|karaoke/i.test(n), label: "KTV 歡唱" },
  { test: (n) => /早餐|breakfast/i.test(n), label: "含早餐" },
  { test: (n) => /停車|parking/i.test(n), label: "免費停車" },
  { test: (n) => /WIFI|wifi|無線/i.test(n), label: "免費 WiFi" },
  { test: (n) => /桌遊|遊戲|board/i.test(n), label: "桌遊娛樂" },
  { test: (n) => /兒童|嬰兒|kids|baby/i.test(n), label: "親子友善" },
];

function deriveFeatureTags(facilities: FacilityRow[]): string[] {
  const tags = new Set<string>();
  for (const f of facilities) {
    for (const rule of FEATURE_TAG_RULES) {
      if (rule.test(f.facility_name)) {
        tags.add(rule.label);
        break;
      }
    }
    if (tags.size >= 3) break;
  }
  return Array.from(tags);
}

const BookingPortal = () => {
  const navigate = useNavigate();
  const [accommodations, setAccommodations] = useState<AccommodationInfo[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeResult[]>([]);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [pricingTemplates, setPricingTemplates] = useState<PricingTemplateRow[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<PublicHolidayRow[]>([]);
  const [extraBedByAcc, setExtraBedByAcc] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState("");
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  }, []);
  const dayAfterTomorrow = useMemo(() => {
    const d = new Date(tomorrow);
    d.setDate(d.getDate() + 1);
    return d;
  }, [tomorrow]);
  const [checkIn, setCheckIn] = useState<Date | undefined>(undefined);
  const [checkOut, setCheckOut] = useState<Date | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [adults, setAdults] = useState(12);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [toddlers, setToddlers] = useState(0);
  const [rooms, setRooms] = useState(4);
  const [hasSearched, setHasSearched] = useState(false);
  const [heroMode, setHeroMode] = useState<"search" | "ai">("search");
  const [footerVisible, setFooterVisible] = useState(false);
  const footerSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = footerSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry.isIntersecting),
      { rootMargin: "0px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [filters, setFilters] = useState<RoomFilters>({
    sortBy: "default",
    minCapacity: 0,
    maxPrice: 0,
    selectedAccommodation: "all",
    selectedRegion: "all",
  });
  const [availableDateSet, setAvailableDateSet] = useState<Set<string> | null>(null);
  const [availableDatesByRoomType, setAvailableDatesByRoomType] = useState<Map<string, Set<string>>>(new Map());
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  useEffect(() => {
    fetchData();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

  const fetchData = async () => {
    try {
      // Fetch accommodations and room types in parallel
      const [{ data: accs }, { data: rooms }, { data: roomPhotos }, { data: heroPhotos }, { data: facs }, { data: addons }, { data: templates }, { data: holidays }, { data: aboutSections }, { data: cardSettings }, { data: cardPhotos }] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, region_1, region_2, type, address, country")
          .eq("is_active", true)
          .order("display_order", { ascending: true, nullsFirst: false }),
        supabase
          .from("room_types")
          .select("id, name, description, base_price, capacity, size_sqm, room_count, accommodation_id, display_order")
          .order("display_order", { ascending: true }),
        supabase
          .from("room_photos")
          .select("room_type_id, photo_url, display_order")
          .order("display_order", { ascending: true }),
        supabase
          .from("accommodation_photos")
          .select("accommodation_id, photo_url, display_order")
          .eq("photo_type", "hero")
          .order("display_order", { ascending: true }),
        supabase
          .from("accommodation_facilities")
          .select("accommodation_id, category, facility_name, is_available"),
        supabase
          .from("addon_settings")
          .select("accommodation_id, addon_type, unit_label, max_quantity, enabled")
          .eq("enabled", true),
        supabase
          .from("pricing_templates")
          .select("accommodation_id, room_type_id, template_name, price, weekday_price, peak_price, weekend_price")
          .order("display_order", { ascending: true }),
        supabase
          .from("public_holidays")
          .select("accommodation_id, holiday_date"),
        supabase
          .from("about_section")
          .select("accommodation_id, section_title, section_description"),
        (supabase as any)
          .from("portal_featured_cards")
          .select("accommodation_id, display_name, location_override, editor_pick_title, editor_pick_body, cta_label, is_visible"),
        (supabase as any)
          .from("portal_featured_card_photos")
          .select("accommodation_id, photo_url, display_order")
          .order("display_order", { ascending: true }),
      ]);

      if (!accs || !rooms) return;

      // Build hero photo arrays (ordered) per accommodation — used for carousel
      const heroPhotosMap = new Map<string, string[]>();
      heroPhotos?.forEach((p) => {
        if (!p.accommodation_id || !p.photo_url) return;
        const arr = heroPhotosMap.get(p.accommodation_id) ?? [];
        arr.push(p.photo_url);
        heroPhotosMap.set(p.accommodation_id, arr);
      });

      const aboutMap = new Map<string, { title: string | null; description: string | null }>();
      aboutSections?.forEach((s: any) => {
        if (s.accommodation_id) aboutMap.set(s.accommodation_id, { title: s.section_title, description: s.section_description });
      });

      // Portal featured card overrides
      const cardSettingsMap = new Map<string, any>();
      (cardSettings ?? []).forEach((c: any) => {
        if (c.accommodation_id) cardSettingsMap.set(c.accommodation_id, c);
      });
      const cardPhotosMap = new Map<string, string[]>();
      (cardPhotos ?? []).forEach((p: any) => {
        if (!p.accommodation_id || !p.photo_url) return;
        const arr = cardPhotosMap.get(p.accommodation_id) ?? [];
        arr.push(p.photo_url);
        cardPhotosMap.set(p.accommodation_id, arr);
      });

      const accsWithPhotos: AccommodationInfo[] = accs
        .map((a) => {
          const photos = heroPhotosMap.get(a.id) ?? [];
          const cs = cardSettingsMap.get(a.id);
          return {
            ...a,
            hero_photo_url: photos[0] ?? null,
            hero_photos: photos,
            about_title: aboutMap.get(a.id)?.title ?? null,
            about_description: aboutMap.get(a.id)?.description ?? null,
            card_display_name: cs?.display_name ?? null,
            card_location: cs?.location_override ?? null,
            card_editor_title: cs?.editor_pick_title ?? null,
            card_editor_body: cs?.editor_pick_body ?? null,
            card_cta_label: cs?.cta_label ?? null,
            card_is_visible: cs?.is_visible ?? true,
            card_photos: cardPhotosMap.get(a.id) ?? [],
          };
        })
        // 隱藏被關閉顯示的民宿（僅影響卡片清單；其餘 region 排序內部仍可用）
        .filter((a) => a.card_is_visible !== false);

      const accMap = new Map(accsWithPhotos.map((a) => [a.id, a]));

      // Get first photo per room type
      const photoMap = new Map<string, string>();
      roomPhotos?.forEach((p) => {
        if (p.room_type_id && !photoMap.has(p.room_type_id)) {
          photoMap.set(p.room_type_id, p.photo_url);
        }
      });

      // Build room type results — only include rooms belonging to active accommodations
      const results: RoomTypeResult[] = rooms
        .filter((r) => r.accommodation_id && accMap.has(r.accommodation_id))
        .map((r) => {
          const acc = accMap.get(r.accommodation_id!)!;
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            base_price: r.base_price,
            capacity: r.capacity,
            size_sqm: r.size_sqm,
            room_count: r.room_count,
            photo_url: photoMap.get(r.id) || null,
            accommodation_id: acc.id,
            accommodation_name: acc.name,
            accommodation_type: acc.type,
            accommodation_region_1: acc.region_1,
            accommodation_region_2: acc.region_2,
            available_rooms: null,
            date_price: null,
          };
        });

      setAccommodations(accsWithPhotos);
      setRoomTypes(results);
      setFacilities(expandFacilitiesForAccommodations((facs || []) as any, accs.map((a) => a.id)) as any);
      setPricingTemplates((templates || []) as PricingTemplateRow[]);
      setPublicHolidays((holidays || []) as PublicHolidayRow[]);

      // Aggregate extra-bed capacity per accommodation from addon_settings.
      // Heuristic: any enabled addon whose addon_type or unit_label indicates a bed/extra person.
      const bedRegex = /床|加人|bed|person|人/i;
      const bedMap = new Map<string, number>();
      (addons || []).forEach((a: any) => {
        if (!a.accommodation_id) return;
        const label = `${a.addon_type ?? ""} ${a.unit_label ?? ""}`;
        if (!bedRegex.test(label)) return;
        const max = Number(a.max_quantity) || 0;
        if (max <= 0) return;
        bedMap.set(a.accommodation_id, (bedMap.get(a.accommodation_id) || 0) + max);
      });
      setExtraBedByAcc(bedMap);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  }, [checkIn, checkOut]);

  // Room types matching the destination text query
  const matchedRoomTypeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return roomTypes
      .filter(
        (rt) =>
          rt.name.toLowerCase().includes(q) ||
          rt.accommodation_name.toLowerCase().includes(q) ||
          rt.accommodation_region_1?.toLowerCase().includes(q) ||
          rt.accommodation_region_2?.toLowerCase().includes(q)
      )
      .map((rt) => rt.id);
  }, [searchQuery, roomTypes]);

  // Fetch available dates (next 180 days) for matched room types
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || matchedRoomTypeIds.length === 0) {
      setAvailableDateSet(null);
      setAvailableDatesByRoomType(new Map());
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingAvailability(true);
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = addDays(start, 180);
        const startStr = format(start, "yyyy-MM-dd");
        const endStr = format(end, "yyyy-MM-dd");

        // Fetch all rows — default limit is 1000 which may truncate results
        // for many room types × 180 days. Paginate to get everything.
        let allRows: { date: string; available_rooms: number | null; is_available: boolean | null; room_type_id: string }[] = [];
        const PAGE = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: page } = await supabase
            .from("room_inventory_pricing")
            .select("date, available_rooms, is_available, room_type_id")
            .in("room_type_id", matchedRoomTypeIds)
            .gte("date", startStr)
            .lte("date", endStr)
            .range(from, from + PAGE - 1);
          if (cancelled) return;
          if (page && page.length > 0) {
            allRows = allRows.concat(page);
            from += PAGE;
            hasMore = page.length === PAGE;
          } else {
            hasMore = false;
          }
        }

        if (cancelled) return;
        const set = new Set<string>();
        const roomTypeDateMap = new Map<string, Set<string>>();
        allRows.forEach((row) => {
          if (row.is_available !== false && (row.available_rooms ?? 0) > 0) {
            set.add(row.date);
            const existingDates = roomTypeDateMap.get(row.room_type_id) ?? new Set<string>();
            existingDates.add(row.date);
            roomTypeDateMap.set(row.room_type_id, existingDates);
          }
        });
        // If no inventory data at all, allow all dates (don't block)
        if (allRows.length === 0) {
          setAvailableDateSet(null);
          setAvailableDatesByRoomType(new Map());
        } else {
          setAvailableDateSet(set);
          setAvailableDatesByRoomType(roomTypeDateMap);
        }

        // Clear selected dates that are no longer available
        if (checkIn && !set.has(format(checkIn, "yyyy-MM-dd"))) {
          setCheckIn(undefined);
          setCheckOut(undefined);
        } else if (checkOut) {
          const prev = format(addDays(checkOut, -1), "yyyy-MM-dd");
          if (!set.has(prev)) setCheckOut(undefined);
        }
      } catch (e) {
        console.error("Failed to load availability index:", e);
        if (!cancelled) {
          setAvailableDateSet(null);
          setAvailableDatesByRoomType(new Map());
        }
      } finally {
        if (!cancelled) setLoadingAvailability(false);
      }
    };

    const t = setTimeout(run, 300); // debounce typing
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, matchedRoomTypeIds.join(",")]);

  const isStayRangeAvailable = useCallback((start: Date, endExclusive: Date) => {
    if (endExclusive <= start) return false;
    if (availableDateSet === null) return true;

    const stayDates = eachDayOfInterval({
      start,
      end: addDays(endExclusive, -1),
    }).map((date) => format(date, "yyyy-MM-dd"));

    return Array.from(availableDatesByRoomType.values()).some((dateSet) =>
      stayDates.every((date) => dateSet.has(date))
    );
  }, [availableDateSet, availableDatesByRoomType]);

  const handleSearch = useCallback(async () => {
    setHasSearched(true);
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    if (checkOut) params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    if (adults) params.set("adults", String(adults));
    if (children) params.set("children", String(children));
    if (infants) params.set("infants", String(infants));
    if (toddlers) params.set("toddlers", String(toddlers));
    if (rooms) params.set("rooms", String(rooms));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    const qs = params.toString();
    navigate(`/booking/search${qs ? `?${qs}` : ""}`);
  }, [checkIn, checkOut, adults, children, infants, toddlers, rooms, searchQuery, navigate]);


  const hasDateFilter = !!(checkIn && checkOut && hasSearched);

  const filtered = useMemo(() => {
    let result = roomTypes;

    // Text filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (rt) =>
          rt.name.toLowerCase().includes(q) ||
          rt.accommodation_name.toLowerCase().includes(q) ||
          rt.accommodation_region_1?.toLowerCase().includes(q) ||
          rt.accommodation_region_2?.toLowerCase().includes(q)
      );
    }

    // Availability filter — 森山忽略散客庫存判定，永遠保留
    if (hasDateFilter) {
      result = result.filter(
        (rt) =>
          isSensanAccommodation(rt.accommodation_name) ||
          (rt.available_rooms !== null && rt.available_rooms > 0)
      );
    }

    // Region filter
    if (filters.selectedRegion !== "all") {
      result = result.filter((rt) => rt.accommodation_region_1 === filters.selectedRegion);
    }

    // Accommodation filter
    if (filters.selectedAccommodation !== "all") {
      result = result.filter((rt) => rt.accommodation_id === filters.selectedAccommodation);
    }

    // Capacity filter is applied at the aggregated (per-accommodation) level
    // below, so we don't filter individual room types out here.

    // Price filter is applied at the aggregated (per-accommodation) level below,
    // so the slider reflects the same per-stay price shown on each card
    // (incl. 森山的 SENSAN_PRICING_TABLE 起價).

    // Sort
    if (filters.sortBy !== "default") {
      result = [...result].sort((a, b) => {
        const priceA = a.date_price ?? a.base_price;
        const priceB = b.date_price ?? b.base_price;
        switch (filters.sortBy) {
          case "price_asc": return priceA - priceB;
          case "price_desc": return priceB - priceA;
          case "capacity_asc": return a.capacity - b.capacity;
          case "capacity_desc": return b.capacity - a.capacity;
          default: return 0;
        }
      });
    }

    return result;
  }, [roomTypes, searchQuery, hasDateFilter, filters]);

  // Aggregate filtered room types into per-accommodation cards
  const aggregatedAccs = useMemo<AccommodationCardData[]>(() => {
    const accMap = new Map(accommodations.map((a) => [a.id, a]));
    const facByAcc = new Map<string, FacilityRow[]>();
    facilities.forEach((f) => {
      if (!f.accommodation_id) return;
      const arr = facByAcc.get(f.accommodation_id) ?? [];
      arr.push(f);
      facByAcc.set(f.accommodation_id, arr);
    });

    // Group filtered room types by accommodation
    const byAcc = new Map<string, RoomTypeResult[]>();
    filtered.forEach((rt) => {
      const arr = byAcc.get(rt.accommodation_id) ?? [];
      arr.push(rt);
      byAcc.set(rt.accommodation_id, arr);
    });

    const cards: AccommodationCardData[] = [];
    // 「銷售方案」(如「12 人包區」) 為虛擬人數方案，不計入實際房間數
    const isVillaPlan = (r: RoomTypeResult) =>
      /包棟|包區|whole|villa/i.test(r.name) || r.capacity >= 8;

    // 貪婪法：以最少房間數，從最大 capacity 房型開始填，回傳開房數與每晚總價
    const fitGuests = (
      realRooms: RoomTypeResult[],
      guests: number,
      getNightlyPrice: (room: RoomTypeResult) => number = (room) => room.date_price ?? room.base_price,
    ): { rooms: number; nightly: number; capacity: number } | null => {
      if (guests <= 0 || realRooms.length === 0) return null;
      const sorted = [...realRooms].sort((a, b) => b.capacity - a.capacity);
      let remaining = guests;
      let openRooms = 0;
      let capacity = 0;
      let nightly = 0;
      for (const rt of sorted) {
        const stock = rt.room_count ?? 1;
        const unitPrice = getNightlyPrice(rt);
        for (let i = 0; i < stock && remaining > 0; i++) {
          openRooms += 1;
          capacity += rt.capacity;
          nightly += unitPrice;
          remaining -= rt.capacity;
        }
        if (remaining <= 0) break;
      }
      if (remaining > 0) return null;
      return { rooms: openRooms, nightly, capacity };
    };

    byAcc.forEach((rts, accId) => {
      const acc = accMap.get(accId);
      if (!acc) return;

      const isSensan = isSensanAccommodation(acc.name);

      const realRooms = rts.filter((r) => !isVillaPlan(r));
      const villaPlans = rts.filter((r) => isVillaPlan(r));
      const baseRooms = realRooms.length > 0 ? realRooms : rts;

      const totalRooms = baseRooms.reduce((s, r) => s + (r.room_count ?? 1), 0);

      // ── 森山專用：以 SENSAN_PRICING_TABLE 為價格來源；忽略散客邏輯 ──
      if (isSensan) {
        const tier = detectSensanTierByDate(checkIn ?? null);
        const { min: minTier, max: maxTier } = getSensanRangeForTier(tier);
        const matchedTier = adults > 0 ? pickSensanTier(adults, tier) : null;
        const safeNights = Math.max(1, nights);
        const stayMul = hasDateFilter && nights > 0 ? safeNights : 1;

        const startTotal = minTier.sale * stayMul;
        const fullVillaTotal = maxTier.sale * stayMul;
        const matchedTotal = matchedTier ? matchedTier.sale * stayMul : null;
        const originalForStart = minTier.original * stayMul;
        const discountPercent = Math.round(
          ((minTier.original - minTier.sale) / minTier.original) * 100
        );

        cards.push({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          region_1: acc.region_1,
          region_2: acc.region_2,
          country: acc.country,
          hero_photo_url: acc.hero_photo_url ?? null,
          total_rooms: totalRooms,
          room_type_count: rts.length,
          // 森山以包區方案為單位：最低 6 人、最高 18 人
          min_capacity: minTier.guestCount,
          max_capacity: maxTier.guestCount,
          extra_bed_count: extraBedByAcc.get(accId) || 0,
          feature_tags: deriveFeatureTags(facByAcc.get(accId) ?? []),
          min_price: startTotal,
          original_price: originalForStart,
          discount_percent: discountPercent,
          max_price: fullVillaTotal,
          max_capacity_price_capacity: maxTier.guestCount,
          matched_guests: adults > 0 ? adults : null,
          matched_capacity: matchedTier?.guestCount ?? null,
          // 森山是整棟方案，沒有「開幾間」的概念，固定顯示 1 個方案
          matched_rooms: matchedTier ? 1 : null,
          matched_total_price: matchedTotal,
          // 森山忽略散客庫存判定，列表卡不再因散客缺房而消失
          available_rooms: hasDateFilter ? 1 : null,
        });
        return;
      }

      // ── 一般民宿：以 room_types 庫存推導 ──
      // 最少人數 = 真實房間數（一間至少容納 1 人 = 包棟最低人數的概念）
      // 退回房型最小 capacity 若無真實房型
      const minCapacity = realRooms.length > 0
        ? totalRooms
        : Math.min(...rts.map((r) => r.capacity));
      // 最多人數 = 銷售方案最大 capacity，或所有真實房 capacity 加總
      const maxFromVilla = villaPlans.length > 0
        ? Math.max(...villaPlans.map((r) => r.capacity))
        : 0;
      const maxFromReal = realRooms.reduce(
        (s, r) => s + r.capacity * (r.room_count ?? 1),
        0
      );
      const maxCapacity = Math.max(maxFromVilla, maxFromReal);

      const templatesForAcc = pricingTemplates.filter((t) => t.accommodation_id === accId);
      const holidaySet = new Set(
        publicHolidays
          .filter((h) => !h.accommodation_id || h.accommodation_id === accId)
          .map((h) => h.holiday_date)
      );
      const templatePriceByRoom = new Map<string, number>();
      for (const rt of rts) {
        const candidates = templatesForAcc
          .filter((t) => t.room_type_id === rt.id || t.room_type_id === null)
          .map((t) => getTemplatePriceForDate(t, checkIn ?? null, holidaySet))
          .filter((p): p is number => p !== null);
        if (candidates.length > 0) templatePriceByRoom.set(rt.id, Math.min(...candidates));
      }
      const roomNightlyPrice = (r: RoomTypeResult) => asPositivePrice(r.date_price) ?? templatePriceByRoom.get(r.id) ?? r.base_price;
      const packageOptions = (villaPlans.length > 0 ? villaPlans : rts)
        .map((room) => ({
          room,
          nightly: templatePriceByRoom.get(room.id) ?? asPositivePrice(room.date_price) ?? asPositivePrice(room.base_price),
        }))
        .filter((item): item is { room: RoomTypeResult; nightly: number } => item.nightly !== null);

      // Per-night minimum: prefer searched date price, then project/template price, then base_price
      const nightlyPrices = rts
        .map((r) => roomNightlyPrice(r))
        .filter((p) => p > 0);
      const minNightly = nightlyPrices.length ? Math.min(...nightlyPrices) : null;
      const totalForStay =
        minNightly !== null && hasDateFilter && nights > 0
          ? minNightly * nights
          : minNightly;

      // 起價方案 = 用最少房間（即剛好放得下 minCapacity 人）
      const startFit = fitGuests(realRooms, minCapacity, roomNightlyPrice);
      const startPackage = packageOptions.length > 0
        ? [...packageOptions].sort((a, b) => a.nightly - b.nightly)[0]
        : null;
      const startNightly = startPackage?.nightly ?? startFit?.nightly ?? minNightly;
      const startTotal =
        startNightly !== null && hasDateFilter && nights > 0
          ? startNightly * nights
          : startNightly;

      // 全棟方案 = 開所有真實房（總價 = 全部 base_price 加總 × room_count）
      const fullVillaNightly = realRooms.length > 0
        ? realRooms.reduce(
            (s, r) => s + roomNightlyPrice(r) * (r.room_count ?? 1),
            0
          )
        : null;
      const fullVillaTotal =
        fullVillaNightly !== null && hasDateFilter && nights > 0
          ? fullVillaNightly * nights
          : fullVillaNightly;

      // 對應使用者選的人數
      const matchedFit = adults > 0 ? fitGuests(realRooms, adults, roomNightlyPrice) : null;
      const matchedPackage = adults > 0 && packageOptions.length > 0
        ? [...packageOptions]
            .filter((item) => item.room.capacity >= adults)
            .sort((a, b) => a.room.capacity - b.room.capacity || a.nightly - b.nightly)[0] ?? null
        : null;
      const matchedNightly = matchedPackage?.nightly ?? matchedFit?.nightly ?? null;
      const matchedTotal =
        matchedNightly !== null && hasDateFilter && nights > 0
          ? matchedNightly * nights
          : matchedNightly;

      // 製造「原價→折扣→售價」效果（預設 15%；無 min_price 則略過）
      const discountPercent = totalForStay && totalForStay > 0 ? 15 : null;
      const originalPrice = totalForStay && discountPercent
        ? Math.round(totalForStay / (1 - discountPercent / 100) / 10) * 10
        : null;

      cards.push({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        region_1: acc.region_1,
        region_2: acc.region_2,
        country: acc.country,
        hero_photo_url: acc.hero_photo_url ?? null,
        total_rooms: totalRooms,
        room_type_count: rts.length,
        min_capacity: minCapacity,
        max_capacity: maxCapacity,
        extra_bed_count: extraBedByAcc.get(accId) || 0,
        feature_tags: deriveFeatureTags(facByAcc.get(accId) ?? []),
        min_price: startTotal ?? totalForStay,
        original_price: originalPrice,
        discount_percent: discountPercent,
        max_price: fullVillaTotal,
        max_capacity_price_capacity: maxFromReal || maxCapacity,
        matched_guests: adults > 0 ? adults : null,
        matched_capacity: matchedFit?.capacity ?? null,
        matched_rooms: matchedFit?.rooms ?? null,
        matched_total_price: matchedTotal,
        available_rooms: hasDateFilter
          ? rts.reduce((s, r) => s + (r.available_rooms ?? 0), 0)
          : null,
      });
    });

    // Apply capacity filter at the whole-villa level
    let final = cards;
    if (filters.minCapacity > 0) {
      final = final.filter((c) => c.max_capacity >= filters.minCapacity);
    }

    // Apply price filter at the whole-villa level — compare per-night 起價，
    // 與滑桿（每晚最高價格）一致。card.min_price 在已選日期時為「整段總價」，
    // 需除以夜數還原成每晚單價。
    if (filters.maxPrice > 0) {
      const stayDivisor = hasDateFilter && nights > 0 ? nights : 1;
      final = final.filter((c) => {
        if (c.min_price == null) return true;
        const nightly = c.min_price / stayDivisor;
        return nightly <= filters.maxPrice;
      });
    }

    // Sort
    if (filters.sortBy !== "default") {
      final = [...final].sort((a, b) => {
        const pa = a.min_price ?? Infinity;
        const pb = b.min_price ?? Infinity;
        switch (filters.sortBy) {
          case "price_asc": return pa - pb;
          case "price_desc": return pb - pa;
          case "capacity_asc": return a.max_capacity - b.max_capacity;
          case "capacity_desc": return b.max_capacity - a.max_capacity;
          default: return 0;
        }
      });
    } else if (adults > 0) {
      // 智慧排序：有輸入人數時，依「最符合人數」優先
      // 1) 容量足夠者優先（max_capacity >= adults）
      // 2) 有 matched 試算者優先
      // 3) 容量越接近人數越前面（避免大材小用）
      // 4) matched 總價低者優先；無 matched 用 min_price
      const score = (c: typeof final[number]) => {
        const fits = c.max_capacity >= adults ? 0 : 1;
        const hasMatch = c.matched_total_price ? 0 : 1;
        const capDelta = Math.max(0, c.max_capacity - adults);
        const price = c.matched_total_price ?? c.min_price ?? Infinity;
        return [fits, hasMatch, capDelta, price] as const;
      };
      final = [...final].sort((a, b) => {
        const sa = score(a);
        const sb = score(b);
        for (let i = 0; i < sa.length; i++) {
          if (sa[i] !== sb[i]) return (sa[i] as number) - (sb[i] as number);
        }
        return 0;
      });
    } else {
      const order = new Map(accommodations.map((a, i) => [a.id, i]));
      final.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    }
    return final;
  }, [filtered, accommodations, facilities, extraBedByAcc, pricingTemplates, publicHolidays, hasDateFilter, nights, filters.minCapacity, filters.maxPrice, filters.sortBy, adults, checkIn]);

  const handleAccClick = (accId: string) => {
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    if (checkOut) params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    if (adults) params.set("adults", String(adults));
    if (children) params.set("children", String(children));
    if (infants) params.set("infants", String(infants));
    if (toddlers) params.set("toddlers", String(toddlers));
    if (rooms) params.set("rooms", String(rooms));
    const qs = params.toString();
    // 僅森山使用包區階梯詳情頁（CapacityPriceLadder 為森山專屬硬編碼價目）
    // 其他住宿走標準訂房頁
    const acc = accommodations.find((a) => a.id === accId);
    const useVilla = isSensanAccommodation(acc?.name);
    const path = useVilla ? `/booking/villa/${accId}` : `/booking/${accId}`;
    navigate(`${path}${qs ? `?${qs}` : ""}`);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCheckIn(undefined);
    setCheckOut(undefined);
    setHasSearched(false);
    setFilters({
      sortBy: "default",
      minCapacity: 0,
      maxPrice: 0,
      selectedAccommodation: "all",
      selectedRegion: "all",
    });
    // Reset availability data
    setRoomTypes((prev) =>
      prev.map((rt) => ({ ...rt, available_rooms: null, date_price: null }))
    );
  };

  const hasActiveFilters = searchQuery || hasDateFilter || 
    filters.sortBy !== "default" || filters.minCapacity > 0 || 
    filters.maxPrice > 0 || filters.selectedAccommodation !== "all" || 
    filters.selectedRegion !== "all";

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-20 sm:h-24 object-contain" />
          </Link>
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
                {memberName || "會員中心"}
              </Button>
            ) : (
              <button
                onClick={() => navigate("/member/auth")}
                className="flex items-center gap-1.5 text-[hsl(25,80%,50%)] font-semibold text-sm hover:opacity-80 transition-opacity"
              >
                <LogIn className="h-5 w-5" />
                登入 / 註冊
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Banner with Search ── */}
      <section
        className="relative overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: `url(${bookingHeroBg})` }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, hsla(25, 80%, 55%, 0.6) 0%, hsla(30, 90%, 60%, 0.5) 50%, hsla(35, 85%, 58%, 0.6) 100%)",
          }}
        />
        <div className={`relative max-w-7xl mx-auto px-3 sm:px-4 text-center text-white transition-all duration-300 ease-in-out ${heroMode === "ai" ? "py-4 md:py-6" : "py-8 md:py-20"}`}>
          <h1 className={`font-bold drop-shadow-sm ${heroMode === "ai" ? "text-xl sm:text-2xl md:text-4xl mb-1 sm:mb-2" : "text-2xl sm:text-3xl md:text-5xl mb-2 sm:mb-3"}`}>
            探索優質包棟民宿
          </h1>
          <p className={`opacity-90 ${heroMode === "ai" ? "text-xs sm:text-sm md:text-base mb-3 sm:mb-4" : "text-sm sm:text-base md:text-lg mb-4 sm:mb-6"}`}>
            會員優惠  |  安心付款  |  免費取消
          </p>

          {/* Mode Toggle */}
          <div className="flex items-center justify-center gap-1 mb-4 sm:mb-6">
            <button
              onClick={() => setHeroMode("search")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                heroMode === "search"
                  ? "bg-white text-[hsl(25,70%,45%)] shadow-md"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              <Search className="h-4 w-4" />
              搜尋房型
            </button>
            <button
              onClick={() => setHeroMode("ai")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                heroMode === "ai"
                  ? "bg-white text-[hsl(25,70%,45%)] shadow-md"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              AI 找房間
            </button>
          </div>

          <div className="relative">
            <div
              key="search"
              className={`transition-all duration-300 ease-in-out ${
                heroMode === "search"
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2 pointer-events-none absolute inset-0"
              }`}
            >
              {heroMode === "search" && (
                <PortalSearchBar
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onCheckInChange={setCheckIn}
                  onCheckOutChange={setCheckOut}
                  adults={adults}
                  onAdultsChange={setAdults}
                  children={children}
                  onChildrenChange={setChildren}
                  infants={infants}
                  onInfantsChange={setInfants}
                  toddlers={toddlers}
                  onToddlersChange={setToddlers}
                  rooms={rooms}
                  onRoomsChange={setRooms}
                  onSearch={handleSearch}
                  availableDateSet={availableDateSet}
                  isStayRangeAvailable={isStayRangeAvailable}
                  isLoadingAvailability={loadingAvailability}
                />
              )}
              {heroMode === "search" && (
                <div className="max-w-4xl mx-auto px-1 sm:px-0 mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[11px] text-white/90 mr-1">適合人數：</span>
                  {[
                    { label: "2 人", value: 2 },
                    { label: "4 人", value: 4 },
                    { label: "6-10 人", value: 8 },
                    { label: "12-16 人", value: 14 },
                    { label: "16+ 人", value: 18 },
                  ].map((chip) => {
                    const active = adults === chip.value;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => setAdults(chip.value)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                          active
                            ? "bg-white text-[hsl(25,70%,45%)] border-white font-semibold"
                            : "bg-white/15 text-white border-white/30 hover:bg-white/25"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div
              key="ai"
              className={`transition-all duration-300 ease-in-out ${
                heroMode === "ai"
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2 pointer-events-none absolute inset-0"
              }`}
            >
              {heroMode === "ai" && <PortalAIChatPanel />}
            </div>
          </div>
        </div>
      </section>

      {/* ── Promo Cards ── */}
      <section className="max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          {[
            {
              icon: Gift,
              title: "新會員優惠",
              desc: "註冊即享首訂折扣",
              color: "hsl(25, 80%, 55%)",
              bg: "hsl(25, 80%, 96%)",
            },
            {
              icon: Ticket,
              title: "限時優惠券",
              desc: "平台專屬折扣碼",
              color: "hsl(200, 70%, 50%)",
              bg: "hsl(200, 70%, 96%)",
            },
            {
              icon: TrendingUp,
              title: "紅利回饋",
              desc: "消費累積紅利點數",
              color: "hsl(142, 70%, 40%)",
              bg: "hsl(142, 70%, 96%)",
            },
            {
              icon: BedDouble,
              title: "精選房型",
              desc: `${roomTypes.length} 種房型可選`,
              color: "hsl(270, 60%, 55%)",
              bg: "hsl(270, 60%, 96%)",
            },
          ].map((promo, i) => (
            <Card
              key={i}
              className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              style={{ background: promo.bg }}
            >
              <CardContent className="p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
                <div
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: promo.color }}
                >
                  <promo.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground">{promo.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{promo.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Featured Accommodations — Magazine Style ── */}
      {accommodations.length > 0 && (() => {
        const serif = { fontFamily: "'Noto Serif TC', serif" } as const;
        const featured = accommodations;
        const [hero, secondary, ...rest] = featured;
        const others = [secondary, ...rest].filter(Boolean) as AccommodationInfo[];
        // Mobile horizontal strip: include every accommodation except the hero
        const mobileOthers = accommodations.filter((a) => !hero || a.id !== hero.id);
        const locOf = (a: AccommodationInfo) =>
          a.country === "台灣" || !a.country
            ? [a.region_1, a.region_2].filter(Boolean).join(" · ")
            : [a.country, a.region_1, a.region_2].filter(Boolean).join(" · ");
        const minPriceOf = (id: string) => {
          const ps = roomTypes.filter((r) => r.accommodation_id === id).map((r) => r.base_price).filter((p) => p > 0);
          return ps.length ? Math.min(...ps) : null;
        };
        return (
          <section className="max-w-7xl mx-auto px-3 sm:px-4 pt-2 pb-10 sm:pb-14">
            {/* Editorial header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 sm:mb-8 md:mb-12 gap-4">
              <div className="space-y-1.5">
                <span className="text-primary font-medium tracking-[0.2em] uppercase text-xs">Selected Retreats</span>
                <h2 style={serif} className="text-3xl sm:text-4xl md:text-5xl text-foreground leading-tight">精選民宿</h2>
              </div>
              <div className="hidden md:block h-px flex-grow mx-8 bg-border mb-3" />
              <span className="text-muted-foreground text-sm">探索深度旅宿的質感生活</span>
            </div>

            {/* ── Mobile: Immersive vertical feed ── */}
            <div className="md:hidden divide-y divide-border/40">
              {accommodations.map((acc, idx) => {
                const price = minPriceOf(acc.id);
                const editorBody = acc.card_editor_body || acc.about_description || acc.about_title;
                const editorTitle = acc.card_editor_title || "管家推薦 · Editor's Pick";
                const ctaLabel = acc.card_cta_label || "探索這間民宿";
                const displayName = acc.card_display_name || acc.name;
                const displayLocation = acc.card_location || locOf(acc);
                const cardPhotos =
                  (acc.card_photos && acc.card_photos.length > 0
                    ? acc.card_photos
                    : acc.hero_photos) ?? (acc.hero_photo_url ? [acc.hero_photo_url] : []);
                return (
                  <article
                    key={acc.id}
                    className={`${idx === 0 ? "pt-1" : "pt-4"} pb-5`}
                  >
                    {/* Full-bleed photo carousel */}
                    <AccommodationPhotoCarousel
                      photos={cardPhotos}
                      alt={displayName}
                      aspectClassName="aspect-[4/3]"
                      roundedClassName="rounded-xl"
                      eager={idx === 0}
                      onClick={() => handleAccClick(acc.id)}
                    />

                    {/* Name + Location */}
                    <div className="mt-3 px-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3
                          style={serif}
                          className="text-xl leading-tight text-foreground/90"
                        >
                          {displayName}
                        </h3>
                        {displayLocation && (
                          <p className="text-xs text-muted-foreground tracking-wide flex items-center gap-1 shrink-0">
                            <MapPin className="h-3 w-3" />
                            {displayLocation}
                          </p>
                        )}
                      </div>
                      {price != null && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="text-primary font-semibold text-base">
                            NT$ {price.toLocaleString()}
                          </span>{" "}
                          起 / 晚
                        </p>
                      )}
                    </div>

                    {/* Editor's Pick / 管家推薦 */}
                    {editorBody && (
                      <div className="mt-3 mx-1 bg-muted/40 rounded-lg px-3 py-2.5 border border-border/30">
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary mb-1">
                          {editorTitle}
                        </p>
                        <div className="flex gap-1.5">
                          <span
                            style={serif}
                            className="text-lg leading-none text-primary/60 select-none"
                            aria-hidden
                          >
                            ❝
                          </span>
                          <p className="text-[13px] leading-relaxed text-foreground/75 line-clamp-3 whitespace-pre-line">
                            {editorBody}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <div className="mt-3 px-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-10 border-primary/60 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg tracking-wider"
                        onClick={() => handleAccClick(acc.id)}
                      >
                        {ctaLabel}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* ── Desktop: Compact editorial grid ── */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {accommodations.map((acc, idx) => {
                const price = minPriceOf(acc.id);
                const editorBody = acc.card_editor_body || acc.about_description || acc.about_title;
                const editorTitle = acc.card_editor_title || "管家推薦";
                const ctaLabel = acc.card_cta_label || "探索這間民宿";
                const displayName = acc.card_display_name || acc.name;
                const displayLocation = acc.card_location || locOf(acc);
                const cardPhotos =
                  (acc.card_photos && acc.card_photos.length > 0
                    ? acc.card_photos
                    : acc.hero_photos) ?? (acc.hero_photo_url ? [acc.hero_photo_url] : []);
                return (
                  <article key={acc.id} className="group flex flex-col">
                    <div className="cursor-pointer" onClick={() => handleAccClick(acc.id)}>
                      <AccommodationPhotoCarousel
                        photos={cardPhotos}
                        alt={displayName}
                        aspectClassName="aspect-[4/3]"
                        roundedClassName="rounded-md"
                        eager={idx < 3}
                        onClick={() => handleAccClick(acc.id)}
                      />
                    </div>

                    {/* Name + Location */}
                    <div className="mt-4 flex items-baseline justify-between gap-3">
                      <h3
                        style={serif}
                        className="text-xl lg:text-2xl leading-tight text-foreground group-hover:text-primary transition-colors cursor-pointer"
                        onClick={() => handleAccClick(acc.id)}
                      >
                        {displayName}
                      </h3>
                      {displayLocation && (
                        <p className="text-[11px] text-muted-foreground tracking-wider flex items-center gap-1 shrink-0">
                          <MapPin className="h-3 w-3" />
                          {displayLocation}
                        </p>
                      )}
                    </div>

                    {/* Price */}
                    {price != null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="text-primary font-semibold text-sm">
                          NT$ {price.toLocaleString()}
                        </span>{" "}
                        起 / 晚
                      </p>
                    )}

                    {/* Editor's Pick */}
                    {editorBody && (
                      <div className="mt-3 bg-muted/40 rounded-md px-3 py-2.5 border border-border/30">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-primary mb-1">
                          {editorTitle}
                        </p>
                        <p className="text-[12px] leading-relaxed text-foreground/75 line-clamp-2 whitespace-pre-line">
                          {editorBody}
                        </p>
                      </div>
                    )}

                    {/* CTA */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-9 border-primary/60 text-primary hover:bg-primary hover:text-primary-foreground rounded-md tracking-wider"
                      onClick={() => handleAccClick(acc.id)}
                    >
                      {ctaLabel}
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </article>
                );
              })}
            </div>


          </section>
        );
      })()}


      {heroMode !== "ai" && (
        <button
          onClick={() => {
            setHeroMode("ai");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="問問 AI 管家"
          aria-hidden={footerVisible}
          tabIndex={footerVisible ? -1 : 0}
          className={`group fixed z-[45] left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] md:bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] rounded-full shadow-lg hover:shadow-2xl flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-3 py-1 sm:pl-1.5 sm:pr-4 sm:py-1.5 md:pl-2 md:pr-5 md:py-2 max-w-[92vw] bg-white border border-border transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] active:scale-95 active:translate-y-0 ${
            footerVisible ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100"
          }`}
        >
          <span
            className="relative w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shrink-0 transition-transform duration-300 group-hover:scale-110"
            style={{ background: "linear-gradient(135deg, #F08A3E, #E5701A)" }}
          >
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "#F08A3E", opacity: 0.35, animationDuration: "2.2s" }}
              aria-hidden
            />
            <Sparkles className="relative w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-[18px] md:h-[18px] animate-pulse" style={{ animationDuration: "2.2s" }} />
          </span>
          <span className="text-xs sm:text-sm md:text-base font-medium text-foreground whitespace-nowrap">
            問問 <span style={{ color: "#F08A3E" }}>AI 管家</span> 或長按說話
          </span>
        </button>
      )}

      <div ref={footerSentinelRef} aria-hidden className="h-px w-full" />
      <BookingFooter />
      <MobileBottomNav />
    </div>
  );
};

export default BookingPortal;
