import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { format, parseISO, addDays, eachDayOfInterval, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, User, LogIn, SlidersHorizontal } from "lucide-react";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";
import SearchRoomCard, { type SearchRoomCardData } from "@/components/booking-portal/SearchRoomCard";
import RoomFilterBar, { type RoomFilters } from "@/components/booking-portal/RoomFilterBar";
import { type RoomTypeResult } from "@/components/booking-portal/RoomTypeCard";
import { isSensanAccommodation } from "@/lib/sensan-pricing";
import { classifyDayTier } from "@/utils/templatePriceResolver";

interface AccInfo {
  id: string;
  name: string;
  type: string | null;
  region_1: string | null;
  region_2: string | null;
  country: string | null;
  feature_tags_override: string[] | null;
  nearby_station: string | null;
  review_summary: string | null;
  rating_score: number | null;
  search_card_photos: string[] | null;
}

interface FacilityRow {
  accommodation_id: string | null;
  category: string;
  facility_name: string;
}

interface TemplateRow {
  accommodation_id: string;
  room_type_id: string | null;
  template_name: string;
  price: number | null;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
}

interface HolidayRow {
  accommodation_id: string | null;
  holiday_date: string;
}

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

function deriveAutoTags(facilities: FacilityRow[]): string[] {
  const tags = new Set<string>();
  for (const f of facilities) {
    for (const rule of FEATURE_TAG_RULES) {
      if (rule.test(f.facility_name)) {
        tags.add(rule.label);
        break;
      }
    }
    if (tags.size >= 4) break;
  }
  return Array.from(tags);
}

const asPositive = (v: number | null | undefined) =>
  typeof v === "number" && v > 0 ? v : null;

const getTemplatePriceForDate = (
  t: TemplateRow,
  date: Date,
  holidaySet: Set<string>,
) => {
  const tier = classifyDayTier(date, holidaySet);
  const v =
    tier === "weekend"
      ? t.weekend_price ?? t.price
      : tier === "peak"
        ? t.peak_price ?? t.price ?? t.weekday_price
        : t.weekday_price ?? t.price;
  return asPositive(v);
};

