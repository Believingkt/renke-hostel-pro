import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import type { CarouselApi } from "@/components/ui/carousel";
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
  UserCheck,
  Camera,
  Wifi,
  ParkingCircle,
  Coffee,
  Search,
  Facebook,
  Instagram
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

const roomImages: Record<string, string[]> = {
  "12人包區": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "14人包區": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "16人包區": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
  "18人包區": [roomDeluxe, roomStandard, roomSuite, roomDeluxe, roomStandard],
  // 也保留舊的房型名稱以防萬一
  "豪華和室": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "精緻套房": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "標準客房": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
};

const Booking = () => {
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [guests, setGuests] = useState(2);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;

    setCurrent(carouselApi.selectedScrollSnap());

    carouselApi.on("select", () => {
      setCurrent(carouselApi.selectedScrollSnap());
    });
  }, [carouselApi]);

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
            <h1 className="text-xl font-bold text-primary">{accommodationInfo?.name || "森山寫照"}</h1>
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
              交通地圖
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
          setApi={setCarouselApi}
        >
          <CarouselContent>
            {[heroSlide1, heroSlide2, heroSlide3].map((img, index) => (
              <CarouselItem key={index}>
                <div className="relative h-[500px] md:h-[600px] w-full">
                  <img 
                    src={img} 
                    alt={`山景 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-center text-white space-y-4 max-w-4xl px-4">
                      <h1 className="text-5xl md:text-7xl font-bold animate-fade-in">
                        {accommodationInfo?.name || "森山寫照"}
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
          
          {/* 輪播指示器（圓點） */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => carouselApi?.scrollTo(index)}
                className={`h-2 rounded-full transition-all ${
                  current === index 
                    ? "w-8 bg-white" 
                    : "w-2 bg-white/50 hover:bg-white/75"
                }`}
                aria-label={`切換到第 ${index + 1} 張圖片`}
              />
            ))}
          </div>
        </Carousel>

        {/* 搜尋卡片 - 在輪播內部 */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 z-20">
          <Card className="shadow-2xl bg-white border-0 rounded-2xl">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    入住日期
                  </Label>
                  <div className="relative flex items-center h-12 px-3 border rounded-md bg-background">
                    <span className="text-base text-foreground pointer-events-none">
                      {checkInDate || "選擇日期"}
                    </span>
                    <Input 
                      type="date" 
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="absolute opacity-0 inset-0 cursor-pointer min-h-0 h-full border-0 shadow-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    退房日期
                  </Label>
                  <div className="relative flex items-center h-12 px-3 border rounded-md bg-background">
                    <span className="text-base text-foreground pointer-events-none">
                      {checkOutDate || "選擇日期"}
                    </span>
                    <Input 
                      type="date" 
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="absolute opacity-0 inset-0 cursor-pointer min-h-0 h-full border-0 shadow-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    住宿人數
                  </Label>
                  <div className="flex items-center h-12 px-3 border rounded-md bg-background">
                    <span className="text-base text-foreground">{guests}位大人 · 1間客房</span>
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
      <section className="py-20">
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
                { icon: UserCheck, title: "管家服務", desc: "客製化的管家服務，一天僅接待 1 組貴賓" },
                { icon: Camera, title: "寫真棚拍", desc: "森山寫照用專業攝影替您紀錄珍貴的親友相聚時光" },
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
                  設施服務
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
              {roomTypes.map((room) => {
                const images = roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
                return (
                  <Card key={room.id} className="overflow-hidden hover:shadow-xl transition-shadow group border-0 rounded-2xl">
                    <div className="aspect-[4/3] overflow-hidden rounded-t-2xl relative">
                      <Carousel className="w-full h-full">
                        <CarouselContent className="h-full">
                          {images.map((image, index) => (
                            <CarouselItem key={index} className="h-full">
                              <img
                                src={image} 
                                alt={`${room.name} - ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                        <CarouselPrevious className="left-2" />
                        <CarouselNext className="right-2" />
                      </Carousel>
                    </div>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-5 w-5 text-primary" />
                      <span className="text-sm text-primary font-medium">{room.capacity}人</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-2 text-foreground">{room.name}</h3>
                    <p className="text-base text-primary mb-4 font-normal">{room.name_en}</p>
                    <p className="text-sm mb-6 text-muted-foreground leading-relaxed">{room.description}</p>
                    
                    <div className="flex items-center gap-4 mb-6 text-sm text-foreground font-medium">
                      <span>{room.capacity}人</span>
                      <span>{room.size_sqm}㎡</span>
                      <span>山景陽台</span>
                      <span>免費WiFi</span>
                    </div>

                    <Separator className="my-6" />
                    
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">起價</p>
                        <p className="text-3xl font-bold text-primary">
                          NT$ {room.base_price.toLocaleString()}
                        </p>
                      </div>
                      <Button className="bg-primary hover:bg-primary/90 rounded-lg px-6 h-11 font-medium">
                        立即預訂
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
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
            <h2 className="text-4xl font-bold text-center mb-4">交通地圖</h2>
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
      <footer className="bg-[#1a3a33] text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12 mb-12">
              {/* 左側 - Logo 與社交媒體 */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Mountain className="h-8 w-8 text-white" />
                  <h3 className="text-2xl font-bold">{accommodationInfo?.name || "森山寫照"}</h3>
                </div>
                <p className="text-white/80 mb-6">山間的寧靜時光</p>
                <div className="flex gap-4">
                  <a href="#" className="hover:text-primary transition-colors" aria-label="Facebook">
                    <Facebook className="h-5 w-5" />
                  </a>
                  <a href="#" className="hover:text-primary transition-colors" aria-label="Instagram">
                    <Instagram className="h-5 w-5" />
                  </a>
                </div>
              </div>

              {/* 中間 - 快速連結 */}
              <div>
                <h4 className="text-lg font-semibold mb-6">快速連結</h4>
                <ul className="space-y-3">
                  <li>
                    <button onClick={() => scrollToSection("home")} className="text-white/80 hover:text-white transition-colors">
                      旅宿介紹
                    </button>
                  </li>
                  <li>
                    <button onClick={() => scrollToSection("rooms")} className="text-white/80 hover:text-white transition-colors">
                      房型導覽
                    </button>
                  </li>
                  <li>
                    <button onClick={() => scrollToSection("booking-info")} className="text-white/80 hover:text-white transition-colors">
                      訂房須知
                    </button>
                  </li>
                  <li>
                    <button onClick={() => scrollToSection("location")} className="text-white/80 hover:text-white transition-colors">
                      交通&地圖
                    </button>
                  </li>
                </ul>
              </div>

              {/* 右側 - 聯絡資訊 */}
              <div>
                <h4 className="text-lg font-semibold mb-6">聯絡資訊</h4>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-white/80 flex-shrink-0 mt-0.5" />
                    <span className="text-white/80">{accommodationInfo?.address || "台灣南投縣信義鄉東埔村開高巷123號"}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-white/80 flex-shrink-0" />
                    <span className="text-white/80">+886-49-270-1234</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-white/80 flex-shrink-0" />
                    <span className="text-white/80">info@moriyama-shazo.com</span>
                  </li>
                </ul>
              </div>
            </div>

            <Separator className="my-8 bg-white/20" />
            
            <p className="text-center text-white/60 text-sm">
              © 2026 森山寫照. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Booking;
