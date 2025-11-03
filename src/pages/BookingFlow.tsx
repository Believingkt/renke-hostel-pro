import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Users,
  CreditCard,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  User,
  Home,
  X,
  ZoomIn,
} from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import roomDeluxe from "@/assets/room-deluxe.jpg";
import roomSuite from "@/assets/room-suite.jpg";
import roomStandard from "@/assets/room-standard.jpg";
import sensanLogo from "@/assets/sensan-logo-new.png";

// 表單驗證 Schema
const guestInfoSchema = z.object({
  name: z.string().trim().min(2, { message: "姓名至少需要2個字元" }).max(50, { message: "姓名不能超過50個字元" }),
  phone: z.string().trim().regex(/^09\d{8}$/, { message: "請輸入有效的手機號碼（09開頭，共10碼）" }),
  email: z.string().trim().email({ message: "請輸入有效的電子郵件地址" }).max(100, { message: "電子郵件不能超過100個字元" }),
  address: z.string().trim().max(200, { message: "地址不能超過200個字元" }).optional(),
  notes: z.string().trim().max(500, { message: "備註不能超過500個字元" }).optional(),
});

// 房型圖片映射
const roomImages: Record<string, string[]> = {
  "12人包區": [roomDeluxe, roomSuite, roomStandard, roomDeluxe, roomSuite],
  "14人包區": [roomSuite, roomStandard, roomDeluxe, roomSuite, roomStandard],
  "16人包區": [roomStandard, roomDeluxe, roomSuite, roomStandard, roomDeluxe],
  "18人包區": [roomDeluxe, roomStandard, roomSuite, roomDeluxe, roomStandard],
};

interface RoomType {
  id: string;
  name: string;
  name_en: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
  weekdayPricing?: { type: string; price: number }[];
  weekendPricing?: { type: string; price: number }[];
}

interface BookingSettings {
  check_in_time: string;
  check_out_time: string;
  use_deposit: boolean;
  deposit_percentage: number;
  payment_methods: any;
}

type BookingStep = "room" | "dates" | "guest" | "payment" | "confirm";

