import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
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
  Star
} from "lucide-react";

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

const Booking = () => {
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState("home");
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [guests, setGuests] = useState(2);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section) {
      setActiveSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchAccommodationData();
  }, []);

  const fetchAccommodationData = async () => {
    // 獲取旅宿資訊
    const { data: infoData } = await supabase
      .from("accommodation_info")
      .select("*")
      .single();
    
    if (infoData) {
      setAccommodationInfo(infoData);

      // 獲取房型資訊
      const { data: roomsData } = await supabase
        .from("room_types")
        .select("*")
        .eq("accommodation_id", infoData.id)
        .order("display_order");
      
      if (roomsData) {
        setRoomTypes(roomsData);
      }

      // 獲取訂房設定
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
            <h1 className="text-xl font-bold text-primary">{accommodationInfo?.name || "人客多 PMS"}</h1>
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
            <Button className="gap-2">
              立即訂房
            </Button>
          </nav>
        </div>
      </header>

      {/* 英雄區塊 */}
      <section id="home" className="pt-20 pb-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {/* 主標題 */}
            <div className="text-center mb-12 space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold">{accommodationInfo?.name}</h1>
              <p className="text-xl text-muted-foreground">山間的寧靜時光</p>
              <p className="text-lg">體驗日式美學與自然的完美融合</p>
            </div>

            {/* 搜尋卡片 */}
            <Card className="max-w-4xl mx-auto shadow-lg">
              <CardContent className="p-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      入住日期
                    </Label>
                    <Input 
                      type="date" 
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      退房日期
                    </Label>
                    <Input 
                      type="date" 
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      住宿人數
                    </Label>
                    <Input 
                      type="number" 
                      min="1"
                      value={guests}
                      onChange={(e) => setGuests(parseInt(e.target.value))}
                      placeholder="2位大人 · 1間客房"
                    />
                  </div>
                </div>
                <Button className="w-full mt-4" size="lg">
                  搜尋空房
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 旅宿介紹 */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">旅宿介紹</h2>
            <p className="text-center text-muted-foreground mb-12">
              {accommodationInfo?.description}
            </p>

            {/* 特色卡片 */}
            <div className="grid md:grid-cols-4 gap-6 mb-12">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Mountain className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold mb-2">山林環抱</h3>
                  <p className="text-sm text-muted-foreground">坐落於群山之間，遠離喧囂</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold mb-2">日式美學</h3>
                  <p className="text-sm text-muted-foreground">傳統與現代的完美結合</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Clock3 className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold mb-2">全天服務</h3>
                  <p className="text-sm text-muted-foreground">24小時貼心服務</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold mb-2">安心保障</h3>
                  <p className="text-sm text-muted-foreground">完善的安全設施</p>
                </CardContent>
              </Card>
            </div>

            {/* 設施與服務 */}
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold mb-4">設施與服務</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Wifi className="h-5 w-5 text-primary" />
                    <span>免費無線網路</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ParkingCircle className="h-5 w-5 text-primary" />
                    <span>免費停車場</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <span>24小時櫃台服務</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Coffee className="h-5 w-5 text-primary" />
                    <span>迎賓茶水服務</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 房型導覽 */}
      <section id="rooms" className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">房型導覽</h2>
            <p className="text-center text-muted-foreground mb-12">
              精心設計的客房空間，讓您在山林間享受寧靜舒適的住宿體驗
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {roomTypes.map((room) => (
                <Card key={room.id} className="overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <p className="text-muted-foreground">房型照片</p>
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{room.capacity}人</span>
                    </div>
                    <h3 className="text-xl font-semibold mb-1">{room.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{room.name_en}</p>
                    <p className="text-sm mb-4">{room.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant="secondary">{room.capacity}人</Badge>
                      <Badge variant="secondary">{room.size_sqm}㎡</Badge>
                      <Badge variant="secondary">免費WiFi</Badge>
                    </div>

                    <Separator className="my-4" />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">起價</p>
                        <p className="text-2xl font-bold text-primary">NT$ {room.base_price.toLocaleString()}</p>
                      </div>
                      <Button>立即預訂</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 訂房須知 */}
      <section id="booking-info" className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">訂房須知</h2>
            <p className="text-center text-muted-foreground mb-12">
              為確保您有愉快的住宿體驗，請詳閱以下訂房相關資訊
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* 入住時間 */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    入住時間
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p>入住：{bookingSettings?.check_in_time} 之後</p>
                    <p>退房：{bookingSettings?.check_out_time} 之前</p>
                  </div>
                </CardContent>
              </Card>

              {/* 付款方式 */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    付款方式
                  </h3>
                  <div className="space-y-2">
                    {bookingSettings?.payment_methods?.map((method, index) => (
                      <Badge key={index} variant="secondary">{method}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 取消政策 */}
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">取消政策</h3>
                  <p className="text-sm">{bookingSettings?.cancellation_policy}</p>
                </CardContent>
              </Card>

              {/* 重要事項 */}
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">重要事項</h3>
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
      <section id="location" className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">交通 & 地圖</h2>
            <p className="text-center text-muted-foreground mb-12">
              多種交通方式輕鬆抵達，讓您的旅程更加便利
            </p>

            <Card className="mb-6">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  位置資訊
                </h3>
                <p className="text-sm mb-4">{accommodationInfo?.address}</p>
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">地圖載入中...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 頁尾 */}
      <footer className="bg-muted py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="text-xl font-semibold mb-4">{accommodationInfo?.name}</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
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
            <Separator className="my-6" />
            <p className="text-sm text-muted-foreground">
              © 2024 {accommodationInfo?.name}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Booking;
