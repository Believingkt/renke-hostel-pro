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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
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

interface RoomType {
  id: string;
  name: string;
  name_en: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
  room_count?: number;
  quad_room_count?: number;
  double_room_count?: number;
  weekday_2_meals_price?: number;
  weekday_3_meals_price?: number;
  weekend_2_meals_price?: number;
  weekend_3_meals_price?: number;
  weekdayPricing?: { type: string; price: number }[];
  weekendPricing?: { type: string; price: number }[];
  room_photos?: { photo_url: string; display_order: number }[];
  amenities?: string[];
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
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  // 訂房資料
  const [selectedRoom, setSelectedRoom] = useState<RoomType | null>(null);
  const [selectedMealPlan, setSelectedMealPlan] = useState<"2_meals" | "3_meals">("2_meals");
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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

        // 獲取房型資料，包括照片和設施
        const { data: roomTypesData, error: roomTypesError } = await supabase
          .from("room_types")
          .select(`
            *,
            room_photos (
              photo_url,
              display_order
            ),
            room_amenities (
              amenity_name
            )
          `)
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true });

        if (roomTypesError) throw roomTypesError;

        if (roomTypesData) {
          const roomTypesWithPhotos: RoomType[] = roomTypesData.map(room => ({
            id: room.id,
            name: room.name,
            name_en: room.name_en || '',
            description: room.description || '',
            capacity: room.capacity,
            size_sqm: room.size_sqm || 0,
            base_price: room.base_price,
            room_count: room.room_count,
            quad_room_count: room.quad_room_count,
            double_room_count: room.double_room_count,
            weekday_2_meals_price: room.weekday_2_meals_price,
            weekday_3_meals_price: room.weekday_3_meals_price,
            weekend_2_meals_price: room.weekend_2_meals_price,
            weekend_3_meals_price: room.weekend_3_meals_price,
            room_photos: (room.room_photos || []).sort((a, b) => a.display_order - b.display_order),
            amenities: (room.room_amenities || []).map((a: any) => a.amenity_name).slice(0, 8),
            weekdayPricing: (room.weekday_2_meals_price || room.weekday_3_meals_price) ? [
              ...(room.weekday_2_meals_price ? [{ type: "一泊二食", price: room.weekday_2_meals_price }] : []),
              ...(room.weekday_3_meals_price ? [{ type: "一泊三食", price: room.weekday_3_meals_price }] : [])
            ] : undefined,
            weekendPricing: (room.weekend_2_meals_price || room.weekend_3_meals_price) ? [
              ...(room.weekend_2_meals_price ? [{ type: "一泊二食", price: room.weekend_2_meals_price }] : []),
              ...(room.weekend_3_meals_price ? [{ type: "一泊三食", price: room.weekend_3_meals_price }] : [])
            ] : undefined,
          }));
          
          setRoomTypes(roomTypesWithPhotos);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Error loading data:", error);
        }
        toast({
          title: "載入失敗",
          description: "無法載入訂房資訊，請稍後再試",
          variant: "destructive",
        });
      }
    };

    loadData();
  }, [accommodationId, subdomainLoading, toast]);

  // 處理從房型頁面傳來的 roomId 和 step 參數
  useEffect(() => {
    const roomId = searchParams.get("roomId");
    const step = searchParams.get("step");
    
    if (roomId && roomTypes.length > 0 && !selectedRoom) {
      const room = roomTypes.find((r) => r.id === roomId);
      if (room) {
        setSelectedRoom(room);
        // 如果有指定 step 參數且為有效步驟，則使用該步驟
        if (step && ["room", "dates", "guest", "payment", "confirm"].includes(step)) {
          setCurrentStep(step as BookingStep);
        } else {
          setCurrentStep("dates");
        }
      }
    }
  }, [searchParams, roomTypes, selectedRoom]);

  const calculateNights = () => {
    if (!checkInDateStr || !checkOutDateStr) return 0;
    const start = new Date(checkInDateStr);
    const end = new Date(checkOutDateStr);
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 5 || day === 6; // 五、六為假日
  };

  const calculateTotal = () => {
    if (!selectedRoom || !checkInDate || !checkOutDate) return 0;
    const nights = calculateNights();
    if (nights === 0) return 0;

    let total = 0;
    const start = new Date(checkInDateStr);
    
    for (let i = 0; i < nights; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      const isWeekendDay = isWeekend(currentDate);
      let pricePerNight = 0;
      
      if (selectedMealPlan === "2_meals") {
        // 優先使用週末價格，如果沒有設定則回退到平日價格
        pricePerNight = isWeekendDay 
          ? (selectedRoom.weekend_2_meals_price || selectedRoom.weekday_2_meals_price || 0)
          : (selectedRoom.weekday_2_meals_price || 0);
      } else {
        // 優先使用週末價格，如果沒有設定則回退到平日價格
        pricePerNight = isWeekendDay
          ? (selectedRoom.weekend_3_meals_price || selectedRoom.weekday_3_meals_price || 0)
          : (selectedRoom.weekday_3_meals_price || 0);
      }
      
      total += pricePerNight;
    }
    
    return total;
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

  const handleConfirmBooking = async () => {
    if (!selectedRoom || !accommodationId) {
      toast({
        title: "訂房失敗",
        description: "缺少必要資訊，請重新操作",
        variant: "destructive",
      });
      return;
    }

    if (isSubmitting) {
      return; // 防止重複提交
    }

    setIsSubmitting(true);

    try {
      const totalPrice = calculateTotal();
      const discountAmount = calculateDiscount();
      const finalPrice = calculateFinalTotal();
      const depositAmount = calculateDeposit();

      console.log("開始建立訂單...", {
        accommodationId,
        roomId: selectedRoom.id,
        checkIn: checkInDateStr,
        checkOut: checkOutDateStr,
      });

      // 建立訂單
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([{
          accommodation_id: accommodationId,
          room_type_id: selectedRoom.id,
          order_number: "", // 由資料庫 trigger 自動生成
          guest_name: guestInfo.name,
          guest_phone: guestInfo.phone,
          guest_email: guestInfo.email || null,
          guest_address: guestInfo.address || null,
          check_in_date: checkInDateStr,
          check_out_date: checkOutDateStr,
          guest_count: totalGuests,
          meal_plan: selectedMealPlan, // 使用 "2_meals" 或 "3_meals"
          total_price: totalPrice,
          discount_code: appliedDiscount ? appliedDiscount.code : null,
          discount_amount: discountAmount,
          final_price: finalPrice,
          deposit_amount: depositAmount,
          payment_method: paymentMethod,
          payment_status: bookingSettings?.use_deposit ? "unpaid" : "unpaid",
          order_status: "pending",
          notes: guestInfo.notes || null,
        }])
        .select()
        .single();

      if (orderError) {
        console.error("建立訂單錯誤:", orderError);
        throw orderError;
      }

      console.log("訂單建立成功:", orderData);

      // 發送訂購確認郵件
      if (guestInfo.email) {
        try {
          const { error: emailError } = await supabase.functions.invoke(
            "send-booking-confirmation",
            {
              body: {
                guestName: guestInfo.name,
                guestEmail: guestInfo.email,
                orderNumber: orderData.order_number,
                roomName: selectedRoom.name,
                checkInDate: checkInDateStr,
                checkOutDate: checkOutDateStr,
                guestCount: totalGuests,
                mealPlan: selectedMealPlan,
                finalPrice: finalPrice,
                depositAmount: depositAmount,
                paymentMethod: paymentMethod,
              },
            }
          );

          if (emailError) {
            console.error("發送確認郵件失敗:", emailError);
            // 不中斷流程，只記錄錯誤
          } else {
            console.log("確認郵件已發送至:", guestInfo.email);
          }
        } catch (emailError) {
          console.error("發送確認郵件時發生錯誤:", emailError);
          // 不中斷流程
        }
      }

      toast({
        title: "訂房成功！",
        description: `訂單編號：${orderData.order_number}`,
      });

      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        title: "訂房失敗",
        description: error instanceof Error ? error.message : "發生錯誤，請稍後再試或聯絡我們",
        variant: "destructive",
      });
      setIsSubmitting(false); // 失敗時恢復按鈕狀態
    }
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
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[2fr_1fr] gap-8">
          {/* Left: Form Content */}
          <div className="w-full">
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
                        <div className="grid md:grid-cols-[3fr_2fr] gap-0 h-full">
                          {/* 左側圖片 - 占60% */}
                          <div className="relative bg-muted min-h-[400px] md:min-h-full overflow-hidden">
                            <Carousel 
                              className="w-full h-full"
                              opts={{ loop: true }}
                            >
                              <CarouselContent className="ml-0 h-full">
                                {((room.room_photos?.map(p => p.photo_url) || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard])).map((image, index) => (
                                  <CarouselItem 
                                    key={index}
                                    className="pl-0 min-w-full h-full"
                                  >
                                    <div 
                                      className="relative cursor-pointer group/image w-full h-full"
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
                                        loading="lazy"
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 p-2 rounded-full transition-colors z-10">
                                        <ZoomIn className="h-5 w-5 text-white" />
                                      </div>
                                    </div>
                                  </CarouselItem>
                                ))}
                              </CarouselContent>
                              <CarouselPrevious className="left-2 z-20" />
                              <CarouselNext className="right-2 z-20" />
                            </Carousel>
                          </div>
                          
                          {/* 右側內容 */}
                          <CardContent className="p-6 flex flex-col justify-between">
                            <div className="mb-4">
                              <h3 className="text-xl font-bold mb-3">{room.name}</h3>
                              
                              <div className="space-y-3 mb-4">
                                {(room.room_count || room.quad_room_count || room.double_room_count) && (
                                  <div className="text-base text-foreground/80 font-medium leading-relaxed">
                                    {room.room_count && room.room_count > 0 && <span className="font-semibold">{room.room_count} 間房</span>}
                                    {((room.quad_room_count && room.quad_room_count > 0) || (room.double_room_count && room.double_room_count > 0)) && (
                                      <span className="ml-2 text-muted-foreground">
                                        (
                                        {room.quad_room_count && room.quad_room_count > 0 && <span>四人房 {room.quad_room_count} 間</span>}
                                        {room.quad_room_count && room.quad_room_count > 0 && room.double_room_count && room.double_room_count > 0 && <span>、</span>}
                                        {room.double_room_count && room.double_room_count > 0 && <span>雙人房 {room.double_room_count} 間</span>}
                                        )
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <Users className="h-4 w-4" />
                                    <span className="font-medium">{room.capacity} 人</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                    <span className="font-medium">{room.size_sqm} ㎡</span>
                                  </div>
                                </div>
                              </div>
                              
                              <p className="text-sm mb-4 text-muted-foreground leading-relaxed">{room.description}</p>
                            </div>

                            {/* 客房設施 */}
                            {room.amenities && room.amenities.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-4">
                                {room.amenities.map((amenity, index) => (
                                  <span key={index} className="px-2 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-md whitespace-nowrap">
                                    {amenity}
                                  </span>
                                ))}
                              </div>
                            )}

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
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          入住日期
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center h-16 px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors text-left w-full">
                              <Calendar className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                              <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground">入住日期</span>
                                <span className="text-sm text-foreground">
                                  {checkInDate ? format(checkInDate, "yyyy/MM/dd", { locale: zhTW }) : "選擇日期"}
                                </span>
                              </div>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={checkInDate}
                              onSelect={setCheckInDate}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                        {bookingSettings && (
                          <p className="text-xs text-muted-foreground">
                            入住時間：{bookingSettings.check_in_time} 之後
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          退房日期
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center h-16 px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors text-left w-full">
                              <Calendar className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                              <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground">退房日期</span>
                                <span className="text-sm text-foreground">
                                  {checkOutDate ? format(checkOutDate, "yyyy/MM/dd", { locale: zhTW }) : "選擇日期"}
                                </span>
                              </div>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={checkOutDate}
                              onSelect={setCheckOutDate}
                              disabled={(date) => {
                                const today = new Date(new Date().setHours(0, 0, 0, 0));
                                if (date < today) return true;
                                if (checkInDate && date <= checkInDate) return true;
                                return false;
                              }}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
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
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        餐食方案 <span className="text-destructive">*</span>
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Card 
                          className={`cursor-pointer transition-all ${
                            selectedMealPlan === "2_meals"
                              ? "border-2 border-primary shadow-md bg-primary/5"
                              : "border hover:border-primary/50"
                          }`}
                          onClick={() => setSelectedMealPlan("2_meals")}
                        >
                          <CardContent className="p-4 text-center">
                            <p className="font-semibold mb-1">一泊二食</p>
                            <p className="text-xs text-muted-foreground">含早餐、晚餐</p>
                          </CardContent>
                        </Card>
                        <Card 
                          className={`cursor-pointer transition-all ${
                            selectedMealPlan === "3_meals"
                              ? "border-2 border-primary shadow-md bg-primary/5"
                              : "border hover:border-primary/50"
                          }`}
                          onClick={() => setSelectedMealPlan("3_meals")}
                        >
                          <CardContent className="p-4 text-center">
                            <p className="font-semibold mb-1">一泊三食</p>
                            <p className="text-xs text-muted-foreground">含早、午、晚餐</p>
                          </CardContent>
                        </Card>
                      </div>
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
                        <div>
                          <p className="text-sm text-muted-foreground">餐食方案</p>
                          <p className="font-medium">{selectedMealPlan === "2_meals" ? "一泊二食" : "一泊三食"}</p>
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
                  onClick={() => {
                    console.log("確認訂房按鈕被點擊");
                    handleConfirmBooking();
                  }}
                  disabled={isSubmitting}
                  className="flex-1 bg-primary"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      處理中...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      確認訂房
                    </>
                  )}
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
                    {/* 房型照片 */}
                    {selectedRoom.room_photos && selectedRoom.room_photos.length > 0 && (
                      <div className="rounded-lg overflow-hidden">
                        <img 
                          src={selectedRoom.room_photos[0].photo_url} 
                          alt={selectedRoom.name}
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    )}
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
                              {selectedMealPlan === "2_meals" ? "一泊二食" : "一泊三食"} × {calculateNights()} 晚
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
        <DialogContent hideCloseButton={true} className="max-w-[100vw] w-[100vw] h-[100vh] p-0 border-0 overflow-hidden">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {selectedImageRoom && (
              <>
                <img 
                  src={(selectedImageRoom.room_photos?.map(p => p.photo_url) || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard])[selectedImageIndex]} 
                  alt={`${selectedImageRoom.name} - ${selectedImageIndex + 1}`}
                  className="max-w-[95vw] max-h-[85vh] w-auto h-auto object-contain"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-4 md:right-6 top-4 md:top-6 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm z-[60] shadow-lg"
                  onClick={() => setIsImageDialogOpen(false)}
                >
                  <X className="h-6 w-6 text-white" />
                  <span className="sr-only">關閉</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm z-[60] shadow-lg"
                  onClick={() => {
                    const images = selectedImageRoom.room_photos?.map(p => p.photo_url) || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
                    setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);
                  }}
                >
                  <svg className="h-7 w-7 md:h-8 md:w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm z-[60] shadow-lg"
                  onClick={() => {
                    const images = selectedImageRoom.room_photos?.map(p => p.photo_url) || [roomStandard, roomStandard, roomStandard, roomStandard, roomStandard];
                    setSelectedImageIndex((prev) => (prev + 1) % images.length);
                  }}
                >
                  <svg className="h-7 w-7 md:h-8 md:w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
