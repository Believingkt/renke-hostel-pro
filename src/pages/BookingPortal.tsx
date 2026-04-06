import { useState, useEffect, useMemo } from "react";
import bookingHeroBg from "@/assets/booking-hero.jpg";
import lokezeLogo from "@/assets/lokeze-logo.png";
import BookingFooter from "@/components/BookingFooter";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  MapPin,
  Star,
  User,
  LogIn,
  CalendarDays,
  Users,
  ChevronRight,
  Gift,
  Ticket,
  TrendingUp,
  Building2,
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

  const filtered = useMemo(() => {
    if (!searchQuery) return accommodations;
    const q = searchQuery.toLowerCase();
    return accommodations.filter(
      (acc) =>
        acc.name.toLowerCase().includes(q) ||
        acc.address?.toLowerCase().includes(q) ||
        acc.region_1?.toLowerCase().includes(q) ||
        acc.region_2?.toLowerCase().includes(q)
    );
  }, [accommodations, searchQuery]);

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
    navigate(`/booking/${acc.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-24 object-contain" />
          </Link>

          {/* Spacer for flex layout */}
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
        style={{
          backgroundImage: `url(${bookingHeroBg})`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsla(25, 80%, 55%, 0.6) 0%, hsla(30, 90%, 60%, 0.5) 50%, hsla(35, 85%, 58%, 0.6) 100%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20 text-center text-white">
          <h1 className="text-3xl md:text-5xl font-bold mb-3 drop-shadow-sm">
            探索台灣優質民宿
          </h1>
          <p className="text-base md:text-lg opacity-90 mb-8">
            安全付款 | 精選住宿 | 會員獨享優惠
          </p>

          {/* Search Card */}
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6">
              <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-end">
                {/* Destination */}
                <div className="flex-1 text-left">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    目的地
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                    <Input
                      placeholder="城市、地區或民宿名稱"
                      className="!pl-10 h-10 border-border text-foreground"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Check-in / Check-out placeholders */}
                <div className="flex gap-3 flex-1">
                  <div className="flex-1 text-left">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      入住日期
                    </label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      <Input
                        placeholder="選擇日期"
                        className="!pl-10 h-10 border-border text-foreground"
                        readOnly
                      />
                    </div>
                  </div>
                  <div className="flex-1 text-left">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      退房日期
                    </label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      <Input
                        placeholder="選擇日期"
                        className="!pl-10 h-10 border-border text-foreground"
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                {/* Guests */}
                <div className="w-full md:w-36 text-left">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    房客人數
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                    <Input
                      placeholder="2 位成人"
                      className="!pl-10 h-10 border-border text-foreground"
                      readOnly
                    />
                  </div>
                </div>

                {/* Search Button */}
                <Button
                  className="h-10 px-8 rounded-lg text-white font-medium shrink-0"
                  style={{ background: "hsl(25, 70%, 55%)" }}
                >
                  <Search className="h-4 w-4 mr-2" />
                  搜尋
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mobile search (visible only on small) ── */}
      <div className="md:hidden px-4 -mt-4 relative z-10 mb-4">
        {/* Already handled by hero card */}
      </div>

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
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-sm text-muted-foreground"
                onClick={() => setSearchQuery("")}
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
            {searchQuery ? `「${searchQuery}」的搜尋結果` : "推薦住宿"}
          </h2>
          <span className="text-sm text-muted-foreground">
            共 {filtered.length} 間
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">沒有找到符合條件的民宿</p>
            <p className="text-sm mt-1">試試其他關鍵字或清除篩選</p>
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
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "hsl(25, 60%, 95%)" }}>
                      <Building2 className="h-12 w-12" style={{ color: "hsl(25, 60%, 75%)" }} />
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
                      <div className="flex items-center gap-0.5 shrink-0" style={{ color: "hsl(40, 90%, 50%)" }}>
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
                        <p className="font-bold text-lg" style={{ color: "hsl(25, 70%, 50%)" }}>
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