const BookingFlow = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { accommodationId, isLoading: subdomainLoading, error: subdomainError } = useSubdomain();
  const { 
    checkInDate, 
    setCheckInDate, 
    checkOutDate, 
    setCheckOutDate, 
    guests: contextGuests = { adults: 2, children: 0 }
  } = useAccommodation();
  
  const [currentStep, setCurrentStep] = useState<BookingStep>("room");
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [accommodationName, setAccommodationName] = useState("森山寫照");
  
  // 固定的包區資料，與首頁保持一致
  const roomTypes: RoomType[] = [
    {
      id: "12-people",
      name: "12人包區",
      name_en: "三間房 | 四人：3間",
      description: "適合中小型團體的豪華包區，提供完整的露營設施與舒適空間",
      capacity: 12,
      size_sqm: 150,
      base_price: 30000,
      weekdayPricing: [
        { type: "一泊二食", price: 30000 },
        { type: "一泊三食", price: 38400 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 33000 },
        { type: "一泊三食", price: 42000 },
      ],
    },
    {
      id: "14-people",
      name: "14人包區",
      name_en: "四間房 | 雙人1間 +四人3間",
      description: "寬敞舒適的包區空間，適合家庭或朋友團體聚會",
      capacity: 14,
      size_sqm: 180,
      base_price: 32700,
      weekdayPricing: [
        { type: "一泊二食", price: 32700 },
        { type: "一泊三食", price: 42500 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 36000 },
        { type: "一泊三食", price: 46500 },
      ],
    },
    {
      id: "16-people",
      name: "16人包區",
      name_en: "五間房 | 雙人2間 +四人3間",
      description: "大型團體的理想選擇，享受自然與慢活的豪華體驗",
      capacity: 16,
      size_sqm: 200,
      base_price: 38700,
      weekdayPricing: [
        { type: "一泊二食", price: 38700 },
        { type: "一泊三食", price: 49900 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 42500 },
        { type: "一泊三食", price: 54500 },
      ],
    },
    {
      id: "18-people",
      name: "18人包區",
      name_en: "18 People Package",
      description: "最大容量包區，提供頂級的團體露營體驗",
      capacity: 18,
      size_sqm: 220,
      base_price: 49500,
      weekdayPricing: [
        { type: "一泊二食", price: 49500 },
        { type: "一泊三食", price: 62100 },
      ],
      weekendPricing: [
        { type: "一泊二食", price: 54600 },
        { type: "一泊三食", price: 67200 },
      ],
    },
  ];
  
  // 訂房資料
  const [selectedRoom, setSelectedRoom] = useState<RoomType | null>(null);
  const [guestInfo, setGuestInfo] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [paymentMethod, setPaymentMethod] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    type: "percentage" | "amount";
    value: number;
  } | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [selectedImageRoom, setSelectedImageRoom] = useState<RoomType | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // 將 context 日期轉換為字串格式，並提供預設值
  const checkInDateStr = checkInDate ? format(checkInDate, "yyyy-MM-dd") : "";
  const checkOutDateStr = checkOutDate ? format(checkOutDate, "yyyy-MM-dd") : "";
  const totalGuests = (contextGuests?.adults || 2) + (contextGuests?.children || 0);

  useEffect(() => {
    if (subdomainLoading || !accommodationId) return;
    
    const loadData = async () => {
      try {
        const { data: infoData } = await supabase
          .from("accommodation_info")
          .select("name")
          .eq("id", accommodationId)
          .single();
        
        if (infoData) {
          setAccommodationName(infoData.name);
        }

        const { data: settingsData } = await supabase
          .from("booking_settings")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .maybeSingle();
        
        if (settingsData) {
          setBookingSettings(settingsData);
        }
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "載入失敗",
          description: "無法載入訂房資訊，請稍後再試",
          variant: "destructive",
        });
      }
    };

    loadData();
  }, [accommodationId, subdomainLoading, toast]);

  // 處理從房型頁面傳來的 roomId 參數
  useEffect(() => {
    const roomId = searchParams.get("roomId");
    if (roomId && !selectedRoom) {
      const room = roomTypes.find((r) => r.id === roomId);
      if (room) {
        setSelectedRoom(room);
        setCurrentStep("dates");
      }
    }
  }, [searchParams, selectedRoom]);

  const calculateNights = () => {
    if (!checkInDateStr || !checkOutDateStr) return 0;
    const start = new Date(checkInDateStr);
    const end = new Date(checkOutDateStr);
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const calculateTotal = () => {
    if (!selectedRoom) return 0;
    const nights = calculateNights();
    return selectedRoom.base_price * nights;
  };

  const calculateDiscount = () => {
    if (!appliedDiscount) return 0;
    const total = calculateTotal();
    if (appliedDiscount.type === "percentage") {
      return Math.round(total * (appliedDiscount.value / 100));
    }
    return appliedDiscount.value;
  };

  const calculateFinalTotal = () => {
    return Math.max(0, calculateTotal() - calculateDiscount());
  };

  const calculateDeposit = () => {
    if (!bookingSettings?.use_deposit) return 0;
    return Math.round(calculateFinalTotal() * (bookingSettings.deposit_percentage / 100));
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) {
      toast({
        title: "請輸入折扣代碼",
        variant: "destructive",
      });
      return;
    }

    setIsValidatingCode(true);
    
    // 模擬驗證折扣代碼（實際應該從後台 API 驗證）
    // 這裡使用硬編碼的測試折扣碼
    const testDiscounts = [
      { code: "ABC12", type: "percentage" as const, value: 10 },
      { code: "XYZ34", type: "amount" as const, value: 500 },
    ];

    const foundDiscount = testDiscounts.find(
      (d) => d.code.toUpperCase() === discountCode.trim().toUpperCase()
    );

    setTimeout(() => {
      if (foundDiscount) {
        setAppliedDiscount(foundDiscount);
        toast({
          title: "折扣代碼已套用",
          description: `已套用 ${
            foundDiscount.type === "percentage"
              ? `${foundDiscount.value}% 折扣`
              : `NT$ ${foundDiscount.value} 折扣`
          }`,
        });
      } else {
        toast({
          title: "折扣代碼無效",
          description: "請檢查您的折扣代碼是否正確",
          variant: "destructive",
        });
      }
      setIsValidatingCode(false);
    }, 500);
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    toast({
      title: "已移除折扣代碼",
    });
  };

  const handleNextStep = () => {
    // 驗證當前步驟
    if (currentStep === "room" && !selectedRoom) {
      toast({
        title: "請選擇房型",
        description: "請先選擇一個房型以繼續",
        variant: "destructive",
      });
      return;
    }
    
    if (currentStep === "dates") {
      if (!checkInDateStr || !checkOutDateStr) {
        toast({
          title: "請選擇日期",
          description: "請選擇入住和退房日期",
          variant: "destructive",
        });
        return;
      }
      if (new Date(checkOutDateStr) <= new Date(checkInDateStr)) {
        toast({
          title: "日期錯誤",
          description: "退房日期必須晚於入住日期",
          variant: "destructive",
        });
        return;
      }
    }

    if (currentStep === "guest") {
      // 驗證客人資訊
      try {
        guestInfoSchema.parse(guestInfo);
        setErrors({});
      } catch (error) {
        if (error instanceof z.ZodError) {
          const newErrors: Record<string, string> = {};
          error.errors.forEach((err) => {
            if (err.path[0]) {
              newErrors[err.path[0].toString()] = err.message;
            }
          });
          setErrors(newErrors);
          toast({
            title: "表單驗證失敗",
            description: "請檢查並修正表單中的錯誤",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (currentStep === "payment" && !paymentMethod) {
      toast({
        title: "請選擇付款方式",
        description: "請選擇一個付款方式以繼續",
        variant: "destructive",
      });
      return;
    }

    // 切換到下一步
    const steps: BookingStep[] = ["room", "dates", "guest", "payment", "confirm"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevStep = () => {
    const steps: BookingStep[] = ["room", "dates", "guest", "payment", "confirm"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleConfirmBooking = () => {
    toast({
      title: "訂房成功！",
      description: "這是測試用的訂房系統，您的訂單並未真正送出",
    });
    setTimeout(() => {
      navigate("/");
    }, 2000);
  };

  if (subdomainLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (subdomainError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive mb-2">{subdomainError}</p>
          <Button onClick={() => navigate("/")} variant="outline">
            返回首頁
          </Button>
        </div>
      </div>
    );
  }

  const stepIndicators = [
    { key: "room", label: "選擇房型", icon: Home },
    { key: "dates", label: "選擇日期", icon: Calendar },
    { key: "guest", label: "填寫資訊", icon: User },
    { key: "payment", label: "付款方式", icon: CreditCard },
    { key: "confirm", label: "確認訂單", icon: CheckCircle },
  ];

  const currentStepIndex = stepIndicators.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <img src={sensanLogo} alt={accommodationName} className="h-14 w-auto" />
          </Link>
          <Button variant="ghost" onClick={() => navigate("/")} size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回首頁
          </Button>
        </div>
      </header>

      {/* Progress Indicator */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {stepIndicators.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                        isCompleted
                          ? "bg-primary border-primary text-primary-foreground"
                          : isActive
                          ? "border-primary text-primary"
                          : "border-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium hidden sm:block ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < stepIndicators.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 transition-colors ${
                        isCompleted ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          {/* Left: Form Content */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">
                  {currentStep === "room" && "選擇房型"}
                  {currentStep === "dates" && "選擇入住日期"}
                  {currentStep === "guest" && "填寫旅客資訊"}
                  {currentStep === "payment" && "選擇付款方式"}
                  {currentStep === "confirm" && "確認訂單"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step 1: Room Selection */}
                {currentStep === "room" && (
                  <div className="space-y-4">
                    {roomTypes.map((room) => (
                      <Card
                        key={room.id}
                        className={`cursor-pointer transition-all hover:shadow-md overflow-hidden ${
                          selectedRoom?.id === room.id
                            ? "border-2 border-primary shadow-md"
                            : "border"
                        }`}
                        onClick={() => setSelectedRoom(room)}
                      >
                        <div className="grid md:grid-cols-2 gap-0">
                          {/* 左側圖片 */}
                          <div className="relative bg-muted overflow-hidden h-[400px]">
                            <Carousel className="w-full !h-[400px]">
                              <CarouselContent className="!ml-0 !h-[400px]">
                                {(roomImages[room.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard]).map((image, index) => (
                                  <CarouselItem key={index} className="!pl-0 basis-full !h-[400px]">
                                    <div 
                                      className="relative cursor-pointer group/image w-full !h-[400px]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedImageRoom(room);
                                        setSelectedImageIndex(index);
                                        setIsImageDialogOpen(true);
                                      }}
                                    >
                                      <img 
                                        src={image} 
                                        alt={`${room.name} - ${index + 1}`}
                                        className="!w-full !h-[400px] !object-cover"
                                        loading="lazy"
                                        style={{ width: '100%', height: '400px', objectFit: 'cover' }}
                                      />
                                      <div className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 p-2 rounded-full transition-colors z-10">
                                        <ZoomIn className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                  </CarouselItem>
                                ))}
                              </CarouselContent>
                              <CarouselPrevious className="left-2" />
                              <CarouselNext className="right-2" />
                            </Carousel>
                          </div>
                          
                          {/* 右側內容 */}
                          <CardContent className="p-6 flex flex-col justify-between">
                            <div className="mb-4">
                              <h3 className="text-xl font-bold mb-1">{room.name}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{room.name_en}</p>
                              <p className="text-sm mb-3">{room.description}</p>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {room.capacity} 人
                              </span>
                              <span>{room.size_sqm} ㎡</span>
                            </div>

                            {/* 定價資訊 */}
                            <div className="space-y-3 pt-4 border-t">
                              {room.weekdayPricing && (
                                <div>
                                  <p className="text-xs font-semibold text-foreground mb-2">平日</p>
                                  <div className="space-y-2">
                                    {room.weekdayPricing.map((option, idx) => (
                                      <div key={idx} className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">{option.type}</span>
                                        <span className="font-semibold text-lg text-primary">
                                          NT$ {option.price.toLocaleString()}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {room.weekendPricing && (
                                <div>
                                  <p className="text-xs font-semibold text-foreground mb-2">假日</p>
                                  <div className="space-y-2">
                                    {room.weekendPricing.map((option, idx) => (
                                      <div key={idx} className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">{option.type}</span>
                                        <span className="font-semibold text-lg text-primary">
                                          NT$ {option.price.toLocaleString()}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Step 2: Date Selection */}
                {currentStep === "dates" && (
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="checkIn" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          入住日期
                        </Label>
                        <Input
                          id="checkIn"
                          type="date"
                          value={checkInDateStr}
                          onChange={(e) => setCheckInDate(e.target.value ? new Date(e.target.value) : undefined)}
                          min={new Date().toISOString().split("T")[0]}
                          className="h-12"
                        />
                        {bookingSettings && (
                          <p className="text-xs text-muted-foreground">
                            入住時間：{bookingSettings.check_in_time} 之後
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkOut" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          退房日期
                        </Label>
                        <Input
                          id="checkOut"
                          type="date"
                          value={checkOutDateStr}
                          onChange={(e) => setCheckOutDate(e.target.value ? new Date(e.target.value) : undefined)}
                          min={checkInDateStr || new Date().toISOString().split("T")[0]}
                          className="h-12"
                        />
                        {bookingSettings && (
                          <p className="text-xs text-muted-foreground">
                            退房時間：{bookingSettings.check_out_time} 之前
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guests" className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        入住人數
                      </Label>
                      <div className="text-sm text-muted-foreground">
                        {contextGuests?.adults || 2} 位大人{(contextGuests?.children || 0) > 0 ? ` · ${contextGuests.children} 位兒童` : ""}（共 {totalGuests} 人）
                      </div>
                      {selectedRoom && (
                        <p className="text-xs text-muted-foreground">
                          此房型最多可容納 {selectedRoom.capacity} 人
                        </p>
                      )}
                    </div>
                    {checkInDate && checkOutDate && (
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <p className="text-sm">
                            <strong>住宿天數：</strong>
                            {calculateNights()} 晚
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Step 3: Guest Info */}
                {currentStep === "guest" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        姓名 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={guestInfo.name}
                        onChange={(e) => {
                          setGuestInfo({ ...guestInfo, name: e.target.value });
                          setErrors({ ...errors, name: "" });
                        }}
                        placeholder="請輸入您的姓名"
                        className={`h-12 ${errors.name ? "border-destructive" : ""}`}
                        maxLength={50}
                      />
                      {errors.name && (
                        <p className="text-xs text-destructive">{errors.name}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-primary" />
                        手機號碼 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={guestInfo.phone}
                        onChange={(e) => {
                          setGuestInfo({ ...guestInfo, phone: e.target.value });
                          setErrors({ ...errors, phone: "" });
                        }}
                        placeholder="0912345678"
                        className={`h-12 ${errors.phone ? "border-destructive" : ""}`}
                        maxLength={10}
                      />
                      {errors.phone && (
                        <p className="text-xs text-destructive">{errors.phone}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" />
                        電子郵件 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={guestInfo.email}
                        onChange={(e) => {
                          setGuestInfo({ ...guestInfo, email: e.target.value });
                          setErrors({ ...errors, email: "" });
                        }}
                        placeholder="example@email.com"
                        className={`h-12 ${errors.email ? "border-destructive" : ""}`}
                        maxLength={100}
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive">{errors.email}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">聯絡地址（選填）</Label>
                      <Input
                        id="address"
                        value={guestInfo.address}
                        onChange={(e) =>
                          setGuestInfo({ ...guestInfo, address: e.target.value })
                        }
                        placeholder="請輸入您的聯絡地址"
                        className="h-12"
                        maxLength={200}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">備註（選填）</Label>
                      <Textarea
                        id="notes"
                        value={guestInfo.notes}
                        onChange={(e) =>
                          setGuestInfo({ ...guestInfo, notes: e.target.value })
                        }
                        placeholder="如有特殊需求，請在此說明"
                        rows={4}
                        maxLength={500}
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {guestInfo.notes.length} / 500
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 4: Payment */}
                {currentStep === "payment" && (
                  <div className="space-y-6">
                    {/* 折扣代碼欄位 */}
                    <div className="space-y-4">
                      <Label htmlFor="discountCode">折扣代碼（選填）</Label>
                      {!appliedDiscount ? (
                        <div className="flex gap-2">
                          <Input
                            id="discountCode"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                            placeholder="請輸入折扣代碼"
                            className="h-12"
                            maxLength={10}
                            disabled={isValidatingCode}
                          />
                          <Button
                            onClick={handleApplyDiscount}
                            disabled={isValidatingCode || !discountCode.trim()}
                            className="shrink-0"
                          >
                            {isValidatingCode ? "驗證中..." : "套用"}
                          </Button>
                        </div>
                      ) : (
                        <Card className="bg-primary/5 border-primary/20">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-medium">已套用折扣代碼：{appliedDiscount.code}</p>
                              <p className="text-sm text-muted-foreground">
                                折扣 {appliedDiscount.type === "percentage" 
                                  ? `${appliedDiscount.value}%` 
                                  : `NT$ ${appliedDiscount.value}`}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveDiscount}
                            >
                              移除
                            </Button>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        請選擇您的付款方式
                      </p>
                      {Array.isArray(bookingSettings?.payment_methods) && bookingSettings.payment_methods.map((method: string) => (
                        <Card
                          key={method}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            paymentMethod === method
                              ? "border-2 border-primary shadow-md"
                              : "border"
                          }`}
                          onClick={() => setPaymentMethod(method)}
                        >
                          <CardContent className="p-4 flex items-center gap-3">
                            <CreditCard className="h-5 w-5 text-primary" />
                            <span className="font-medium">{method}</span>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    {bookingSettings?.use_deposit && (
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-4">
                          <p className="text-sm">
                            <strong>訂金說明：</strong>
                            訂房時需支付 {bookingSettings.deposit_percentage}% 訂金，
                            剩餘款項請於入住當天支付
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Step 5: Confirmation */}
                {currentStep === "confirm" && (
                  <div className="space-y-6">
                    <Card className="bg-muted/30">
                      <CardHeader>
                        <CardTitle className="text-lg">訂房資訊</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">房型</p>
                          <p className="font-medium">{selectedRoom?.name}</p>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">入住日期</p>
                            <p className="font-medium">{checkInDateStr}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">退房日期</p>
                            <p className="font-medium">{checkOutDateStr}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">入住人數</p>
                          <p className="font-medium">{totalGuests} 人</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-muted/30">
                      <CardHeader>
                        <CardTitle className="text-lg">旅客資訊</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm text-muted-foreground">姓名</p>
                          <p className="font-medium">{guestInfo.name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">手機</p>
                          <p className="font-medium">{guestInfo.phone}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">電子郵件</p>
                          <p className="font-medium">{guestInfo.email}</p>
                        </div>
                        {guestInfo.notes && (
                          <div>
                            <p className="text-sm text-muted-foreground">備註</p>
                            <p className="font-medium">{guestInfo.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-muted/30">
                      <CardHeader>
                        <CardTitle className="text-lg">付款方式</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="font-medium">{paymentMethod}</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground mb-2">
                          ⚠️ 這是測試用的訂房系統
                        </p>
                        <p className="text-xs text-muted-foreground">
                          此訂單僅供測試使用，不會實際產生訂單或進行付款。
                          實際的訂房系統需要連接真實的付款閘道和訂單管理系統。
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex gap-4 mt-6">
              {currentStep !== "room" && (
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="flex-1"
                  size="lg"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  上一步
                </Button>
              )}
              {currentStep !== "confirm" ? (
                <Button
                  onClick={handleNextStep}
                  className="flex-1"
                  size="lg"
                >
                  下一步
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmBooking}
                  className="flex-1 bg-primary"
                  size="lg"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  確認訂房（測試）
                </Button>
              )}
            </div>
          </div>

          {/* Right: Summary Sidebar */}
          <div className="md:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg">訂單摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedRoom ? (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">房型</p>
                      <p className="font-medium">{selectedRoom.name}</p>
                    </div>
                    {checkInDate && checkOutDate && (
                      <>
                        <Separator />
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">入住</span>
                            <span>{checkInDateStr}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">退房</span>
                            <span>{checkOutDateStr}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">住宿天數</span>
                            <span>{calculateNights()} 晚</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">入住人數</span>
                            <span>{totalGuests} 人</span>
                          </div>
                        </div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              NT$ {selectedRoom.base_price.toLocaleString()} × {calculateNights()} 晚
                            </span>
                            <span className="font-medium">
                              NT$ {calculateTotal().toLocaleString()}
                            </span>
                          </div>
                          {appliedDiscount && (
                            <div className="flex justify-between text-primary">
                              <span>折扣 ({appliedDiscount.code})</span>
                              <span>- NT$ {calculateDiscount().toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">總金額</span>
                          <span className="text-2xl font-bold text-primary">
                            NT$ {calculateFinalTotal().toLocaleString()}
                          </span>
                        </div>
                        {bookingSettings?.use_deposit && calculateDeposit() > 0 && (
                          <>
                            <Separator />
                            <div className="bg-primary/5 p-3 rounded-lg">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium">需支付訂金</span>
                                <Badge variant="secondary">
                                  {bookingSettings.deposit_percentage}%
                                </Badge>
                              </div>
                              <p className="text-xl font-bold text-primary">
                                NT$ {calculateDeposit().toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                剩餘款項請於入住時支付
                              </p>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">請先選擇房型</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 圖片放大對話框 */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 border-0" aria-describedby={undefined}>
          <DialogClose className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-6 w-6 text-white drop-shadow-lg" />
            <span className="sr-only">關閉</span>
          </DialogClose>
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {selectedImageRoom && (
              <>
                <img 
                  src={(roomImages[selectedImageRoom.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard])[selectedImageIndex]} 
                  alt={`${selectedImageRoom.name} - ${selectedImageIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border-white/20"
                  onClick={() => {
                    const images = roomImages[selectedImageRoom.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
                    setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);
                  }}
                >
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border-white/20"
                  onClick={() => {
                    const images = roomImages[selectedImageRoom.name] || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
                    setSelectedImageIndex((prev) => (prev + 1) % images.length);
                  }}
                >
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingFlow;
