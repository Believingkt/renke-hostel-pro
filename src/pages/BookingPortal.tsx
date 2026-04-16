import { useState, useEffect, useMemo, useCallback } from "react";
import bookingHeroBg from "@/assets/booking-hero.jpg";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import BookingFooter from "@/components/BookingFooter";
import MobileBottomNav from "@/components/member/MobileBottomNav";
import PortalSearchBar from "@/components/booking-portal/PortalSearchBar";
import PortalAIChatPanel from "@/components/booking-portal/PortalAIChatPanel";
import RoomTypeCard, { type RoomTypeResult } from "@/components/booking-portal/RoomTypeCard";
import RoomFilterBar, { type RoomFilters, type SortOption } from "@/components/booking-portal/RoomFilterBar";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface AccommodationInfo {
  id: string;
  name: string;
  region_1: string | null;
  region_2: string | null;
  type: string | null;
  address: string | null;
  country: string | null;
  hero_photo_url?: string | null;
}

const BookingPortal = () => {
  const navigate = useNavigate();
  const [accommodations, setAccommodations] = useState<AccommodationInfo[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [checkIn, setCheckIn] = useState<Date | undefined>();
  const [checkOut, setCheckOut] = useState<Date | undefined>();
  const [searching, setSearching] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [heroMode, setHeroMode] = useState<"search" | "ai">("search");
  const [filters, setFilters] = useState<RoomFilters>({
    sortBy: "default",
    minCapacity: 0,
    maxPrice: 0,
    selectedAccommodation: "all",
    selectedRegion: "all",
  });

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
      const [{ data: accs }, { data: rooms }, { data: roomPhotos }, { data: heroPhotos }] = await Promise.all([
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
      ]);

      if (!accs || !rooms) return;

      // Build hero photo map (first hero per accommodation)
      const heroPhotoMap = new Map<string, string>();
      heroPhotos?.forEach((p) => {
        if (p.accommodation_id && !heroPhotoMap.has(p.accommodation_id)) {
          heroPhotoMap.set(p.accommodation_id, p.photo_url);
        }
      });

      const accsWithPhotos: AccommodationInfo[] = accs.map((a) => ({
        ...a,
        hero_photo_url: heroPhotoMap.get(a.id) || null,
      }));

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

  const handleSearch = useCallback(async () => {
    setHasSearched(true);

    if (!checkIn || !checkOut) return;

    setSearching(true);
    try {
      const stayDates = eachDayOfInterval({
        start: checkIn,
        end: addDays(checkOut, -1),
      }).map((d) => format(d, "yyyy-MM-dd"));

      const roomTypeIds = roomTypes.map((rt) => rt.id);

      // Query inventory and pricing for all room types across stay dates
      const { data: inventory } = await supabase
        .from("room_inventory_pricing")
        .select("room_type_id, date, available_rooms, is_available, price")
        .in("room_type_id", roomTypeIds)
        .in("date", stayDates);

      // Group by room_type_id -> dates
      const rtDateMap = new Map<string, Map<string, { available: number; isAvailable: boolean; price: number }>>();

      inventory?.forEach((inv) => {
        if (!rtDateMap.has(inv.room_type_id)) rtDateMap.set(inv.room_type_id, new Map());
        rtDateMap.get(inv.room_type_id)!.set(inv.date, {
          available: inv.available_rooms,
          isAvailable: inv.is_available !== false,
          price: inv.price,
        });
      });

      // Update room types with availability info
      setRoomTypes((prev) =>
        prev.map((rt) => {
          const dateMap = rtDateMap.get(rt.id);
          if (!dateMap) {
            return { ...rt, available_rooms: 0, date_price: null };
          }

          // Check all stay dates — need availability on every date
          let minAvailable = Infinity;
          let minPrice = Infinity;
          let allAvailable = true;

          for (const date of stayDates) {
            const info = dateMap.get(date);
            if (!info || !info.isAvailable || info.available <= 0) {
              allAvailable = false;
              break;
            }
            minAvailable = Math.min(minAvailable, info.available);
            minPrice = Math.min(minPrice, info.price);
          }

          if (!allAvailable) {
            return { ...rt, available_rooms: 0, date_price: null };
          }

          return {
            ...rt,
            available_rooms: minAvailable === Infinity ? 0 : minAvailable,
            date_price: minPrice === Infinity ? null : minPrice,
          };
        })
      );
    } catch (error) {
      console.error("Availability check failed:", error);
    } finally {
      setSearching(false);
    }
  }, [checkIn, checkOut, roomTypes]);

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

    // Availability filter
    if (hasDateFilter) {
      result = result.filter((rt) => rt.available_rooms !== null && rt.available_rooms > 0);
    }

    // Region filter
    if (filters.selectedRegion !== "all") {
      result = result.filter((rt) => rt.accommodation_region_1 === filters.selectedRegion);
    }

    // Accommodation filter
    if (filters.selectedAccommodation !== "all") {
      result = result.filter((rt) => rt.accommodation_id === filters.selectedAccommodation);
    }

    // Capacity filter
    if (filters.minCapacity > 0) {
      result = result.filter((rt) => rt.capacity >= filters.minCapacity);
    }

    // Price filter
    if (filters.maxPrice > 0) {
      result = result.filter((rt) => {
        const price = rt.date_price ?? rt.base_price;
        return price <= filters.maxPrice;
      });
    }

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


  const handleRoomClick = (room: RoomTypeResult) => {
    const params = new URLSearchParams();
    params.set("acc", room.accommodation_id);
    params.set("roomId", room.id);
    if (checkIn) params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    if (checkOut) params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    navigate(`/book?${params.toString()}`);
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
        <div className={`relative max-w-7xl mx-auto px-3 sm:px-4 text-center text-white ${heroMode === "ai" ? "py-4 md:py-6" : "py-8 md:py-20"}`}>
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
              AI 管家
            </button>
          </div>

          {heroMode === "search" ? (
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
              rooms={rooms}
              onRoomsChange={setRooms}
              onSearch={handleSearch}
            />
          ) : (
            <PortalAIChatPanel />
          )}
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

      {/* ── Featured Accommodations ── */}
      <section className="max-w-7xl mx-auto px-3 sm:px-4 pb-6 sm:pb-8">
        <h2 className="text-lg sm:text-xl font-bold text-foreground mb-3 sm:mb-4">精選民宿</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {accommodations.map((acc) => {
            const roomCount = roomTypes.filter((r) => r.accommodation_id === acc.id).length;
            const minPrice = roomTypes
              .filter((r) => r.accommodation_id === acc.id)
              .reduce((min, r) => Math.min(min, r.base_price), Infinity);
            const location = acc.country === "台灣" || !acc.country
              ? [acc.region_1, acc.region_2].filter(Boolean).join(" ")
              : [acc.country, acc.region_1, acc.region_2].filter(Boolean).join(" ");
            return (
              <Card
                key={acc.id}
                className="group overflow-hidden border-none shadow-sm hover:shadow-lg transition-all cursor-pointer"
                onClick={() => {
                  setFilters((prev) => ({ ...prev, selectedAccommodation: acc.id }));
                  document.getElementById("room-list-section")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  {acc.hero_photo_url ? (
                    <img
                      src={acc.hero_photo_url}
                      alt={acc.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <BedDouble className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <CardContent className="p-2.5 sm:p-3">
                  <p className="font-semibold text-foreground text-sm truncate">{acc.name}</p>
                  {location && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {location}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">{roomCount} 種房型</span>
                    {minPrice !== Infinity && (
                      <span className="text-sm font-bold text-primary">
                        NT$ {minPrice.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">起</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Filters & Room Type List ── */}
      <section id="room-list-section" className="max-w-7xl mx-auto px-3 sm:px-4 pb-12 sm:pb-16">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            {searchQuery
              ? `「${searchQuery}」的搜尋結果`
              : hasDateFilter
              ? "可預訂房型"
              : "所有房型"}
          </h2>
          <span className="text-sm text-muted-foreground">
            {searching ? "搜尋中..." : `共 ${filtered.length} 間`}
          </span>
        </div>

        {/* Filter Bar */}
        <div className="mb-4">
          <RoomFilterBar
            filters={filters}
            onFiltersChange={setFilters}
            roomTypes={roomTypes}
            accommodations={accommodations}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">
              {hasDateFilter
                ? "所選日期沒有可預訂的房型"
                : "沒有找到符合條件的房型"}
            </p>
            <p className="text-sm mt-1">試試其他關鍵字或日期</p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearFilters}
              >
                清除所有篩選
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((room) => (
              <RoomTypeCard
                key={room.id}
                room={room}
                onClick={() => handleRoomClick(room)}
                hasDateFilter={hasDateFilter}
                nights={nights}
              />
            ))}
          </div>
        )}
      </section>

      <BookingFooter />
      <MobileBottomNav />
    </div>
  );
};

export default BookingPortal;
