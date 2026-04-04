import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, Star, Users, Calendar, User, LogIn } from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

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

  const fetchAccommodations = async () => {
    try {
      const { data: accs, error } = await supabase
        .from("accommodation_info")
        .select("id, name, description, address, region_1, region_2, star_rating, short_url_alias, type")
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      if (!accs) return;

      // Fetch hero photos and min prices for each accommodation
      const enriched = await Promise.all(
        accs.map(async (acc) => {
          const { data: photos } = await supabase
            .from("accommodation_photos")
            .select("photo_url")
            .eq("accommodation_id", acc.id)
            .eq("photo_type", "hero")
            .order("display_order", { ascending: true })
            .limit(1);

          const { data: rooms } = await supabase
            .from("room_types")
            .select("base_price")
            .eq("accommodation_id", acc.id)
            .order("base_price", { ascending: true })
            .limit(1);

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

  const filtered = accommodations.filter((acc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      acc.name.toLowerCase().includes(q) ||
      acc.address?.toLowerCase().includes(q) ||
      acc.region_1?.toLowerCase().includes(q) ||
      acc.region_2?.toLowerCase().includes(q)
    );
  });

  const handleCardClick = (acc: AccommodationCard) => {
    if (acc.short_url_alias) {
      navigate(`/${acc.short_url_alias}`);
    } else {
      navigate(`/?accId=${acc.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <h1 className="text-xl font-bold" style={{ color: "hsl(24, 100%, 50%)" }}>
              人客多
            </h1>
            <span className="text-sm text-muted-foreground hidden sm:inline">訂房平台</span>
          </Link>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/member/profile")}
                className="gap-1"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{memberName || "會員中心"}</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate("/member/auth")}
                className="gap-1 bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">登入 / 註冊</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: "hsl(24, 100%, 40%)" }}>
            探索優質住宿
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            人客多精選民宿，讓每次旅行都成為美好回憶
          </p>
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="搜尋地區、民宿名稱..."
              className="pl-12 h-12 text-base rounded-full shadow-md border-orange-200 focus-visible:ring-orange-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Accommodation List */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <Skeleton className="h-48 rounded-t-lg" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">目前沒有符合條件的民宿</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((acc) => (
              <Card
                key={acc.id}
                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => handleCardClick(acc)}
              >
                <div className="relative h-48 bg-muted overflow-hidden">
                  {acc.hero_photos[0] ? (
                    <img
                      src={acc.hero_photos[0]}
                      alt={acc.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-orange-100">
                      <MapPin className="h-12 w-12 text-orange-300" />
                    </div>
                  )}
                  {acc.min_price && (
                    <Badge className="absolute bottom-3 right-3 bg-white/90 text-foreground shadow">
                      NT$ {acc.min_price.toLocaleString()} 起
                    </Badge>
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-lg line-clamp-1">{acc.name}</h3>
                    {acc.star_rating && (
                      <div className="flex items-center gap-0.5 text-amber-500 shrink-0">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="text-sm">{acc.star_rating}</span>
                      </div>
                    )}
                  </div>
                  {(acc.region_1 || acc.region_2) && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {[acc.region_1, acc.region_2].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {acc.type && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {acc.type}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} 人客多訂房平台. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default BookingPortal;
