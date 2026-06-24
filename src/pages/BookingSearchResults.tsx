import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { format, parseISO, addDays, eachDayOfInterval, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";
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
import {
  detectTierByDate,
  getPackagePriceForTier,
  isPackageExcludedOnDate,
  type AccommodationPackage,
} from "@/hooks/use-accommodation-packages";
import PortalSearchBar from "@/components/booking-portal/PortalSearchBar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  evaluateChildSelection,
  resolveChildRules,
  summarizeChildRules,
  type ChildAgeRules,
} from "@/lib/child-rules";



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
  child_age_rules: unknown;
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
  const [searchParams, setSearchParams] = useSearchParams();

  // ── 解析 query string ──
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");
  const adults = Number(searchParams.get("adults") || 0);
  const childrenCount = Number(searchParams.get("children") || 0);
  const infantsCount = Number(searchParams.get("infants") || 0);
  const toddlersCount = Number(searchParams.get("toddlers") || 0);
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
  const [packages, setPackages] = useState<AccommodationPackage[]>([]);
  
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryMap, setInventoryMap] = useState<Map<string, { minAvail: number; minPrice: number | null; allAvailable: boolean }>>(new Map());
  const [closedAccIds, setClosedAccIds] = useState<Set<string>>(new Set());

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

  // ── 編輯搜尋條件 Sheet ──
  const [editOpen, setEditOpen] = useState(false);
  const [editQ, setEditQ] = useState(q);
  const [editCheckIn, setEditCheckIn] = useState<Date | undefined>(checkIn || undefined);
  const [editCheckOut, setEditCheckOut] = useState<Date | undefined>(checkOut || undefined);
  const [editAdults, setEditAdults] = useState(adults || 2);
  const [editChildren, setEditChildren] = useState(childrenCount || 0);
  const [editInfants, setEditInfants] = useState(infantsCount || 0);
  const [editToddlers, setEditToddlers] = useState(toddlersCount || 0);
  const [editRooms, setEditRooms] = useState(roomsParam || 1);

  const openEdit = useCallback(() => {
    setEditQ(q);
    setEditCheckIn(checkIn || undefined);
    setEditCheckOut(checkOut || undefined);
    setEditAdults(adults || 2);
    setEditChildren(childrenCount || 0);
    setEditInfants(infantsCount || 0);
    setEditToddlers(toddlersCount || 0);
    setEditRooms(roomsParam || 1);
    setEditOpen(true);
  }, [q, checkIn, checkOut, adults, childrenCount, infantsCount, toddlersCount, roomsParam]);

  const handleApplySearch = useCallback(() => {
    const params = new URLSearchParams();
    if (editCheckIn) params.set("checkIn", format(editCheckIn, "yyyy-MM-dd"));
    if (editCheckOut) params.set("checkOut", format(editCheckOut, "yyyy-MM-dd"));
    if (editAdults) params.set("adults", String(editAdults));
    if (editChildren) params.set("children", String(editChildren));
    if (editInfants) params.set("infants", String(editInfants));
    if (editToddlers) params.set("toddlers", String(editToddlers));
    if (editRooms) params.set("rooms", String(editRooms));
    if (editQ.trim()) params.set("q", editQ.trim());
    setSearchParams(params);
    setEditOpen(false);
  }, [editCheckIn, editCheckOut, editAdults, editChildren, editInfants, editToddlers, editRooms, editQ, setSearchParams]);


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
          { data: pkgs },
        ] = await Promise.all([
          supabase
            .from("accommodation_info")
            .select("id, name, type, region_1, region_2, country, feature_tags_override, nearby_station, review_summary, rating_score, search_card_photos, child_age_rules")
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
            .select("accommodation_id, category, facility_name, is_available"),
          supabase
            .from("pricing_templates")
            .select("accommodation_id, room_type_id, template_name, price, weekday_price, peak_price, weekend_price")
            .order("display_order", { ascending: true }),
          supabase.from("public_holidays").select("accommodation_id, holiday_date"),
          supabase
            .from("accommodation_packages")
            .select("*")
            .eq("enabled", true)
            .order("display_order", { ascending: true })
            .order("guest_count", { ascending: true }),
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
        setFacilities(expandFacilitiesForAccommodations((facs || []) as any, (accs || []).map((a: any) => a.id)) as FacilityRow[]);
        setTemplates((tpls || []) as TemplateRow[]);
        setHolidays((hols || []) as HolidayRow[]);
        setPackages(
          ((pkgs || []) as any[]).map((p) => ({
            ...p,
            excluded_date_ranges: Array.isArray(p.excluded_date_ranges) ? p.excluded_date_ranges : [],
            tier_prices:
              p.tier_prices && typeof p.tier_prices === "object" && !Array.isArray(p.tier_prices)
                ? p.tier_prices
                : {},
          })) as AccommodationPackage[]
        );
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
      setClosedAccIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const stayDates = eachDayOfInterval({
        start: checkIn!,
        end: addDays(checkOut!, -1),
      }).map((d) => format(d, "yyyy-MM-dd"));
      const rtIds = roomTypes.map((r) => r.id);

      // 1) base：取 is_available / price
      const { data: inv } = await supabase
        .from("room_inventory_pricing")
        .select("room_type_id, date, is_available, price")
        .in("room_type_id", rtIds)
        .in("date", stayDates);
      if (cancelled) return;

      const baseMap = new Map<string, { isAvailable: boolean; price: number }>();
      inv?.forEach((row) => {
        baseMap.set(`${row.room_type_id}:${row.date}`, {
          isAvailable: row.is_available !== false,
          price: row.price ?? 0,
        });
      });

      // 2) adjusted：扣除既有訂單後的真實可售房數
      const adjustedResults = await Promise.all(
        roomTypes.map(async (rt) => {
          const { data } = await supabase.rpc("get_adjusted_room_inventory_batch", {
            p_room_type_id: rt.id,
            p_dates: stayDates,
            p_accommodation_id: rt.accommodation_id,
          });
          return { roomTypeId: rt.id, rows: (data as any[]) || [] };
        }),
      );
      if (cancelled) return;

      const adjMap = new Map<string, { available: number; isBlocked: boolean }>();
      for (const { roomTypeId, rows } of adjustedResults) {
        for (const row of rows) {
          const dateKey = (row as any).date_value ?? (row as any).date;
          if (!dateKey) continue;
          adjMap.set(`${roomTypeId}:${dateKey}`, {
            available: row.available_rooms ?? 0,
            isBlocked: row.is_blocked === true,
          });
        }
      }

      const result = new Map<string, { minAvail: number; minPrice: number | null; allAvailable: boolean }>();
      rtIds.forEach((id) => {
        let minAvail = Infinity;
        let minPrice = Infinity;
        let allAvail = true;
        for (const d of stayDates) {
          const base = baseMap.get(`${id}:${d}`);
          const adj = adjMap.get(`${id}:${d}`);
          if (!base || !base.isAvailable || !adj || adj.isBlocked || adj.available <= 0) {
            allAvail = false;
            break;
          }
          minAvail = Math.min(minAvail, adj.available);
          if (base.price > 0) minPrice = Math.min(minPrice, base.price);
        }
        result.set(id, {
          minAvail: allAvail && minAvail !== Infinity ? minAvail : 0,
          minPrice: allAvail && minPrice !== Infinity ? minPrice : null,
          allAvailable: allAvail,
        });
      });
      setInventoryMap(result);

      // 森山 / 哈庫納：當天任一房型「被訂走」(底表有開但被訂單佔光) → 整個住宿當天關閉
      const SENSAN_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
      const HAKUNA_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
      const strictAccIds = new Set([SENSAN_ID, HAKUNA_ID]);
      const closed = new Set<string>();
      for (const rt of roomTypes) {
        if (!strictAccIds.has(rt.accommodation_id)) continue;
        if (closed.has(rt.accommodation_id)) continue;
        for (const d of stayDates) {
          const base = baseMap.get(`${rt.id}:${d}`);
          const adj = adjMap.get(`${rt.id}:${d}`);
          if (!base || !base.isAvailable) continue; // 沒開不算被訂走
          if (!adj) continue;
          if (adj.isBlocked || adj.available <= 0) {
            closed.add(rt.accommodation_id);
            break;
          }
        }
      }
      setClosedAccIds(closed);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasDateFilter, checkIn, checkOut, roomTypes]);

  // ── 組合卡片資料（以「銷售方案」為基礎）──
  const cards = useMemo<SearchRoomCardData[]>(() => {
    const accMap = new Map(accommodations.map((a) => [a.id, a]));
    const rtMap = new Map(roomTypes.map((r) => [r.id, r]));
    const rtFirstPhoto = new Map<string, string>();
    roomTypes.forEach((r) => {
      if (r.photo_url && !rtFirstPhoto.has(r.accommodation_id)) {
        rtFirstPhoto.set(r.accommodation_id, r.photo_url);
      }
    });
    const facByAcc = new Map<string, FacilityRow[]>();
    facilities.forEach((f) => {
      if (!f.accommodation_id) return;
      const arr = facByAcc.get(f.accommodation_id) ?? [];
      arr.push(f);
      facByAcc.set(f.accommodation_id, arr);
    });

    const parseQty = (alloc: string | null, typeName: string): number => {
      if (!alloc || !typeName) return 1;
      const esc = typeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = alloc.match(new RegExp(esc + "\\s*[xX\u00d7]\\s*(\\d+)", "i"));
      return m ? Math.max(1, parseInt(m[1], 10)) : 1;
    };

    // 回傳套餐的庫存需求
    //   mode "all"      : 每個 rtId 都要滿足 qty（多房型組合，例如旅行日多房型）
    //   mode "any-one"  : 從 candidates 中任一房型可售即可（雲岫式包棟池，從 N 棟挑 1）
    const computePkgRoomReq = (pkg: AccommodationPackage):
      | { mode: "all"; items: Array<{ rtId: string; qty: number }> }
      | { mode: "any-one"; candidates: string[] } => {
      const ids = (pkg as any).room_type_ids as string[] | null;
      const list = Array.isArray(ids) && ids.length > 0
        ? ids
        : (pkg.primary_room_type_id ? [pkg.primary_room_type_id] : []);
      if (list.length === 0) return { mode: "all", items: [] };
      if (list.length === 1) {
        // 只指定單一房型時，代表方案本身對應該房型的 1 份庫存
        // room_allocation（例如「四人房x3」）僅作為顯示用，不應乘到庫存需求上
        return { mode: "all", items: [{ rtId: list[0], qty: 1 }] };
      }
      // 多房型：若 room_allocation 中找不到任何列表房型名稱（如雲岫的 allocation 寫的是
      // 「雙人房x2，四人房x2」但 room_type_ids 是 A1/A3/A5… 等 villa），代表是「擇一池」
      const alloc = pkg.room_allocation || "";
      const anyMatched = list.some((rtId) => {
        const rt = rtMap.get(rtId);
        if (!rt) return false;
        const esc = rt.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(esc + "\\s*[xX\u00d7]\\s*\\d+", "i").test(alloc);
      });
      if (!anyMatched) {
        return { mode: "any-one", candidates: list };
      }
      return {
        mode: "all",
        items: list.map((rtId) => {
          const rt = rtMap.get(rtId);
          return { rtId, qty: rt ? parseQty(pkg.room_allocation, rt.name) : 1 };
        }),
      };
    };

    const stayDates = hasDateFilter
      ? eachDayOfInterval({ start: checkIn!, end: addDays(checkOut!, -1) })
      : [];

    const result: SearchRoomCardData[] = [];

    packages.forEach((pkg) => {
      const acc = accMap.get(pkg.accommodation_id);
      if (!acc) return;
      if (hasDateFilter && stayDates.some((d) => isPackageExcludedOnDate(pkg, d))) return;

      const req = computePkgRoomReq(pkg);
      const isSensan = isSensanAccommodation(acc.name);

      let allAvail = true;
      let minPackagesSellable = Infinity;
      // 森山 / 哈庫納：當天任一房型有訂單 → 該住宿整天關閉（所有方案標售完）
      if (hasDateFilter && closedAccIds.has(acc.id)) {
        allAvail = false;
      } else if (hasDateFilter) {
        if (req.mode === "all") {
          if (req.items.length === 0) {
            // 無房型資訊，視同無法判斷 → 不擋
          } else {
            for (const { rtId, qty } of req.items) {
              const inv = inventoryMap.get(rtId);
              if (!inv || !inv.allAvailable || inv.minAvail < qty) {
                allAvail = false;
                break;
              }
              minPackagesSellable = Math.min(minPackagesSellable, Math.floor(inv.minAvail / qty));
            }
          }
        } else {
          // any-one：擇一池中只要任一房型可售即可，且該房型容量需 ≥ 套餐人數
          let sellableTotal = 0;
          for (const rtId of req.candidates) {
            const rt = rtMap.get(rtId);
            if (!rt) continue;
            if ((rt.capacity ?? 0) < (pkg.guest_count ?? 0)) continue;
            const inv = inventoryMap.get(rtId);
            if (!inv || !inv.allAvailable || inv.minAvail <= 0) continue;
            sellableTotal += inv.minAvail;
          }
          if (sellableTotal <= 0) {
            allAvail = false;
          } else {
            minPackagesSellable = sellableTotal;
          }
        }
      }


      const holidaySet = new Set(
        holidays
          .filter((h) => !h.accommodation_id || h.accommodation_id === acc.id)
          .map((h) => h.holiday_date),
      );
      let totalSale = 0;
      let totalOriginal = 0;
      let hasOriginal = false;
      let nightsCounted = 0;
      const datesForPrice = stayDates.length > 0 ? stayDates : [new Date()];
      for (const d of datesForPrice) {
        const tier = detectTierByDate(d, holidaySet.has(format(d, "yyyy-MM-dd")));
        if (!pkg.applicable_tiers.includes(tier)) continue;
        const { sale, original } = getPackagePriceForTier(pkg, tier);
        totalSale += sale;
        if (original && original > sale) {
          totalOriginal += original;
          hasOriginal = true;
        } else {
          totalOriginal += sale;
        }
        nightsCounted++;
      }
      // 若有日期條件且所有住宿夜都不適用此方案的 tier，跳過（避免用平日 sale_price fallback 顯示錯誤週末價）
      if (hasDateFilter && stayDates.length > 0 && nightsCounted === 0) return;
      const total = nightsCounted > 0 ? totalSale : pkg.sale_price;
      const original = hasOriginal && nightsCounted > 0 ? totalOriginal : null;
      const nightly = nights > 0 ? Math.round(total / nights) : total;
      const discount = original && total && original > total
        ? Math.round(((original - total) / original) * 100)
        : null;

      const reqItems = req.mode === "all"
        ? req.items
        : req.candidates.map((rtId) => ({ rtId, qty: 1 }));
      const totalRoomCount = req.mode === "any-one"
        ? 1
        : (reqItems.reduce((s, r) => s + r.qty, 0) || 1);
      const totalSize = reqItems.reduce((s, r) => {
        const rt = rtMap.get(r.rtId);
        return s + (rt?.size_sqm ? rt.size_sqm * r.qty : 0);
      }, 0);

      const primaryRt = pkg.primary_room_type_id ? rtMap.get(pkg.primary_room_type_id) : null;
      const fallbackPhoto = primaryRt?.photo_url || rtFirstPhoto.get(acc.id) || null;

      const overrideTags = acc.feature_tags_override?.filter(Boolean) || [];
      const tags = overrideTags.length > 0 ? overrideTags : deriveAutoTags(facByAcc.get(acc.id) ?? []);

      // 兒童分齡規則：方案覆寫 > 民宿預設
      const childRules: ChildAgeRules = resolveChildRules(
        acc.child_age_rules,
        (pkg as any).child_age_rules_override,
      );
      const childEval = evaluateChildSelection(
        childRules,
        {
          infants: infantsCount,
          toddlers: toddlersCount,
          children: childrenCount,
        },
        nights || 1,
        adults || 2,
      );
      const childExtraTotal = childEval.extraFeeTotal;
      const childBlockedByLimits = childEval.blocked;

      const inventorySoldOut = hasDateFilter && !allAvail;
      const soldOut = inventorySoldOut || childBlockedByLimits;

      const adjTotal = total > 0 ? total + childExtraTotal : total;
      const adjOriginal = original ? original + childExtraTotal : original;
      const adjNightly = nights > 0 ? Math.round(adjTotal / nights) : adjTotal;

      result.push({
        id: pkg.id,
        name: pkg.name,
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        accommodation_type: acc.type,
        region_1: acc.region_1,
        region_2: acc.region_2,
        country: acc.country,
        photo_url: fallbackPhoto,
        photo_urls:
          acc.search_card_photos && acc.search_card_photos.length > 0
            ? acc.search_card_photos
            : fallbackPhoto
            ? [fallbackPhoto]
            : [],
        capacity: pkg.guest_count,
        guest_count_max: pkg.guest_count_max,
        size_sqm: totalSize > 0 ? Math.round(totalSize) : (primaryRt?.size_sqm ?? null),
        room_count: totalRoomCount,
        unit_count: 1,
        room_allocation: pkg.room_allocation,
        is_package: true,
        nearby_station: acc.nearby_station,
        review_summary: acc.review_summary,
        rating: acc.rating_score,
        nightly_price: adjNightly > 0 ? adjNightly : null,
        total_price: adjTotal > 0 ? adjTotal : null,
        original_total_price: adjOriginal,
        discount_percent: discount,
        available_rooms: allAvail && minPackagesSellable !== Infinity ? minPackagesSellable : null,
        feature_tags: tags,
        sold_out: soldOut,
        child_rules_summary: summarizeChildRules(childRules),
        child_extra_fee_total: childExtraTotal > 0 ? childExtraTotal : null,
        child_blocked_reason: childBlockedByLimits
          ? childEval.blockReason ||
            `兒童人數超過上限（${childEval.blockedTiers
              .map((k) => childRules.tiers[k].label)
              .join("、")}）`
          : null,
      });
    });

    return result;
  }, [accommodations, roomTypes, packages, facilities, holidays, inventoryMap, closedAccIds, hasDateFilter, nights, checkIn, checkOut, infantsCount, toddlersCount, childrenCount, adults]);


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
      // 銷售方案不得低於搜尋人數（以方案最大容量為準，無則用 capacity）
      if (c.is_package && adults > 0) {
        const maxCap = c.guest_count_max ?? c.capacity;
        if (maxCap < adults) continue;
      }
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
    if (infantsCount) params.set("infants", String(infantsCount));
    if (toddlersCount) params.set("toddlers", String(toddlersCount));
    if (roomsParam) params.set("rooms", String(roomsParam));
    const useVilla = isSensanAccommodation(card.accommodation_name);
    const path = useVilla ? `/booking/villa/${card.accommodation_id}` : `/booking/${card.accommodation_id}`;
    const qs = params.toString();
    navigate(`${path}${qs ? `?${qs}` : ""}`);
  }, [navigate, checkInStr, checkOutStr, adults, childrenCount, infantsCount, toddlersCount, roomsParam]);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (checkIn && checkOut) {
      parts.push(`${format(checkIn, "M/d")} – ${format(checkOut, "M/d")} · ${nights} 晚`);
    }
    if (adults || childrenCount || infantsCount || toddlersCount) {
      const childTotal = childrenCount + infantsCount + toddlersCount;
      parts.push(`${adults} 位成人${childTotal > 0 ? ` · ${childTotal} 位兒童` : ""}`);
    }
    if (roomsParam) parts.push(`${roomsParam} 間`);
    return parts.join(" · ");
  }, [checkIn, checkOut, nights, adults, childrenCount, infantsCount, toddlersCount, roomsParam]);

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
            onClick={openEdit}
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

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="top" className="p-0 max-h-[95vh] overflow-y-auto">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-left">修改搜尋條件</SheetTitle>
          </SheetHeader>
          <div className="px-3 pb-4">
            <PortalSearchBar
              searchQuery={editQ}
              onSearchQueryChange={setEditQ}
              checkIn={editCheckIn}
              checkOut={editCheckOut}
              onCheckInChange={setEditCheckIn}
              onCheckOutChange={setEditCheckOut}
              adults={editAdults}
              onAdultsChange={setEditAdults}
              children={editChildren}
              onChildrenChange={setEditChildren}
              infants={editInfants}
              onInfantsChange={setEditInfants}
              toddlers={editToddlers}
              onToddlersChange={setEditToddlers}
              rooms={editRooms}
              onRoomsChange={setEditRooms}
              onSearch={handleApplySearch}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>

  );
};

export default BookingSearchResults;
