import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { 
  Calendar,
  Users,
  MapPin,
  Clock,
  CreditCard,
  Phone,
  Mail,
  Mountain,
  Sparkles,
  Clock3,
  Shield,
  Wifi,
  ParkingCircle,
  Coffee,
  Search
} from "lucide-react";
import heroSlide1 from "@/assets/hero-slide-1.jpg";
import heroSlide2 from "@/assets/hero-slide-2.jpg";
import heroSlide3 from "@/assets/hero-slide-3.jpg";
import roomDeluxe from "@/assets/room-deluxe.jpg";
import roomSuite from "@/assets/room-suite.jpg";
import roomStandard from "@/assets/room-standard.jpg";

interface AccommodationInfo {
  id: string;
  name: string;
  description: string;
  address: string;
  check_in_notice: string;
}

interface RoomType {
  id: string;
  name: string;
  name_en: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
}

interface BookingSettings {
  check_in_time: string;
  check_out_time: string;
  cancellation_policy: string;
  payment_methods: any;
}

const roomImages: Record<string, string> = {
  "豪華和室": roomDeluxe,
  "精緻套房": roomSuite,
  "標準客房": roomStandard,
};

const Booking = () => {
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [guests, setGuests] = useState(2);

  useEffect(() => {
    fetchAccommodationData();
  }, []);

  const fetchAccommodationData = async () => {
    const { data: infoData } = await supabase
      .from("accommodation_info")
      .select("*")
      .single();
    
    if (infoData) {
      setAccommodationInfo(infoData);

      const { data: roomsData } = await supabase
        .from("room_types")
        .select("*")
        .eq("accommodation_id", infoData.id)
        .order("display_order");
      
      if (roomsData) {
        setRoomTypes(roomsData);
      }

      const { data: settingsData } = await supabase
        .from("booking_settings")
        .select("*")
        .eq("accommodation_id", infoData.id)
        .single();
      
      if (settingsData) {
        setBookingSettings(settingsData);
      }
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 導航欄 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mountain className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-primary">{accommodationInfo?.name || "森山寫造"}</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <button onClick={() => scrollToSection("home")} className="text-sm hover:text-primary transition-colors">
              旅宿介紹
            </button>
            <button onClick={() => scrollToSection("rooms")} className="text-sm hover:text-primary transition-colors">
              房型導覽
            </button>
            <button onClick={() => scrollToSection("booking-info")} className="text-sm hover:text-primary transition-colors">
              訂房須知
            </button>
            <button onClick={() => scrollToSection("location")} className="text-sm hover:text-primary transition-colors">
              交通 & 地圖
            </button>
            <Button className="bg-primary hover:bg-primary/90">
              立即訂房
            </Button>
          </nav>
        </div>
      </header>

      {/* 英雄輪播區塊 */}
      <section id="home" className="pt-16 relative">
        <Carousel
          opts={{ loop: true }}
          plugins={[Autoplay({ delay: 5000 })]}
          className="w-full"
        >
          <CarouselContent>
            {[heroSlide1, heroSlide2, heroSlide3].map((img, index) => (
              <CarouselItem key={index}>
                <div className="relative h-[600px] w-full">
                  <img 
                    src={img} 
                    alt={`山景 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-center text-white space-y-4 max-w-4xl px-4">
                      <h1 className="text-5xl md:text-7xl font-bold animate-fade-in">
                        {accommodationInfo?.name || "森山寫造"}
                      </h1>
                      <p className="text-2xl md:text-3xl animate-fade-in" style={{ animationDelay: "0.2s" }}>
                        山間的寧靜時光
                      </p>
                      <p className="text-lg md:text-xl animate-fade-in" style={{ animationDelay: "0.4s" }}>
                        體驗日式美學與自然的完美融合
                      </p>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-4" />
          <CarouselNext className="right-4" />
        </Carousel>

        {/* 搜尋卡片 - 疊加在輪播上 */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-full max-w-5xl px-4">
          <Card className="shadow-2xl bg-white border-0">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-base font-medium text-primary">
                    <Calendar className="h-5 w-5" />
                    入住日期
                  </Label>
                  <Input 
                    type="date" 
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="h-12 text-base"
                    placeholder="選擇日期"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-base font-medium text-primary">
                    <Calendar className="h-5 w-5" />
                    退房日期
                  </Label>
                  <Input 
                    type="date" 
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="h-12 text-base"
                    placeholder="選擇日期"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-base font-medium text-primary">
                    <Users className="h-5 w-5" />
                    住宿人數
                  </Label>
                  <div className="relative">
                    <Input 
                      type="number" 
                      min="1"
                      value={guests}
                      onChange={(e) => setGuests(parseInt(e.target.value))}
                      className="h-12 text-base pr-24"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                      位大人
                    </span>
                  </div>
                </div>
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90 text-white text-lg h-14 font-medium rounded-lg shadow-lg hover:shadow-xl transition-all" size="lg">
                <Search className="mr-2 h-5 w-5" />
                搜尋空房
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 旅宿介紹 */}
      <section className="py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-center mb-4">旅宿介紹</h2>
            <p className="text-center text-muted-foreground mb-16 text-lg">
              {accommodationInfo?.description}
            </p>

            <div className="grid md:grid-cols-4 gap-6 mb-16">
              {[
                { icon: Mountain, title: "山林環抱", desc: "坐落於群山之間，遠離喧囂，享受大自然的靜謐" },
                { icon: Sparkles, title: "日式美學", desc: "融合傳統日式設計與現代舒適，打造獨特住宿體驗" },
                { icon: Clock3, title: "全天服務", desc: "24小時貼心服務，隨時為您提供協助與支援" },
                { icon: Shield, title: "安心保障", desc: "完善的安全設施與衛生標準，讓您住得安心" },
              ].map((item, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-8 pb-6 text-center">
                    <item.icon className="h-14 w-14 mx-auto mb-4 text-primary" />
                    <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-xl mb-6 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  設施與服務
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Wifi, text: "免費無線網路" },
                    { icon: ParkingCircle, text: "免費停車場" },
                    { icon: Clock, text: "24小時櫃台服務" },
                    { icon: Coffee, text: "迎賓茶水服務" },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 rounded-lg hover:bg-primary/5 transition-colors">
                      <item.icon className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-sm">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 房型導覽 */}
      <section id="rooms" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold text-center mb-4">房型導覽</h2>
            <p className="text-center text-muted-foreground mb-16 text-lg">
              精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {roomTypes.map((room) => (
                <Card key={room.id} className="overflow-hidden hover:shadow-xl transition-shadow group">
                  <div className="aspect-[4/3] overflow-hidden">
                    <img 
                      src={roomImages[room.name] || roomStandard} 
                      alt={room.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">{room.capacity}人</span>
                    </div>
                    <h3 className="text-2xl font-semibold mb-2">{room.name}</h3>
                    <p className="text-sm text-primary mb-4">{room.name_en}</p>
                    <p className="text-sm mb-6 text-muted-foreground">{room.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      <Badge variant="secondary">
                        {room.capacity}人
                      </Badge>
                      <Badge variant="secondary">
                        {room.size_sqm}㎡
                      </Badge>
                      <Badge variant="secondary">
                        山景陽台
                      </Badge>
                      <Badge variant="secondary">
                        免費WiFi
                      </Badge>
                    </div>

                    <Separator className="my-4" />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">起價</p>
                        <p className="text-3xl font-bold text-primary">
                          NT$ {room.base_price.toLocaleString()}
                        </p>
                      </div>
                      <Button className="bg-primary hover:bg-primary/90">
                        立即預訂
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 訂房須知 */}
      <section id="booking-info" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-center mb-4">訂房須知</h2>
            <p className="text-center text-muted-foreground mb-16 text-lg">
              為確保您有愉快的住宿體驗，請詳閱以下訂房相關資訊
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    入住時間
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>入住：</strong>{bookingSettings?.check_in_time} 之後</p>
                    <p><strong>退房：</strong>{bookingSettings?.check_out_time} 之前</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    付款方式
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(bookingSettings?.payment_methods) 
                      ? bookingSettings.payment_methods.map((method: string, index: number) => (
                          <Badge key={index} variant="secondary">
                            {method}
                          </Badge>
                        ))
                      : null
                    }
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4">取消政策</h3>
                  <p className="text-sm">{bookingSettings?.cancellation_policy}</p>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4">重要事項</h3>
                  <div className="whitespace-pre-wrap text-sm">
                    {accommodationInfo?.check_in_notice}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* 交通 & 地圖 */}
      <section id="location" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-center mb-4">交通 & 地圖</h2>
            <p className="text-center text-muted-foreground mb-16 text-lg">
              多種交通方式輕鬆抵達，讓您的旅程更加便利
            </p>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  位置資訊
                </h3>
                <p className="text-sm mb-6">{accommodationInfo?.address}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  位於風景秀麗的山區，周邊有多處自然景點與步道
                </p>
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">地圖載入中...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 頁尾 */}
      <footer className="bg-foreground text-background py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="text-2xl font-semibold mb-6">{accommodationInfo?.name || "森山寫造"}</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm mb-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{accommodationInfo?.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>聯絡電話</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>電子郵件</span>
              </div>
            </div>
            <Separator className="my-6 bg-white/20" />
            <p className="text-sm opacity-80">
              © 2024 {accommodationInfo?.name || "森山寫造"}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Booking;
