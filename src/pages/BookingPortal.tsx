import { useState, useEffect, useMemo, useCallback } from "react";
import bookingHeroBg from "@/assets/booking-hero.jpg";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import BookingFooter from "@/components/BookingFooter";
import PortalSearchBar from "@/components/booking-portal/PortalSearchBar";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, eachDayOfInterval, addDays } from "date-fns";
import {
  MapPin,
  Star,
  User,
  LogIn,
  ChevronRight,
  Gift,
  Ticket,
  TrendingUp,
  Building2,
  Search,
} from "lucide-react";

interface AccommodationCard {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  region_1: string | null;
  region_2: string | null;
  star_rating: string | null;
  short_url_alias: string | null;
  type: string | null;
  hero_photos: string[];
  min_price: number | null;
}

const BookingPortal = () => {
  const navigate = useNavigate();
  const [accommodations, setAccommodations] = useState<AccommodationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [checkIn, setCheckIn] = useState<Date | undefined>();
  const [checkOut, setCheckOut] = useState<Date | undefined>();
  const [availableAccIds, setAvailableAccIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchAccommodations();
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

  const fetchAccommodations = async () => {
    try {
      const { data: accs, error } = await supabase
        .from("accommodation_info")
        .select(
          "id, name, description, address, region_1, region_2, star_rating, short_url_alias, type"
        )
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      if (!accs) return;

      const enriched = await Promise.all(
        accs.map(async (acc) => {
          const [{ data: photos }, { data: rooms }] = await Promise.all([
            supabase
              .from("accommodation_photos")
              .select("photo_url")
              .eq("accommodation_id", acc.id)
              .eq("photo_type", "hero")
              .order("display_order", { ascending: true })
              .limit(1),
            supabase
              .from("room_types")
              .select("base_price")
              .eq("accommodation_id", acc.id)
              .order("base_price", { ascending: true })
              .limit(1),
          ]);

          return {
            ...acc,
            hero_photos: photos?.map((p) => p.photo_url) || [],
            min_price: rooms?.[0]?.base_price || null,
          };
        })
      );

      setAccommodations(enriched);
    } catch (error) {
      console.error("Failed to fetch accommodations:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) {
      // No dates selected — clear availability filter
      setAvailableAccIds(null);
      return;
    }

    setSearching(true);
    try {
      // Get all dates from check-in to the day before check-out (stay nights)
      const stayDates = eachDayOfInterval({
        start: checkIn,
        end: addDays(checkOut, -1),
      }).map((d) => format(d, "yyyy-MM-dd"));

      // Query room_inventory_pricing for all accommodations across all stay dates
      // We need to join through room_types to get accommodation_id
      const { data: roomTypes } = await supabase
        .from("room_types")
        .select("id, accommodation_id")
        .in(
          "accommodation_id",
          accommodations.map((a) => a.id)
        );

      if (!roomTypes || roomTypes.length === 0) {
        setAvailableAccIds(new Set());
        return;
      }

      const roomTypeIds = roomTypes.map((rt) => rt.id);
      const rtToAcc = new Map(roomTypes.map((rt) => [rt.id, rt.accommodation_id]));

      // Query inventory for all room types across the stay dates
      const { data: inventory } = await supabase
        .from("room_inventory_pricing")
        .select("room_type_id, date, available_rooms, is_available")
        .in("room_type_id", roomTypeIds)
        .in("date", stayDates);

      // For each accommodation, check if at least one room type has availability on ALL stay dates
      // Group inventory by accommodation -> room_type -> date
      const accRoomDateMap = new Map<string, Map<string, Map<string, { available: number; isAvailable: boolean }>>>();

      inventory?.forEach((inv) => {
        const accId = rtToAcc.get(inv.room_type_id);
        if (!accId) return;

        if (!accRoomDateMap.has(accId)) accRoomDateMap.set(accId, new Map());
        const roomMap = accRoomDateMap.get(accId)!;

        if (!roomMap.has(inv.room_type_id)) roomMap.set(inv.room_type_id, new Map());
        roomMap.get(inv.room_type_id)!.set(inv.date, {
          available: inv.available_rooms,
          isAvailable: inv.is_available !== false,
        });
      });

      const available = new Set<string>();

      accRoomDateMap.forEach((roomMap, accId) => {
        // Check if any room type has availability on all stay dates
        for (const [, dateMap] of roomMap) {
          const allDatesAvailable = stayDates.every((date) => {
            const info = dateMap.get(date);
            return info && info.isAvailable && info.available > 0;
          });
          if (allDatesAvailable) {
            available.add(accId);
            break; // One available room type is enough
          }
        }
      });

      setAvailableAccIds(available);
    } catch (error) {
      console.error("Availability check failed:", error);
      setAvailableAccIds(null);
    } finally {
      setSearching(false);
    }
  }, [checkIn, checkOut, accommodations]);

  const handleSearch = useCallback(() => {
    checkAvailability();
  }, [checkAvailability]);

  const filtered = useMemo(() => {
    let result = accommodations;

    // Text filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (acc) =>
          acc.name.toLowerCase().includes(q) ||
          acc.address?.toLowerCase().includes(q) ||
          acc.region_1?.toLowerCase().includes(q) ||
          acc.region_2?.toLowerCase().includes(q)
      );
    }

    // Availability filter
    if (availableAccIds !== null) {
      result = result.filter((acc) => availableAccIds.has(acc.id));
    }

    return result;
  }, [accommodations, searchQuery, availableAccIds]);

  // Group accommodations by region
  const regions = useMemo(() => {
    const map = new Map<string, number>();
    accommodations.forEach((acc) => {
      const region = acc.region_1 || "其他";
      map.set(region, (map.get(region) || 0) + 1);
    });
    return Array.from(map.entries());
  }, [accommodations]);

  const handleCardClick = (acc: AccommodationCard) => {
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", format(checkIn, "yyyy-MM-dd"));
    if (checkOut) params.set("checkOut", format(checkOut, "yyyy-MM-dd"));
    const qs = params.toString();
    navigate(`/booking/${acc.id}${qs ? `?${qs}` : ""}`);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCheckIn(undefined);
    setCheckOut(undefined);
    setAvailableAccIds(null);
  };

  const hasActiveFilters = searchQuery || availableAccIds !== null;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-24 object-contain" />
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
        <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20 text-center text-white">
          <h1 className="text-3xl md:text-5xl font-bold mb-3 drop-shadow-sm">
            探索優質民宿
          </h1>
          <p className="text-base md:text-lg opacity-90 mb-8">
            精選住宿 | 會員獨享優惠 | 安全付款
          </p>

          <PortalSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            checkIn={checkIn}
            checkOut={checkOut}
            onCheckInChange={setCheckIn}
            onCheckOutChange={setCheckOut}
            onSearch={handleSearch}
          />
        </div>
      </section>

      {/* ── Promo Cards ── */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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
              icon: Building2,
              title: "精選民宿",
              desc: `${accommodations.length} 間優質住宿`,
              color: "hsl(270, 60%, 55%)",
              bg: "hsl(270, 60%, 96%)",
            },
          ].map((promo, i) => (
            <Card
              key={i}
              className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              style={{ background: promo.bg }}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: promo.color }}
                >
                  <promo.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground">{promo.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{promo.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Region Quick Links ── */}
      {regions.length > 1 && (
        <section className="max-w-7xl mx-auto px-4 pb-6">
          <h2 className="text-xl font-bold text-foreground mb-4">熱門地區</h2>
          <div className="flex gap-2 flex-wrap">
            {regions.map(([region, count]) => (
              <Button
                key={region}
                variant="outline"
                size="sm"
                className="rounded-full gap-1 text-sm"
                onClick={() => setSearchQuery(region)}
              >
                <MapPin className="h-3.5 w-3.5" />
                {region}
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {count}
                </Badge>
              </Button>
            ))}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-sm text-muted-foreground"
                onClick={clearFilters}
              >
                清除篩選
              </Button>
            )}
          </div>
        </section>
      )}

      {/* ── Accommodation List ── */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">
            {searchQuery
              ? `「${searchQuery}」的搜尋結果`
              : availableAccIds !== null
              ? "可訂住宿"
              : "推薦住宿"}
          </h2>
          <span className="text-sm text-muted-foreground">
            {searching ? "搜尋中..." : `共 ${filtered.length} 家`}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">
              {availableAccIds !== null
                ? "所選日期沒有可訂住宿"
                : "沒有找到符合條件的民宿"}
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
            {filtered.map((acc) => (
              <Card
                key={acc.id}
                className="overflow-hidden cursor-pointer group border-border/50 hover:border-border"
                onClick={() => handleCardClick(acc)}
              >
                {/* Image */}
                <div className="relative h-44 bg-muted overflow-hidden">
                  {acc.hero_photos[0] ? (
                    <img
                      src={acc.hero_photos[0]}
                      alt={acc.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: "hsl(25, 60%, 95%)" }}
                    >
                      <Building2
                        className="h-12 w-12"
                        style={{ color: "hsl(25, 60%, 75%)" }}
                      />
                    </div>
                  )}
                  {acc.type && (
                    <Badge
                      className="absolute top-3 left-3 text-xs font-medium border-none text-white"
                      style={{ background: "hsla(25, 70%, 45%, 0.85)" }}
                    >
                      {acc.type}
                    </Badge>
                  )}
                </div>

                {/* Info */}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-base line-clamp-1 text-foreground">
                      {acc.name}
                    </h3>
                    {acc.star_rating && (
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        style={{ color: "hsl(40, 90%, 50%)" }}
                      >
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="text-xs font-medium">{acc.star_rating}</span>
                      </div>
                    )}
                  </div>

                  {(acc.region_1 || acc.region_2) && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-3">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {[acc.region_1, acc.region_2].filter(Boolean).join(" ")}
                    </p>
                  )}

                  {/* Price & CTA */}
                  <div className="flex items-end justify-between pt-2 border-t border-border/50">
                    {acc.min_price ? (
                      <div>
                        <span className="text-xs text-muted-foreground">每晚最低</span>
                        <p
                          className="font-bold text-lg"
                          style={{ color: "hsl(25, 70%, 50%)" }}
                        >
                          NT$ {acc.min_price.toLocaleString()}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">洽詢價格</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs gap-1 shrink-0 text-primary hover:text-white"
                    >
                      查看詳情
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <BookingFooter />
    </div>
  );
};

export default BookingPortal;