const BookingSearchResults = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── 解析 query string ──
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");
  const adults = Number(searchParams.get("adults") || 0);
  const childrenCount = Number(searchParams.get("children") || 0);
  const roomsParam = Number(searchParams.get("rooms") || 0);
  const q = searchParams.get("q") || "";

  const checkIn = useMemo(() => (checkInStr ? parseISO(checkInStr) : null), [checkInStr]);
  const checkOut = useMemo(() => (checkOutStr ? parseISO(checkOutStr) : null), [checkOutStr]);
  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const n = differenceInCalendarDays(checkOut, checkIn);
    return n > 0 ? n : 0;
  }, [checkIn, checkOut]);

  const hasDateFilter = !!(checkIn && checkOut && nights > 0);

  const [accommodations, setAccommodations] = useState<AccInfo[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeResult[]>([]);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryMap, setInventoryMap] = useState<Map<string, { minAvail: number; minPrice: number | null; allAvailable: boolean }>>(new Map());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState("");

  const [filters, setFilters] = useState<RoomFilters>({
    sortBy: "default",
    minCapacity: 0,
    maxPrice: 0,
    selectedAccommodation: "all",
    selectedRegion: "all",
  });
  const [showFilters, setShowFilters] = useState(false);

  // ── 基本資料 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [
          { data: accs },
          { data: rooms },
          { data: photos },
          { data: facs },
          { data: tpls },
          { data: hols },
        ] = await Promise.all([
          supabase
            .from("accommodation_info")
            .select("id, name, type, region_1, region_2, country, feature_tags_override, nearby_station, review_summary, rating_score, search_card_photos")
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
            .from("accommodation_facilities")
            .select("accommodation_id, category, facility_name")
            .eq("is_available", true),
          supabase
            .from("pricing_templates")
            .select("accommodation_id, room_type_id, template_name, price, weekday_price, peak_price, weekend_price")
            .order("display_order", { ascending: true }),
          supabase.from("public_holidays").select("accommodation_id, holiday_date"),
        ]);

        if (cancelled || !accs || !rooms) return;

        const photoMap = new Map<string, string>();
        photos?.forEach((p: any) => {
          if (p.room_type_id && !photoMap.has(p.room_type_id)) {
            photoMap.set(p.room_type_id, p.photo_url);
          }
        });

        const accMap = new Map(accs.map((a) => [a.id, a as AccInfo]));
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

        setAccommodations(accs as AccInfo[]);
        setRoomTypes(results);
        setFacilities((facs || []) as FacilityRow[]);
        setTemplates((tpls || []) as TemplateRow[]);
        setHolidays((hols || []) as HolidayRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── auth ──
  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  // ── 庫存查詢 ──
  useEffect(() => {
    if (!hasDateFilter || roomTypes.length === 0) {
      setInventoryMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const stayDates = eachDayOfInterval({
        start: checkIn!,
        end: addDays(checkOut!, -1),
      }).map((d) => format(d, "yyyy-MM-dd"));
      const rtIds = roomTypes.map((r) => r.id);

      const { data: inv } = await supabase
        .from("room_inventory_pricing")
        .select("room_type_id, date, available_rooms, is_available, price")
        .in("room_type_id", rtIds)
        .in("date", stayDates);
      if (cancelled) return;

      const rtDateMap = new Map<string, Map<string, { available: number; isAvailable: boolean; price: number }>>();
      inv?.forEach((row) => {
        if (!rtDateMap.has(row.room_type_id)) rtDateMap.set(row.room_type_id, new Map());
        rtDateMap.get(row.room_type_id)!.set(row.date, {
          available: row.available_rooms,
          isAvailable: row.is_available !== false,
          price: row.price,
        });
      });

      const result = new Map<string, { minAvail: number; minPrice: number | null; allAvailable: boolean }>();
      rtIds.forEach((id) => {
        const dm = rtDateMap.get(id);
        if (!dm) {
          result.set(id, { minAvail: 0, minPrice: null, allAvailable: false });
          return;
        }
        let minAvail = Infinity;
        let minPrice = Infinity;
        let allAvail = true;
        for (const d of stayDates) {
          const info = dm.get(d);
          if (!info || !info.isAvailable || info.available <= 0) {
            allAvail = false;
            break;
          }
          minAvail = Math.min(minAvail, info.available);
          if (info.price > 0) minPrice = Math.min(minPrice, info.price);
        }
        result.set(id, {
          minAvail: allAvail && minAvail !== Infinity ? minAvail : 0,
          minPrice: allAvail && minPrice !== Infinity ? minPrice : null,
          allAvailable: allAvail,
        });
      });
      setInventoryMap(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasDateFilter, checkIn, checkOut, roomTypes]);

  // ── 組合卡片資料 ──
  const cards = useMemo<SearchRoomCardData[]>(() => {
    const accMap = new Map(accommodations.map((a) => [a.id, a]));
    const facByAcc = new Map<string, FacilityRow[]>();
    facilities.forEach((f) => {
      if (!f.accommodation_id) return;
      const arr = facByAcc.get(f.accommodation_id) ?? [];
      arr.push(f);
      facByAcc.set(f.accommodation_id, arr);
    });

    const result: SearchRoomCardData[] = [];
    roomTypes.forEach((rt) => {
      const acc = accMap.get(rt.accommodation_id);
      if (!acc) return;

      const inv = inventoryMap.get(rt.id);
      const isSensan = isSensanAccommodation(acc.name);

      // 價格：庫存查得到 → 用 inv.minPrice，否則用 template 平均，最後 base_price
      let nightly: number | null = inv?.minPrice ?? null;
      if (nightly == null && hasDateFilter) {
        const holidaySet = new Set(
          holidays
            .filter((h) => !h.accommodation_id || h.accommodation_id === acc.id)
            .map((h) => h.holiday_date),
        );
        const tpls = templates.filter(
          (t) => t.accommodation_id === acc.id && (t.room_type_id === rt.id || t.room_type_id === null),
        );
        if (tpls.length > 0) {
          const stayDates = eachDayOfInterval({ start: checkIn!, end: addDays(checkOut!, -1) });
          let sum = 0;
          let count = 0;
          for (const d of stayDates) {
            const prices = tpls
              .map((t) => getTemplatePriceForDate(t, d, holidaySet))
              .filter((p): p is number => p !== null);
            if (prices.length) {
              sum += Math.min(...prices);
              count++;
            }
          }
          if (count > 0) nightly = Math.round(sum / count);
        }
      }
      if (nightly == null) nightly = asPositive(rt.base_price);

      const total = nightly != null && nights > 0 ? nightly * nights : nightly;
      const original = total ? Math.round((total / 0.85) / 10) * 10 : null;

      const overrideTags = acc.feature_tags_override?.filter(Boolean) || [];
      const tags = overrideTags.length > 0 ? overrideTags : deriveAutoTags(facByAcc.get(acc.id) ?? []);

      // sensan 散客庫存不影響可訂狀態
      const soldOut = hasDateFilter && !isSensan && (!inv || !inv.allAvailable);

      result.push({
        id: rt.id,
        name: rt.name,
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        accommodation_type: acc.type,
        region_1: acc.region_1,
        region_2: acc.region_2,
        country: acc.country,
        photo_url: rt.photo_url,
        capacity: rt.capacity,
        size_sqm: rt.size_sqm,
        room_count: rt.room_count ?? null,
        nearby_station: acc.nearby_station,
        review_summary: acc.review_summary,
        rating: acc.rating_score,
        nightly_price: nightly,
        total_price: total,
        original_total_price: total ? original : null,
        discount_percent: total ? 15 : null,
        available_rooms: inv?.allAvailable ? inv.minAvail : null,
        feature_tags: tags,
        sold_out: soldOut,
      });
    });
    return result;
  }, [accommodations, roomTypes, facilities, templates, holidays, inventoryMap, hasDateFilter, nights, checkIn, checkOut]);

  // ── 每家民宿只保留一張最符合搜尋條件的房型卡 ──
  const dedupedCards = useMemo<SearchRoomCardData[]>(() => {
    const bestByAcc = new Map<string, SearchRoomCardData>();
    const scoreOf = (c: SearchRoomCardData) => ({
      // 越小越好：有貨 > 容量符合 > 價格低
      outScore: c.sold_out ? 1 : 0,
      fitScore: adults > 0 && c.capacity < adults ? 1 : 0,
      price: c.nightly_price ?? Infinity,
    });
    for (const c of cards) {
      const prev = bestByAcc.get(c.accommodation_id);
      if (!prev) {
        bestByAcc.set(c.accommodation_id, c);
        continue;
      }
      const a = scoreOf(c);
      const b = scoreOf(prev);
      if (
        a.outScore < b.outScore ||
        (a.outScore === b.outScore && a.fitScore < b.fitScore) ||
        (a.outScore === b.outScore && a.fitScore === b.fitScore && a.price < b.price)
      ) {
        bestByAcc.set(c.accommodation_id, c);
      }
    }
    return Array.from(bestByAcc.values());
  }, [cards, adults]);

  // ── 套用文字 / 篩選 / 排序 ──
  const filtered = useMemo(() => {
    let r = dedupedCards;
    if (q) {
      const qq = q.toLowerCase();
      r = r.filter(
        (c) =>
          c.name.toLowerCase().includes(qq) ||
          c.accommodation_name.toLowerCase().includes(qq) ||
          c.region_1?.toLowerCase().includes(qq) ||
          c.region_2?.toLowerCase().includes(qq),
      );
    }
    if (filters.selectedRegion !== "all") r = r.filter((c) => c.region_1 === filters.selectedRegion);
    if (filters.selectedAccommodation !== "all") r = r.filter((c) => c.accommodation_id === filters.selectedAccommodation);
    if (filters.minCapacity > 0) r = r.filter((c) => c.capacity >= filters.minCapacity);
    if (filters.maxPrice > 0)
      r = r.filter((c) => {
        const p = c.nightly_price ?? 0;
        return p > 0 ? p <= filters.maxPrice : true;
      });

    if (filters.sortBy !== "default") {
      r = [...r].sort((a, b) => {
        const pa = a.nightly_price ?? Infinity;
        const pb = b.nightly_price ?? Infinity;
        switch (filters.sortBy) {
          case "price_asc": return pa - pb;
          case "price_desc": return pb - pa;
          case "capacity_asc": return a.capacity - b.capacity;
          case "capacity_desc": return b.capacity - a.capacity;
          default: return 0;
        }
      });
    } else {
      // 預設：有貨在前 → 符合人數在前 → 價格低在前
      r = [...r].sort((a, b) => {
        const aOut = a.sold_out ? 1 : 0;
        const bOut = b.sold_out ? 1 : 0;
        if (aOut !== bOut) return aOut - bOut;
        if (adults > 0) {
          const aFit = a.capacity >= adults ? 0 : 1;
          const bFit = b.capacity >= adults ? 0 : 1;
          if (aFit !== bFit) return aFit - bFit;
        }
        return (a.nightly_price ?? Infinity) - (b.nightly_price ?? Infinity);
      });
    }
    return r;
  }, [dedupedCards, q, filters, adults]);

  const handleCardClick = useCallback((card: SearchRoomCardData) => {
    const params = new URLSearchParams();
    if (checkInStr) params.set("checkIn", checkInStr);
    if (checkOutStr) params.set("checkOut", checkOutStr);
    if (adults) params.set("adults", String(adults));
    if (childrenCount) params.set("children", String(childrenCount));
    if (roomsParam) params.set("rooms", String(roomsParam));
    const useVilla = isSensanAccommodation(card.accommodation_name);
    const path = useVilla ? `/booking/villa/${card.accommodation_id}` : `/booking/${card.accommodation_id}`;
    const qs = params.toString();
    navigate(`${path}${qs ? `?${qs}` : ""}`);
  }, [navigate, checkInStr, checkOutStr, adults, childrenCount, roomsParam]);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (checkIn && checkOut) {
      parts.push(`${format(checkIn, "M/d")} – ${format(checkOut, "M/d")} · ${nights} 晚`);
    }
    if (adults || childrenCount) {
      parts.push(`${adults} 位成人${childrenCount ? ` · ${childrenCount} 位兒童` : ""}`);
    }
    if (roomsParam) parts.push(`${roomsParam} 間`);
    return parts.join(" · ");
  }, [checkIn, checkOut, nights, adults, childrenCount, roomsParam]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-20 sm:h-24 object-contain" />
          </Link>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/member/profile")} className="gap-1.5">
                <User className="h-4 w-4" />
                {memberName || "會員中心"}
              </Button>
            ) : (
              <button
                onClick={() => navigate("/member/auth")}
                className="flex items-center gap-1.5 text-[hsl(25,80%,50%)] font-semibold text-sm"
              >
                <LogIn className="h-5 w-5" />
                登入 / 註冊
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 搜尋摘要 bar */}
      <div className="bg-card border-b border-border sticky top-14 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/booking")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button
            onClick={() => navigate("/booking")}
            className="flex-1 min-w-0 text-left bg-muted/40 hover:bg-muted/60 transition rounded-xl px-3 py-2 border border-border/60"
          >
            <p className="text-xs text-muted-foreground leading-none mb-0.5">搜尋條件（點此修改）</p>
            <p className="text-sm font-medium text-foreground truncate">
              {summary || "點此設定日期與人數"}
            </p>
          </button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">篩選</span>
          </Button>
        </div>
        {showFilters && (
          <div className="max-w-7xl mx-auto px-3 sm:px-4 pb-3 overflow-x-auto">
            <RoomFilterBar
              filters={filters}
              onFiltersChange={setFilters}
              roomTypes={roomTypes}
              accommodations={accommodations.map((a) => ({ id: a.id, name: a.name, region_1: a.region_1 }))}
            />
          </div>
        )}
      </div>

      {/* 結果列表 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h1 className="text-lg sm:text-xl font-bold text-foreground">
            找到 {loading ? "…" : filtered.length} 個房型
          </h1>
        </div>

        {loading ? null : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">沒有符合條件的房型</p>
            <p className="text-sm mt-1">調整日期、人數或篩選條件再試一次</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/booking")}>
              重新搜尋
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => (
              <SearchRoomCard
                key={card.id}
                data={card}
                nights={nights}
                onClick={() => handleCardClick(card)}
              />
            ))}
          </div>
        )}
      </main>

      <BookingFooter />
      <MobileBottomNav />
    </div>
  );
};

export default BookingSearchResults;
