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
import { Checkbox } from "@/components/ui/checkbox";
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
  ShoppingBag,
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

type BookingStep = "dates" | "room" | "addons" | "guest" | "payment" | "confirm";

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
    guests: contextGuests = { adults: 2, children: 0 },
    setGuests
  } = useAccommodation();
  
  const [currentStep, setCurrentStep] = useState<BookingStep>("dates"); // 改為先選日期
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
  const [isCheckInDateOpen, setIsCheckInDateOpen] = useState(false);
  const [isCheckOutDateOpen, setIsCheckOutDateOpen] = useState(false);
  
  // 加購方案
  const [petCount, setPetCount] = useState(0);
  const [isPetPolicyDialogOpen, setIsPetPolicyDialogOpen] = useState(false);
  const [bbqMealsByDate, setBbqMealsByDate] = useState<Record<string, number>>({});
  
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
        if (step && ["dates", "room", "addons", "guest", "payment", "confirm"].includes(step)) {
          setCurrentStep(step as BookingStep);
        } else {
          // 從房型頁面跳轉，已選擇房型，跳到填寫資訊步驟
          setCurrentStep("guest");
        }
      }
    }
  }, [searchParams, roomTypes, selectedRoom]);

  // 當日期或餐食方案改變時，檢查已選擇的房型是否仍然適用
  useEffect(() => {
    if (selectedRoom && checkInDate && checkOutDate) {
      const availableRooms = getAvailableRooms();
      const isRoomAvailable = availableRooms.some(room => room.id === selectedRoom.id);
      
      if (!isRoomAvailable) {
        setSelectedRoom(null);
        toast({
          title: "房型已變更為不可訂",
          description: "由於日期或餐食方案變更，您選擇的房型已無法預訂",
        });
      }
    }
  }, [checkInDate, checkOutDate, selectedMealPlan]);

  // 當在選擇房型步驟且只有一個可用房型時，自動預選
  useEffect(() => {
    if (currentStep === "room" && checkInDate && checkOutDate) {
      const availableRooms = getAvailableRooms();
      
      // 如果只有一個可用房型且尚未選擇房型，自動預選
      if (availableRooms.length === 1 && !selectedRoom) {
        setSelectedRoom(availableRooms[0]);
      }
    }
  }, [currentStep, checkInDate, checkOutDate, selectedMealPlan, selectedRoom]);

  const calculateNights = () => {
    if (!checkInDateStr || !checkOutDateStr) return 0;
    const start = new Date(checkInDateStr);
    const end = new Date(checkOutDateStr);
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  // 獲取住宿期間的所有日期
  const getStayDates = () => {
    if (!checkInDate || !checkOutDate) return [];
    const dates: string[] = [];
    const start = new Date(checkInDate);
    const nights = calculateNights();
    
    for (let i = 0; i < nights; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      dates.push(format(currentDate, "yyyy-MM-dd"));
    }
    
    return dates;
  };

  // 當日期變更時，清空已選擇的烤肉日期
  useEffect(() => {
    setBbqMealsByDate({});
  }, [checkInDateStr, checkOutDateStr]);

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 5 || day === 6; // 五、六為假日
  };

  // 檢查日期範圍內是否包含平日或週末
  const getDateRangeInfo = () => {
    if (!checkInDate || !checkOutDate) return { hasWeekday: false, hasWeekend: false };
    
    const nights = calculateNights();
    let hasWeekday = false;
    let hasWeekend = false;
    const start = new Date(checkInDateStr);
    
    for (let i = 0; i < nights; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      if (isWeekend(currentDate)) {
        hasWeekend = true;
      } else {
        hasWeekday = true;
      }
    }
    
    return { hasWeekday, hasWeekend };
  };

  // 根據選擇的日期篩選可用房型
  const getAvailableRooms = () => {
    if (!checkInDate || !checkOutDate) return roomTypes;
    
    const { hasWeekday, hasWeekend } = getDateRangeInfo();
    
    return roomTypes.filter(room => {
      const mealPlanType = selectedMealPlan === "2_meals" ? "2_meals" : "3_meals";
      
      // 取得房型的平日和週末價格
      const weekdayPrice = mealPlanType === "2_meals" 
        ? room.weekday_2_meals_price 
        : room.weekday_3_meals_price;
      const weekendPrice = mealPlanType === "2_meals"
        ? room.weekend_2_meals_price
        : room.weekend_3_meals_price;
      
      // 檢查是否為純週末或純平日
      const isPureWeekend = hasWeekend && !hasWeekday;
      const isPureWeekday = hasWeekday && !hasWeekend;
      
      // 如果是純週末，必須有週末價格
      if (isPureWeekend) {
        if (!weekendPrice || weekendPrice === 0) {
          return false;
        }
      }
      
      // 如果是純平日，必須有平日價格
      if (isPureWeekday) {
        if (!weekdayPrice || weekdayPrice === 0) {
          return false;
        }
      }
      
      // 如果是混合（既有平日又有週末）
      if (hasWeekday && hasWeekend) {
        // 必須有平日價格
        if (!weekdayPrice || weekdayPrice === 0) {
          return false;
        }
        // 週末價格可以回退到平日價格
        const hasValidWeekendPrice = weekendPrice && weekendPrice > 0;
        const hasValidWeekdayPrice = weekdayPrice && weekdayPrice > 0;
        if (!hasValidWeekendPrice && !hasValidWeekdayPrice) {
          return false;
        }
      }
      
      return true;
    });
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

  const calculateAddonsTotal = () => {
    const nights = calculateNights();
    const bbqTotal = Object.values(bbqMealsByDate).reduce((sum, count) => sum + (count * 900), 0);
    return (petCount * 600 * nights) + bbqTotal;
  };

  const calculateFinalTotal = () => {
    return Math.max(0, calculateTotal() + calculateAddonsTotal() - calculateDiscount());
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
    
    if (currentStep === "room" && !selectedRoom) {
      toast({
        title: "請選擇房型",
        description: "請先選擇一個房型以繼續",
        variant: "destructive",
      });
      return;
    }

    if (currentStep === "addons") {
      // 驗證加購方案 - 檢查是否有任何日期設定了人數
      const hasBbqMeals = Object.values(bbqMealsByDate).some(count => count > 0);
      if (!hasBbqMeals && Object.keys(bbqMealsByDate).length > 0) {
        toast({
          title: "請設定用餐人數",
          description: "請為已選擇的用餐日期設定人數",
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
    const steps: BookingStep[] = ["dates", "room", "addons", "guest", "payment", "confirm"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevStep = () => {
    const steps: BookingStep[] = ["dates", "room", "addons", "guest", "payment", "confirm"];
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

      // 準備訂單備註（包含加購資訊）
      let orderNotes = guestInfo.notes || "";
      const hasBbqMeals = Object.keys(bbqMealsByDate).length > 0 && Object.values(bbqMealsByDate).some(count => count > 0);
      if (petCount > 0 || hasBbqMeals) {
        const addonNotes = [];
        const nights = calculateNights();
        if (petCount > 0) {
          addonNotes.push(`毛孩方案 × ${petCount} × ${nights} 晚 (NT$ ${petCount * 600 * nights})`);
        }
        if (hasBbqMeals) {
          const bbqDetails = Object.entries(bbqMealsByDate)
            .filter(([_, count]) => count > 0)
            .map(([dateStr, count]) => {
              const dateFormatted = format(new Date(dateStr), "MM/dd", { locale: zhTW });
              return `  - ${dateFormatted}: ${count} 人 (NT$ ${count * 900})`;
            })
            .join('\n');
          const totalBbq = Object.values(bbqMealsByDate).reduce((sum, count) => sum + (count * 900), 0);
          addonNotes.push(`烤肉套餐 (NT$ ${totalBbq}):\n${bbqDetails}`);
        }
        const addonText = `\n\n【加購方案】\n${addonNotes.join('\n')}`;
        orderNotes = orderNotes ? orderNotes + addonText : addonText.trim();
      }

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
          notes: orderNotes || null,
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
    { key: "dates", label: "選擇日期", icon: Calendar },
    { key: "room", label: "選擇房型", icon: Home },
    { key: "addons", label: "加購方案", icon: ShoppingBag },
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
                  {currentStep === "addons" && "加購方案"}
                  {currentStep === "guest" && "填寫旅客資訊"}
                  {currentStep === "payment" && "選擇付款方式"}
                  {currentStep === "confirm" && "確認訂單"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step 1: Room Selection */}
                {currentStep === "room" && (
                  <div className="space-y-4">
                    {checkInDate && checkOutDate && getAvailableRooms().length === 0 && (
                      <div className="bg-muted p-6 rounded-lg text-center">
                        <p className="text-muted-foreground mb-2">
                          您選擇的日期範圍內，目前沒有可訂的房型。
                        </p>
                        <p className="text-sm text-muted-foreground">
                          請返回上一步重新選擇日期，或聯繫我們了解更多資訊。
                        </p>
                      </div>
                    )}
                    {(checkInDate && checkOutDate ? getAvailableRooms() : roomTypes).map((room) => (
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
                        <Popover open={isCheckInDateOpen} onOpenChange={setIsCheckInDateOpen}>
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
                              onSelect={(date) => {
                                setCheckInDate(date);
                                if (date) {
                                  setIsCheckInDateOpen(false);
                                  // 選完入住日期後自動打開退房日期選擇器
                                  setTimeout(() => {
                                    setIsCheckOutDateOpen(true);
                                  }, 100);
                                }
                              }}
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
                        <Popover open={isCheckOutDateOpen} onOpenChange={setIsCheckOutDateOpen}>
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
                              onSelect={(date) => {
                                setCheckOutDate(date);
                                // 選完退房日期後自動關閉
                                if (date) {
                                  setIsCheckOutDateOpen(false);
                                }
                              }}
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
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center h-16 px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors text-left w-full">
                            <Users className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">住宿人數</span>
                              <span className="text-sm text-foreground">
                                {contextGuests?.adults || 2}位大人{(contextGuests?.children || 0) > 0 ? ` · ${contextGuests.children}位兒童` : ""} · 1間客房
                              </span>
                            </div>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4" align="start">
                          <div className="space-y-4">
                            {/* 大人 */}
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-base">大人</div>
                                <div className="text-sm text-muted-foreground">18歲（含）或以上</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setGuests({ ...contextGuests, adults: Math.max(1, (contextGuests?.adults || 2) - 1) })}
                                  className="w-10 h-10 rounded-lg border-2 border-primary text-primary hover:bg-primary/10 transition-colors flex items-center justify-center font-medium"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center font-medium">{contextGuests?.adults || 2}</span>
                                <button
                                  onClick={() => setGuests({ ...contextGuests, adults: Math.min(18, (contextGuests?.adults || 2) + 1) })}
                                  className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* 兒童 */}
                            <div className="flex items-center justify-between pt-4 border-t">
                              <div>
                                <div className="font-medium text-base">兒童</div>
                                <div className="text-sm text-muted-foreground">0-17歲</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setGuests({ ...contextGuests, children: Math.max(0, (contextGuests?.children || 0) - 1) })}
                                  className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center font-medium">{contextGuests?.children || 0}</span>
                                <button
                                  onClick={() => setGuests({ ...contextGuests, children: Math.min(10, (contextGuests?.children || 0) + 1) })}
                                  className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
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

                {/* Step 3: Add-ons */}
                {currentStep === "addons" && (
                  <div className="space-y-6">
                    {/* 毛孩方案 */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            🐾 毛孩方案
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsPetPolicyDialogOpen(true)}
                            className="text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            寵物入住守則
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">攜帶寵物</p>
                            <p className="text-sm text-muted-foreground">每隻 NT$ 600 / 每晚</p>
                            <p className="text-xs text-muted-foreground mt-1">上限 2 隻</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setPetCount(Math.max(0, petCount - 1))}
                              disabled={petCount === 0}
                              className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-medium text-lg">{petCount}</span>
                            <button
                              onClick={() => setPetCount(Math.min(2, petCount + 1))}
                              disabled={petCount >= 2}
                              className="w-10 h-10 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {petCount > 0 && (
                          <div className="bg-primary/5 p-3 rounded-lg">
                            <p className="text-sm font-medium">
                              小計：NT$ {(petCount * 600 * calculateNights()).toLocaleString()}
                              {checkInDate && checkOutDate && ` (${calculateNights()} 晚)`}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 烤肉套餐加購 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          🍖 餐食加購
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-4">
                          <div>
                            <p className="font-medium">烤肉套餐</p>
                            <p className="text-sm text-muted-foreground">每人 NT$ 900 / 每日</p>
                            <p className="text-xs text-muted-foreground mt-1">平日下限12人，假日下限18人，上限30人</p>
                          </div>

                          {/* 日期選擇與人數設定 */}
                          {checkInDate && checkOutDate && (
                            <div className="border-t pt-4">
                              <Label className="text-sm font-semibold mb-3 block">選擇用餐日期及人數</Label>
                              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {getStayDates().map((dateStr) => {
                                  const date = new Date(dateStr);
                                  const currentCount = bbqMealsByDate[dateStr] || 0;
                                  const isWeekendDate = isWeekend(date);
                                  const minCount = isWeekendDate ? 18 : 12;
                                  const maxCount = 30;
                                  
                                  return (
                                    <div
                                      key={dateStr}
                                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                                    >
                                      <div className="flex-1">
                                        <Label className="text-sm font-medium">
                                          {format(date, "yyyy/MM/dd (E)", { locale: zhTW })}
                                          {isWeekendDate && <Badge variant="secondary" className="ml-2 text-xs">假日</Badge>}
                                        </Label>
                                        {currentCount > 0 ? (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            NT$ {(currentCount * 900).toLocaleString()}
                                          </p>
                                        ) : (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            下限 {minCount} 人
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => {
                                            const newCount = currentCount - 1;
                                            if (newCount < minCount) {
                                              const newData = { ...bbqMealsByDate };
                                              delete newData[dateStr];
                                              setBbqMealsByDate(newData);
                                            } else {
                                              setBbqMealsByDate({ ...bbqMealsByDate, [dateStr]: newCount });
                                            }
                                          }}
                                          disabled={currentCount === 0}
                                          className="w-8 h-8 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          -
                                        </button>
                                        <span className="w-10 text-center font-medium">{currentCount}</span>
                                        <button
                                          onClick={() => {
                                            const newCount = currentCount === 0 ? minCount : Math.min(maxCount, currentCount + 1);
                                            setBbqMealsByDate({ ...bbqMealsByDate, [dateStr]: newCount });
                                          }}
                                          disabled={currentCount >= maxCount}
                                          className="w-8 h-8 rounded-lg border-2 border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {Object.values(bbqMealsByDate).some(count => count > 0) && (
                          <div className="bg-primary/5 p-3 rounded-lg">
                            <p className="text-sm font-medium">
                              小計：NT$ {Object.values(bbqMealsByDate).reduce((sum, count) => sum + (count * 900), 0).toLocaleString()}
                              <span className="text-muted-foreground ml-2">
                                ({Object.keys(bbqMealsByDate).length} 天)
                              </span>
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 加購總計 */}
                    {(petCount > 0 || Object.values(bbqMealsByDate).some(count => count > 0)) && (
                      <Card className="bg-muted/50 border-primary/20">
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <p className="text-sm font-semibold">加購方案總計</p>
                            {petCount > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">毛孩方案 × {petCount} × {calculateNights()} 晚</span>
                                <span>NT$ {(petCount * 600 * calculateNights()).toLocaleString()}</span>
                              </div>
                            )}
                            {Object.entries(bbqMealsByDate).filter(([_, count]) => count > 0).map(([dateStr, count]) => (
                              <div key={dateStr} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  🍖 {format(new Date(dateStr), "MM/dd")} 烤肉套餐 × {count} 人
                                </span>
                                <span>NT$ {(count * 900).toLocaleString()}</span>
                              </div>
                            ))}
                            <Separator />
                            <div className="flex justify-between font-semibold text-base">
                              <span>加購小計</span>
                              <span className="text-primary">NT$ {calculateAddonsTotal().toLocaleString()}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {(petCount === 0 && !Object.values(bbqMealsByDate).some(count => count > 0)) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>您可以選擇加購方案，或直接進入下一步</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Guest Info */}
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
                        {(petCount > 0 || Object.values(bbqMealsByDate).some(count => count > 0)) && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm text-muted-foreground mb-2">加購方案</p>
                              {petCount > 0 && (
                                <p className="font-medium mb-2">🐾 毛孩方案 × {petCount} × {calculateNights()} 晚</p>
                              )}
                              {Object.entries(bbqMealsByDate).filter(([_, count]) => count > 0).length > 0 && (
                                <div className="space-y-1">
                                  <p className="font-medium">🍖 烤肉套餐</p>
                                  {Object.entries(bbqMealsByDate)
                                    .filter(([_, count]) => count > 0)
                                    .map(([dateStr, count]) => (
                                      <p key={dateStr} className="text-xs text-muted-foreground ml-4">
                                        {format(new Date(dateStr), "MM/dd")}: {count} 人
                                      </p>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          </>
                        )}
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
              {currentStep !== "dates" && (
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
                {/* 日期資訊 - 在所有步驟都顯示 */}
                {checkInDate && checkOutDate && (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">入住日期</span>
                        <span className="font-medium">{checkInDateStr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">退房日期</span>
                        <span className="font-medium">{checkOutDateStr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">住宿天數</span>
                        <span className="font-medium">{calculateNights()} 晚</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">入住人數</span>
                        <span className="font-medium">{totalGuests} 人</span>
                      </div>
                    </div>
                  </>
                )}

                {/* 房型資訊 - 選擇房型後顯示 */}
                {selectedRoom ? (
                  <>
                    <Separator />
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
                    
                    {/* 價格資訊 - 選擇餐食方案後顯示 */}
                    {selectedMealPlan ? (
                      <>
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
                          {petCount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                🐾 毛孩方案 × {petCount} × {calculateNights()} 晚
                              </span>
                              <span className="font-medium">
                                NT$ {(petCount * 600 * calculateNights()).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {Object.entries(bbqMealsByDate).filter(([_, count]) => count > 0).map(([dateStr, count]) => (
                            <div key={dateStr} className="flex justify-between">
                              <span className="text-muted-foreground">
                                🍖 {format(new Date(dateStr), "MM/dd")} 烤肉套餐 × {count} 人
                              </span>
                              <span className="font-medium">
                                NT$ {(count * 900).toLocaleString()}
                              </span>
                            </div>
                          ))}
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
                    ) : (
                      <>
                        <Separator />
                        <div className="bg-muted/50 p-4 rounded-lg text-center">
                          <p className="text-sm text-muted-foreground">
                            請選擇餐食方案以查看價格
                          </p>
                        </div>
                      </>
                    )}
                  </>
                ) : currentStep === "room" ? (
                  <>
                    <Separator />
                    <div className="bg-muted/50 p-4 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">
                        請選擇房型以繼續
                      </p>
                    </div>
                  </>
                ) : null}
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

      {/* 毛孩方案詳情對話框 */}
      <Dialog open={isPetPolicyDialogOpen} onOpenChange={setIsPetPolicyDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">🐾 毛孩方案</h2>
              <p className="text-lg text-primary font-semibold">每隻 NT$ 600 / 每晚</p>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-xl font-semibold">寵物入住守則</h3>
              
              <div className="space-y-3 text-sm leading-relaxed">
                <p>僅開放毛孩進入指定之 2 棟 Villa 及公共區域。請於訂房時選擇加購毛孩方案。</p>
                
                <p>毛孩於辦理入住時，預先支付現金 2,000 元押金，退房確認房內各項設備正常後歸還。</p>

                <div className="bg-primary/5 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">寵物專屬備品：</h4>
                  <p>園區提供寵物餐碗、寵物行軍床、寵物零食。</p>
                </div>

                <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                  <p className="font-semibold text-destructive">
                    若違反下述規範，家長則須支付 5,000 元罰金。
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-xl font-semibold">毛孩守則</h3>
              
              <ul className="space-y-3 text-sm leading-relaxed list-none">
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>接待寵物以犬、貓為主，其他寵物請與我們聯繫確認。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>本園區因地理環境良好，會有野生動物出沒，如:獼猴、山豬、山羌，如出現需保持冷靜並盡速隔離毛孩。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>入住前請先將毛孩洗澡與除蚤完成，保護毛孩請施打完成狂犬病疫苗 (於入住時出示接種證明)。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>天性較有攻擊性的犬種暫不接待，如:比特犬、藏獒、日本土佐犬、紐波利頓犬、阿根廷杜告犬、巴西菲勒犬等。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>若毛孩出現攻擊行為、連續吠叫，且家長無法即時制止，森山寫照有權不接待並不予退費。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>毛孩於園區內及廁所大小便後請立即清理，共同維護毛孩貴賓擁有舒適的環境。</span>
                </li>
              </ul>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Villa 及公共交誼區公約</h3>
              
              <ul className="space-y-3 text-sm leading-relaxed list-none">
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>狗狗貓貓請於專屬軟墊休息，不與家長同床。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>住宿內部空間有限僅入住兩隻中小型犬種，若為大型犬建議一隻為上限。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>房內不開放毛孩洗澡、不吹毛及梳毛，進房前務必擦腳。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>攜帶毛孩入住，確認毛孩的指甲不過長，防止毛孩的抓傷設施行為。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>禁止單獨留毛孩於公共交誼區或房內。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>進入園區後，須繫上牽繩、推車或運輸籠。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>目前不提供毛孩餐食，須請家長攜帶毛孩最愛的食物。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>若毛孩之間打架受傷以及毛孩咬傷旅客或他人毛孩，請雙方互相自行處理協調，由家長負擔相關責任，毛孩之行為由家長全權負責。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">•</span>
                  <span>若毛孩造成房內設施毀損髒汙，或造成攻擊行為導致人員受傷或有違本住宿公約之約定，家長必須負擔後續相關賠償責任。</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={() => setIsPetPolicyDialogOpen(false)} className="w-full sm:w-auto">
                我了解了
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingFlow;
