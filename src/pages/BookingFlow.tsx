import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { usePageAnalytics } from "@/hooks/use-page-analytics";
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
  Smartphone,
  Info,
  ChevronDown,
} from "lucide-react";
import { z } from "zod";
import {
  guestInfoSchema,
  bookingFlowDateSchema as dateValidationSchema,
} from "@/lib/schemas/booking";
import { format, formatISO, addMonths, endOfMonth } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
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
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import roomDeluxe from "@/assets/room-deluxe.jpg";
import roomSuite from "@/assets/room-suite.jpg";
import roomStandard from "@/assets/room-standard.jpg";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { DevAccommodationSwitcher } from "@/components/DevAccommodationSwitcher";
import AccommodationLogo from "@/components/AccommodationLogo";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import { getThemeClassByAccommodation } from "@/constants/themes";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { reportFrontendError } from "@/utils/errorReporter";

// TapPay SDK 類型定義 - 使用 interface merging 避免重複宣告錯誤
interface TPDirectSDK {
  setupSDK: (appId: string, appKey: string, env: string) => void;
  card: {
    setup: (config: any) => void;
    onUpdate: (callback: (update: any) => void) => void;
    // getPrime 支援兩種呼叫方式：只帶 callback，或帶 options + callback
    getPrime: ((callback: (result: any) => void) => void) & 
              ((options: { appId: string; appKey: string }, callback: (result: any) => void) => void);
  };
}

declare global {
  interface Window {
    TPDirect?: TPDirectSDK;
  }
}

// TapPay 設定現在從後端動態載入

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
  is_exclusive_package?: boolean;
  is_bound_to_exclusive?: boolean;
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

  // 使用共用主題常數
  const themeClass = getThemeClassByAccommodation(accommodationId);
  
  // 追蹤頁面瀏覽
  usePageAnalytics({ accommodationId, enabled: !!accommodationId });
  
  const [currentStep, setCurrentStep] = useState<BookingStep>("dates");
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [accommodationName, setAccommodationName] = useState("");
  const [accommodationLogo, setAccommodationLogo] = useState<string | null>(null);
  const [isAccommodationLoaded, setIsAccommodationLoaded] = useState(false);
  const [accommodationLineId, setAccommodationLineId] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomPricing, setRoomPricing] = useState<Record<string, number>>({});
  
  // 會員登入狀態
  const [loggedInMember, setLoggedInMember] = useState<{ id: string; name: string; email: string; phone: string } | null>(null);

  // 訂房資料
  const [selectedRoom, setSelectedRoom] = useState<RoomType | null>(null);
  const [selectedMealPlan, setSelectedMealPlan] = useState<string>("2_meals");
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
  const [autoAppliedRef, setAutoAppliedRef] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [selectedImageRoom, setSelectedImageRoom] = useState<RoomType | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckInDateOpen, setIsCheckInDateOpen] = useState(false);
  const [isCheckOutDateOpen, setIsCheckOutDateOpen] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [successOrderData, setSuccessOrderData] = useState<any>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  
  // 付款重試機制狀態
  const [paymentRetryCount, setPaymentRetryCount] = useState(0);
  const [lastPaymentError, setLastPaymentError] = useState<{
    type: 'network' | 'card' | 'system' | 'validation' | 'unknown';
    message: string;
    suggestion: string;
  } | null>(null);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const MAX_RETRY_ATTEMPTS = 3;
  
  // 房型可用性狀態
  const [roomAvailability, setRoomAvailability] = useState<Record<string, {
    isBlocked: boolean;
    blockedByRoomName?: string;
    hasMissingPricing?: boolean;
    missingDates?: string[];
    hasNoAvailability?: boolean;
    unavailableDates?: string[];
  }>>({});
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  
  // 預選房型的日期可用性（用於日期選擇器標記不可預訂日期）
  const [unavailableDatesForRoom, setUnavailableDatesForRoom] = useState<Set<string>>(new Set());
  const [availableDatesForCalendar, setAvailableDatesForCalendar] = useState<Set<string>>(new Set());
  const [isLoadingRoomDates, setIsLoadingRoomDates] = useState(false);
  const [hasLoadedDateAvailability, setHasLoadedDateAvailability] = useState(false);
  const [checkInCalendarMonth, setCheckInCalendarMonth] = useState<Date>(new Date());
  const [checkOutCalendarMonth, setCheckOutCalendarMonth] = useState<Date>(new Date());
  
  // 可用性快取機制
  const availabilityCacheRef = useRef<{
    checkInDate: string | null;
    checkOutDate: string | null;
    accommodationId: string | null;
    roomTypeIds: string[];
    data: Record<string, {
      isBlocked: boolean;
      blockedByRoomName?: string;
      hasMissingPricing?: boolean;
      missingDates?: string[];
      hasNoAvailability?: boolean;
      unavailableDates?: string[];
    }>;
  }>({
    checkInDate: null,
    checkOutDate: null,
    accommodationId: null,
    roomTypeIds: [],
    data: {}
  });
  
  // 加購方案
  const [petCount, setPetCount] = useState(0);
  const [isPetPolicyDialogOpen, setIsPetPolicyDialogOpen] = useState(false);
  const [bbqMealsByDate, setBbqMealsByDate] = useState<Record<string, number>>({});
  const [hiddenBbqDates, setHiddenBbqDates] = useState<Set<string>>(new Set());
  const [isBbqMealsExpanded, setIsBbqMealsExpanded] = useState(false);

  // 自訂加購方案（非 pet/meal 類型）
  interface CustomAddonSetting {
    addon_type: string;
    description: string | null;
    detailed_description: string | null;
    price_per_unit: number;
    max_quantity: number;
    unit_label: string;
    enabled: boolean;
  }
  const [customAddonSettings, setCustomAddonSettings] = useState<CustomAddonSetting[]>([]);
  const [customAddonCounts, setCustomAddonCounts] = useState<Record<string, number>>({});
  const [isBbqDetailsDialogOpen, setIsBbqDetailsDialogOpen] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  
  // TapPay 設定 - 從後端動態載入
  const shouldLoadTapPay = paymentMethod === '信用卡';
  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
    reload: reloadTapPayConfig,
  } = useTapPayConfig(shouldLoadTapPay);


  // TapPay 狀態
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Prime 只能在卡片欄位仍在 DOM 時產生；為了避免「確認頁」欄位卸載導致 getPrime 失敗，
  // 我們會在付款步驟先取得 prime，並帶到 confirm 步驟使用。
  // TapPay Prime 90 秒後過期，這裡用 80 秒作為安全閾值
  const PRIME_TTL_MS = 80 * 1000;
  const [tappayPrime, setTappayPrime] = useState<string | null>(null);
  const [tappayPrimeIssuedAt, setTappayPrimeIssuedAt] = useState<number | null>(null);
  const [isPreparingPrime, setIsPreparingPrime] = useState(false);

  const isPrimeExpired = () =>
    tappayPrimeIssuedAt === null || Date.now() - tappayPrimeIssuedAt > PRIME_TTL_MS;

  const [showTestCards, setShowTestCards] = useState(false);

  useEffect(() => {
    // 切換付款方式時，清掉先前的 prime / 卡片狀態，避免用到過期或不相符的授權
    setTappayPrime(null);
    setTappayPrimeIssuedAt(null);
    setCardValid(false);
  }, [paymentMethod]);

  // 加購方案設定 - 預設為停用，只有資料庫有設定且啟用時才顯示
  const [petPlanSettings, setPetPlanSettings] = useState({
    enabled: false,
    pricePerUnit: 600,
    maxQuantity: 2,
    detailedDescription: ""
  });
  const [mealPlanSettings, setMealPlanSettings] = useState({
    enabled: false,
    pricePerUnit: 900,
    weekdayMinQuantity: 12,
    weekendMinQuantity: 18,
    maxQuantity: 30,
    detailedDescription: ""
  });
  
  // 自訂餐食方案
  interface CustomMealPlan {
    id: string;
    name: string;
    description: string;
  }
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  
  // 價格方案（專案模板）
  interface PricingTemplateOption {
    id: string;
    template_name: string;
    project_name: string | null;
    meal_plans: any[] | null;
    mealCount: number; // 0,1 → price, 2 → price_2_meals, 3 → price_3_meals
    room_type_id: string | null;
  }
  const [allPricingTemplates, setAllPricingTemplates] = useState<PricingTemplateOption[]>([]);
  const [pricingTemplates, setPricingTemplates] = useState<PricingTemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PricingTemplateOption | null>(null);
  
  // 將 context 日期轉換為字串格式，並提供預設值
  const checkInDateStr = checkInDate ? format(checkInDate, "yyyy-MM-dd") : "";
  const checkOutDateStr = checkOutDate ? format(checkOutDate, "yyyy-MM-dd") : "";
  const totalGuests = (contextGuests?.adults || 2) + (contextGuests?.children || 0);

  // 檢查會員登入狀態
  useEffect(() => {
    const checkMember = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoggedInMember(null); return; }
      const { data: member } = await supabase
        .from("platform_members")
        .select("id, name, email, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (member) {
        setLoggedInMember(member);
        // 自動填入會員資料
        setGuestInfo(prev => ({
          ...prev,
          name: prev.name || member.name || "",
          email: prev.email || member.email || "",
          phone: prev.phone || member.phone || "",
        }));
      }
    };
    checkMember();
  }, []);

  useEffect(() => {
    if (subdomainLoading || !accommodationId) return;
    
    const loadData = async () => {
      try {
        const { data: infoData } = await supabase
          .from("accommodation_info")
          .select("name, line_id, header_logo_url")
          .eq("id", accommodationId)
          .single();
        
        if (infoData) {
          setAccommodationName(infoData.name);
          setAccommodationLineId(infoData.line_id);
          setAccommodationLogo(infoData.header_logo_url);
          setIsAccommodationLoaded(true);
        }

        const { data: settingsData } = await supabase
          .from("booking_settings")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .maybeSingle();
        
        if (settingsData) {
          setBookingSettings(settingsData);
        }

        // 載入加購方案設定
        const { data: addonData } = await supabase
          .from("addon_settings")
          .select("*")
          .eq("accommodation_id", accommodationId);

        if (addonData) {
          const petData = addonData.find(a => a.addon_type === 'pet');
          const mealData = addonData.find(a => a.addon_type === 'meal');

          if (petData) {
            setPetPlanSettings({
              enabled: petData.enabled || false,
              pricePerUnit: petData.price_per_unit,
              maxQuantity: petData.max_quantity,
              detailedDescription: petData.detailed_description || ""
            });
          }

          if (mealData) {
            setMealPlanSettings({
              enabled: mealData.enabled || false,
              pricePerUnit: mealData.price_per_unit,
              weekdayMinQuantity: mealData.weekday_min_quantity || 12,
              weekendMinQuantity: mealData.weekend_min_quantity || 18,
              maxQuantity: mealData.max_quantity,
              detailedDescription: mealData.detailed_description || ""
            });
          }

          // 載入其他自訂加購方案（非 pet/meal）
          const otherAddons = addonData.filter(a => a.addon_type !== 'pet' && a.addon_type !== 'meal' && a.enabled);
          if (otherAddons.length > 0) {
            setCustomAddonSettings(otherAddons.map(a => ({
              addon_type: a.addon_type,
              description: a.description,
              detailed_description: a.detailed_description,
              price_per_unit: a.price_per_unit,
              max_quantity: a.max_quantity,
              unit_label: a.unit_label,
              enabled: a.enabled || false,
            })));
          }
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
            is_exclusive_package: room.is_exclusive_package,
            is_bound_to_exclusive: room.is_bound_to_exclusive,
            room_photos: (room.room_photos || []).sort((a, b) => a.display_order - b.display_order),
            amenities: (room.room_amenities || []).map((a: any) => a.amenity_name).slice(0, 8),
          }));
          
          setRoomTypes(roomTypesWithPhotos);
          
          // 如果只有一個房型，自動預選該房型
          if (roomTypesWithPhotos.length === 1 && !searchParams.get("roomId")) {
            setSelectedRoom(roomTypesWithPhotos[0]);
          }
        }

        // 獲取國定假日資料
        const { data: holidaysData } = await supabase
          .from("public_holidays")
          .select("holiday_date")
          .eq("accommodation_id", accommodationId);

        if (holidaysData) {
          setPublicHolidays(holidaysData.map(h => h.holiday_date));
        }

        // 獲取所有價格方案（專案模板）
        const { data: allTemplatesData } = await supabase
          .from("pricing_templates")
          .select("id, template_name, project_name, meal_plans, display_order, room_type_id")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true });

        if (allTemplatesData && allTemplatesData.length > 0) {
          const templates: PricingTemplateOption[] = allTemplatesData.map(t => {
            const meals = t.meal_plans && Array.isArray(t.meal_plans) ? t.meal_plans as any[] : [];
            let mealCount = meals.length;
            if (mealCount === 0) {
              const name = t.template_name || '';
              if (name.includes('三食') || name.includes('3食')) mealCount = 3;
              else if (name.includes('二食') || name.includes('2食')) mealCount = 2;
            }
            return {
              id: t.id,
              template_name: t.template_name,
              project_name: t.project_name,
              meal_plans: meals,
              mealCount,
              room_type_id: t.room_type_id,
            };
          });
          setAllPricingTemplates(templates);
          // 不在這裡設定 pricingTemplates，改由 selectedRoom 變化時篩選
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

  // 當選擇房型變化時，篩選對應的專案模板
  useEffect(() => {
    if (allPricingTemplates.length === 0) return;
    
    let filtered: PricingTemplateOption[];
    if (selectedRoom) {
      // 優先顯示與該房型關聯的專案
      filtered = allPricingTemplates.filter(t => t.room_type_id === selectedRoom.id);
      // 若無關聯專案，回退顯示未指定房型的專案
      if (filtered.length === 0) {
        filtered = allPricingTemplates.filter(t => !t.room_type_id);
      }
    } else {
      filtered = allPricingTemplates;
    }
    
    setPricingTemplates(filtered);
    
    // 如果當前選中的模板不在篩選結果中，重新選擇第一個
    if (filtered.length > 0 && (!selectedTemplate || !filtered.find(t => t.id === selectedTemplate.id))) {
      const defaultTemplate = filtered[0];
      setSelectedTemplate(defaultTemplate);
      setSelectedMealPlan(defaultTemplate.template_name);
      if (defaultTemplate.meal_plans && defaultTemplate.meal_plans.length > 0) {
        setCustomMealPlans(defaultTemplate.meal_plans as CustomMealPlan[]);
      } else {
        setCustomMealPlans([]);
      }
    }
  }, [selectedRoom, allPricingTemplates]);

  // Read checkIn/checkOut/adults/children from URL params and set in context
  useEffect(() => {
    const ciParam = searchParams.get("checkIn");
    const coParam = searchParams.get("checkOut");
    const adultsParam = searchParams.get("adults");
    const childrenParam = searchParams.get("children");
    if (ciParam && !checkInDate) {
      const d = new Date(ciParam + "T00:00:00");
      if (!isNaN(d.getTime())) setCheckInDate(d);
    }
    if (coParam && !checkOutDate) {
      const d = new Date(coParam + "T00:00:00");
      if (!isNaN(d.getTime())) setCheckOutDate(d);
    }
    if (adultsParam || childrenParam) {
      const a = adultsParam ? parseInt(adultsParam, 10) : contextGuests.adults;
      const c = childrenParam ? parseInt(childrenParam, 10) : contextGuests.children;
      if (!isNaN(a) && !isNaN(c) && (a !== contextGuests.adults || c !== contextGuests.children)) {
        setGuests({ adults: a, children: c });
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const roomId = searchParams.get("roomId");
    const step = searchParams.get("step");
    
    if (roomId && roomTypes.length > 0 && !selectedRoom) {
      const room = roomTypes.find((r) => r.id === roomId);
      if (room) {
        setSelectedRoom(room);
        // If dates are set, go to dates step for confirmation; otherwise go to dates
        if (step && ["dates", "room", "addons", "guest", "payment", "confirm"].includes(step)) {
          setCurrentStep(step as BookingStep);
        } else {
          setCurrentStep("dates");
        }
      }
    }
  }, [searchParams, roomTypes, selectedRoom]);

  // 載入日期可用性（供日期選擇器使用），以調整後庫存與包區互斥邏輯判斷
  useEffect(() => {
    if (!accommodationId) {
      setUnavailableDatesForRoom(new Set());
      setAvailableDatesForCalendar(new Set());
      setHasLoadedDateAvailability(false);
      return;
    }

    const loadDateAvailability = async () => {
      setIsLoadingRoomDates(true);
      setHasLoadedDateAvailability(false);
      try {
        const today = new Date();
        const sixMonthsLater = addMonths(today, 6);

        const todayStr = formatISO(today, { representation: 'date' });
        const endStr = formatISO(endOfMonth(sixMonthsLater), { representation: 'date' });

        const roomTypeIds = roomTypes.map((room) => room.id);
        if (roomTypeIds.length === 0) {
          setUnavailableDatesForRoom(new Set());
          setAvailableDatesForCalendar(new Set());
          setHasLoadedDateAvailability(true);
          return;
        }

        const dateRange: string[] = [];
        const cursor = new Date(todayStr + 'T00:00:00');
        const rangeEnd = new Date(endStr + 'T00:00:00');
        while (cursor <= rangeEnd) {
          dateRange.push(formatISO(cursor, { representation: 'date' }));
          cursor.setDate(cursor.getDate() + 1);
        }

        const [inventoryResult, adjustedResults] = await Promise.all([
          supabase
            .from('room_inventory_pricing')
            .select('date, available_rooms, is_available, price, price_2_meals, price_3_meals, room_type_id')
            .in('room_type_id', roomTypeIds)
            .gte('date', todayStr)
            .lte('date', endStr),
          Promise.all(
            roomTypeIds.map(async (roomTypeId) => {
              const { data, error } = await supabase.rpc('get_adjusted_room_inventory_batch', {
                p_room_type_id: roomTypeId,
                p_dates: dateRange,
                p_accommodation_id: accommodationId,
              });
              if (error) throw error;
              return { roomTypeId, rows: data || [] };
            })
          ),
        ]);

        if (inventoryResult.error) throw inventoryResult.error;

        const priceColumn = getPriceColumn();
        const inventoryIndex = new Map<string, NonNullable<typeof inventoryResult.data>[number]>();
        inventoryResult.data?.forEach((row) => {
          inventoryIndex.set(`${row.room_type_id}:${row.date}`, row);
        });

        const adjustedIndex = new Map<string, any>();
        adjustedResults.forEach(({ roomTypeId, rows }) => {
          rows.forEach((row: any) => {
            const dateValue = typeof row.date_value === 'string'
              ? row.date_value
              : format(new Date(row.date_value), 'yyyy-MM-dd');
            adjustedIndex.set(`${roomTypeId}:${dateValue}`, row);
          });
        });

        const unavailable = new Set<string>();
        const available = new Set<string>();

        for (const dateStr of dateRange) {
          const hasAnyAvailableRoom = roomTypeIds.some((roomTypeId) => {
            const inventoryRow = inventoryIndex.get(`${roomTypeId}:${dateStr}`);
            const adjustedRow = adjustedIndex.get(`${roomTypeId}:${dateStr}`);
            const selectedPrice = priceColumn === 'price_3_meals'
              ? inventoryRow?.price_3_meals
              : priceColumn === 'price_2_meals'
                ? inventoryRow?.price_2_meals
                : inventoryRow?.price;

            return inventoryRow?.is_available !== false
              && selectedPrice !== null
              && selectedPrice !== undefined
              && adjustedRow?.is_blocked !== true
              && (adjustedRow?.available_rooms ?? 0) > 0;
          });

          if (hasAnyAvailableRoom) {
            available.add(dateStr);
          } else {
            unavailable.add(dateStr);
          }
        }

        setUnavailableDatesForRoom(unavailable);
        setAvailableDatesForCalendar(available);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('Error loading date availability:', err);
        }
      } finally {
        setHasLoadedDateAvailability(true);
        setIsLoadingRoomDates(false);
      }
    };

    loadDateAvailability();
  }, [accommodationId, roomTypes, selectedTemplate]);

  const isCalendarDateBookable = (date: Date) => {
    if (!hasLoadedDateAvailability || isLoadingRoomDates) return false;
    const dateStr = formatISO(date, { representation: 'date' });
    return availableDatesForCalendar.has(dateStr);
  };

  const isStayRangeBookable = (startDate: Date, endExclusive: Date) => {
    if (!hasLoadedDateAvailability || isLoadingRoomDates) return false;

    const current = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
    const end = new Date(format(endExclusive, 'yyyy-MM-dd') + 'T00:00:00');

    while (current < end) {
      if (!availableDatesForCalendar.has(formatISO(current, { representation: 'date' }))) {
        return false;
      }
      current.setDate(current.getDate() + 1);
    }

    return true;
  };

  // 當日期或房型變化時，預先獲取價格和檢查可用性
  useEffect(() => {
    const fetchRoomPricingAndAvailability = async () => {
      if (!selectedRoom || !checkInDate || !checkOutDate || !accommodationId) {
        setRoomPricing({});
        return;
      }

      const nights = calculateNights();
      if (nights === 0) return;

      const start = new Date(checkInDateStr);
      const pricing: Record<string, number> = {};
      let hasBlocked = false;
      let blockedByName = '';
      let hasMissingPricing = false;
      let hasNoAvailability = false;
      const missingDates: string[] = [];
      const unavailableDates: string[] = [];

      for (let i = 0; i < nights; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        try {
          const priceCol = getPriceColumn();
          // 獲取價格、可用房間數與販售狀態
          const { data: priceData, error: priceError } = await supabase
            .from('room_inventory_pricing')
            .select('price, price_2_meals, price_3_meals, available_rooms, is_available')
            .eq('room_type_id', selectedRoom.id)
            .eq('date', dateStr)
            .maybeSingle();

          if (priceError) throw priceError;

          // 根據選擇的方案取得對應價格
          const selectedPrice = priceCol === 'price_3_meals' 
            ? priceData?.price_3_meals 
            : priceCol === 'price_2_meals' 
              ? priceData?.price_2_meals 
              : priceData?.price;

          // 檢查是否有設定價格
          if (!priceData || selectedPrice === null || selectedPrice === undefined) {
            hasMissingPricing = true;
            missingDates.push(dateStr);
            pricing[dateStr] = 0; // 標記為無價格
          } else {
            pricing[dateStr] = selectedPrice;

            // 關閉販售：前台視為不可預訂
            const isClosed = priceData.is_available === false;
            if (isClosed) {
              hasNoAvailability = true;
              if (!unavailableDates.includes(dateStr)) unavailableDates.push(dateStr);
            }

            // 庫存為 0：視為無空房（僅在未關閉販售時判斷，避免重複）
            if (!isClosed && priceData.available_rooms !== null && priceData.available_rooms <= 0) {
              hasNoAvailability = true;
              if (!unavailableDates.includes(dateStr)) unavailableDates.push(dateStr);
            }
          }

          // 檢查互斥邏輯
          const { data: availabilityData, error: availabilityError } = await supabase
            .rpc('get_adjusted_room_inventory', {
              p_room_type_id: selectedRoom.id,
              p_date: dateStr,
              p_accommodation_id: accommodationId
            });

          if (!availabilityError && availabilityData && availabilityData[0]?.is_blocked) {
            hasBlocked = true;
            blockedByName = availabilityData[0].blocked_by_room_name;
          }
          
          // 即使沒有被互斥，也要檢查調整後的可用房間數
          if (!availabilityError && availabilityData && availabilityData[0]) {
            const adjustedAvailable = availabilityData[0].available_rooms;
            if (adjustedAvailable !== null && adjustedAvailable <= 0 && !unavailableDates.includes(dateStr)) {
              hasNoAvailability = true;
              unavailableDates.push(dateStr);
            }
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error fetching price/availability for date:', dateStr, error);
          }
          hasMissingPricing = true;
          missingDates.push(dateStr);
          pricing[dateStr] = 0;
        }
      }

      setRoomPricing(pricing);
      
      // 更新房型可用性狀態
      setRoomAvailability(prev => ({
        ...prev,
        [selectedRoom.id]: {
          isBlocked: hasBlocked,
          blockedByRoomName: blockedByName,
          hasMissingPricing,
          missingDates,
          hasNoAvailability,
          unavailableDates
        }
      }));
    };

    fetchRoomPricingAndAvailability();
  }, [selectedRoom, checkInDate, checkOutDate, accommodationId, selectedTemplate]);

  // 當日期改變時，預先檢查所有房型的可用性（批次查詢優化版 + 快取）
  useEffect(() => {
    if (!checkInDate || !checkOutDate || !accommodationId || roomTypes.length === 0) {
      setRoomAvailability({});
      setIsCheckingAvailability(false);
      return;
    }

    const checkInDateStr = format(checkInDate, "yyyy-MM-dd");
    const checkOutDateStr = format(checkOutDate, "yyyy-MM-dd");
    const currentRoomTypeIds = roomTypes.map(r => r.id).sort().join(',');
    const cache = availabilityCacheRef.current;

    // 檢查快取是否有效（加入 selectedTemplate 以避免切換方案時使用舊快取）
    const cacheTemplateId = (cache as any).templateId || null;
    if (
      cache.checkInDate === checkInDateStr &&
      cache.checkOutDate === checkOutDateStr &&
      cache.accommodationId === accommodationId &&
      cache.roomTypeIds.sort().join(',') === currentRoomTypeIds &&
      cacheTemplateId === (selectedTemplate?.id || null) &&
      Object.keys(cache.data).length > 0
    ) {
      // 使用快取資料
      setRoomAvailability(cache.data);
      setIsCheckingAvailability(false);
      return;
    }

    const checkAllRoomsAvailability = async () => {
      setIsCheckingAvailability(true);
      const newAvailability: Record<string, {
        isBlocked: boolean;
        blockedByRoomName?: string;
        hasMissingPricing?: boolean;
        missingDates?: string[];
        hasNoAvailability?: boolean;
        unavailableDates?: string[];
      }> = {};

      const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

      if (nights <= 0) {
        setIsCheckingAvailability(false);
        return;
      }

      // 建立日期陣列
      const dateRange: string[] = [];
      const start = new Date(checkInDateStr);
      for (let i = 0; i < nights; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        dateRange.push(currentDate.toISOString().split('T')[0]);
      }

      // 取得所有房型ID
      const roomTypeIds = roomTypes.map(r => r.id);

        try {
          // 批次查詢：一次取得所有房型在日期範圍內的價格、庫存與販售狀態
          const { data: allPricingData, error: pricingError } = await supabase
            .from('room_inventory_pricing')
            .select('room_type_id, date, price, price_2_meals, price_3_meals, available_rooms, is_available')
            .in('room_type_id', roomTypeIds)
            .gte('date', checkInDateStr)
            .lt('date', checkOutDateStr);

          if (pricingError) {
            console.error('Error fetching pricing data:', pricingError);
          }

          // 建立價格資料索引 (room_id -> date -> data)
          const pricingIndex: Record<
            string,
            Record<string, { price: number | null; price_2_meals: number | null; price_3_meals: number | null; available_rooms: number | null; is_available: boolean | null }>
          > = {};
          if (allPricingData) {
            for (const item of allPricingData) {
              if (!pricingIndex[item.room_type_id]) {
                pricingIndex[item.room_type_id] = {};
              }
              pricingIndex[item.room_type_id][item.date] = {
                price: item.price,
                price_2_meals: item.price_2_meals,
                price_3_meals: item.price_3_meals,
                available_rooms: item.available_rooms,
                is_available: item.is_available,
              };
            }
          }

        // 互斥邏輯檢查（合併 N 次 RPC → 單次查詢）
        // 一次抓出該日是否有「包棟房型」被預訂；若有，標記其他綁定包棟的房型為 blocked
        const { data: exclusiveBooking } = await supabase
          .rpc('check_exclusive_room_booking', {
            p_accommodation_id: accommodationId,
            p_date: checkInDateStr,
          });

        const hasExclusiveBooking = exclusiveBooking?.[0]?.has_booking === true;
        const bookedRoomTypeId = exclusiveBooking?.[0]?.booked_room_type_id || null;
        const bookedRoomTypeName = exclusiveBooking?.[0]?.booked_room_type_name || '';

        // 判斷「被預訂的房型」是否為包棟
        const bookedRoom = bookedRoomTypeId ? roomTypes.find(r => r.id === bookedRoomTypeId) : null;
        const bookedIsExclusive = bookedRoom?.is_exclusive_package === true;

        const blockIndex: Record<string, { isBlocked: boolean; blockedByRoomName: string; adjustedAvailable: number | null }> = {};
        for (const room of roomTypes) {
          const isExclusive = room.is_exclusive_package === true;
          const isBoundToExclusive = room.is_bound_to_exclusive === true;

          // 互斥規則：
          //  - 若已有「包棟」被預訂：所有同群組房型(包含散客 is_bound_to_exclusive)都 blocked。
          //  - 若已有「散客」被預訂：只有「包棟」被 blocked，其他散客不互鎖。
          let isBlocked = false;
          if (hasExclusiveBooking && bookedRoomTypeId !== room.id) {
            if (bookedIsExclusive) {
              isBlocked = isExclusive || isBoundToExclusive;
            } else {
              isBlocked = isExclusive;
            }
          }

          blockIndex[room.id] = {
            isBlocked,
            blockedByRoomName: isBlocked ? bookedRoomTypeName : '',
            adjustedAvailable: null, // 詳細扣減量由 pricingIndex.available_rooms 處理
          };
        }

        // 並行取得每個房型在日期範圍內的「調整後庫存」（已扣除既有訂單佔用）
        const adjustedIndex: Record<string, Record<string, number | null>> = {};
        try {
          const adjustedResults = await Promise.all(
            roomTypes.map(async (room) => {
              const { data, error } = await supabase.rpc('get_adjusted_room_inventory_batch', {
                p_room_type_id: room.id,
                p_dates: dateRange,
                p_accommodation_id: accommodationId,
              });
              return { roomId: room.id, data: error ? null : data };
            })
          );
          for (const r of adjustedResults) {
            if (!r.data) continue;
            adjustedIndex[r.roomId] = {};
            for (const row of r.data as any[]) {
              const dateKey = typeof row.date_value === 'string' ? row.date_value : new Date(row.date_value).toISOString().split('T')[0];
              adjustedIndex[r.roomId][dateKey] = row.available_rooms;
            }
          }
        } catch (e) {
          if (import.meta.env.DEV) console.error('adjusted inventory batch error', e);
        }

        // 處理每個房型的可用性
        for (const room of roomTypes) {
          let hasMissingPricing = false;
          let hasNoAvailability = false;
          const missingDates: string[] = [];
          const unavailableDates: string[] = [];

          // 檢查每個日期的價格和庫存（根據選擇的方案）
          const batchPriceCol = getPriceColumn();
          for (const dateStr of dateRange) {
            const priceData = pricingIndex[room.id]?.[dateStr];
            const selectedPrice = batchPriceCol === 'price_3_meals' 
              ? priceData?.price_3_meals 
              : batchPriceCol === 'price_2_meals' 
                ? priceData?.price_2_meals 
                : priceData?.price;
            
            if (!priceData || selectedPrice === null || selectedPrice === undefined) {
              hasMissingPricing = true;
              missingDates.push(dateStr);
            } else if (priceData.is_available === false) {
              // 關閉販售：前台視為無空房
              hasNoAvailability = true;
              if (!unavailableDates.includes(dateStr)) unavailableDates.push(dateStr);
            } else {
              // 優先使用 adjusted（已扣除既有訂單佔用），fallback 至 raw available_rooms
              const adjusted = adjustedIndex[room.id]?.[dateStr];
              const effectiveAvailable = adjusted !== undefined && adjusted !== null
                ? adjusted
                : priceData.available_rooms;
              if (effectiveAvailable !== null && effectiveAvailable !== undefined && effectiveAvailable <= 0) {
                hasNoAvailability = true;
                if (!unavailableDates.includes(dateStr)) unavailableDates.push(dateStr);
              }
            }
          }

          // 檢查互斥邏輯結果
          const blockInfo = blockIndex[room.id];
          if (blockInfo?.adjustedAvailable !== null && blockInfo?.adjustedAvailable !== undefined && blockInfo.adjustedAvailable <= 0) {
            hasNoAvailability = true;
          }

          newAvailability[room.id] = {
            isBlocked: blockInfo?.isBlocked || false,
            blockedByRoomName: blockInfo?.blockedByRoomName,
            hasMissingPricing,
            missingDates,
            hasNoAvailability,
            unavailableDates
          };
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error checking availability:', error);
        }
        // 發生錯誤時，將所有房型標記為缺少價格
        for (const room of roomTypes) {
          newAvailability[room.id] = {
            isBlocked: false,
            hasMissingPricing: true,
            missingDates: dateRange,
            hasNoAvailability: false,
            unavailableDates: []
          };
        }
      }

      // 更新快取
      (availabilityCacheRef as any).current = {
        checkInDate: checkInDateStr,
        checkOutDate: checkOutDateStr,
        accommodationId,
        roomTypeIds: roomTypes.map(r => r.id),
        templateId: selectedTemplate?.id || null,
        data: newAvailability
      };

      setRoomAvailability(newAvailability);
      setIsCheckingAvailability(false);
    };

    checkAllRoomsAvailability();
  }, [checkInDate, checkOutDate, accommodationId, roomTypes, selectedTemplate]);

  // 當在選擇房型步驟時，自動預選第一個可用房型
  useEffect(() => {
    if (currentStep === "room" && checkInDate && checkOutDate && !selectedRoom) {
      const availableRooms = getAvailableRooms();
      
      // 如果有可用房型且尚未選擇房型，自動預選第一個
      if (availableRooms.length > 0) {
        setSelectedRoom(availableRooms[0]);
      }
    }
  }, [currentStep, checkInDate, checkOutDate, selectedMealPlan, selectedRoom]);

  // 初始化 TapPay SDK - 使用從後端動態載入的設定
  useEffect(() => {
    // 需要 tappayConfig 才能初始化
    if (!tappayConfig || currentStep !== 'payment' || paymentMethod !== '信用卡') {
      return;
    }

    const loadTapPaySDK = () => {
      if (window.TPDirect) {
        // SDK 已載入，設定基本配置
        console.log(`TapPay SDK already loaded, setting up for ${tappayConfig.env}...`);
        window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
        console.log(`TapPay SDK setup completed (${tappayConfig.env})`);
        setIsTapPayReady(true);
        return;
      }

      console.log('Loading TapPay SDK script...');
      const script = document.createElement('script');
      script.src = 'https://js.tappaysdk.com/sdk/tpdirect/v5.18.0';
      script.async = true;
      script.onload = () => {
        if (window.TPDirect && tappayConfig) {
          console.log(`TapPay SDK loaded, setting up for ${tappayConfig.env}...`);
          window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
          console.log(`TapPay SDK setup completed (${tappayConfig.env})`);
          setIsTapPayReady(true);
        }
      };
      script.onerror = () => {
        console.error('Failed to load TapPay SDK script');
      };
      document.body.appendChild(script);
    };

    loadTapPaySDK();
  }, [currentStep, paymentMethod, tappayConfig]);

  // 第二步：當 DOM 元素準備好後設定 TapPay 表單
  useEffect(() => {
    if (!isTapPayReady || currentStep !== 'payment' || paymentMethod !== '信用卡') {
      return;
    }

    // 延遲執行以確保 DOM 元素已渲染
    const timer = setTimeout(() => {
      if (!window.TPDirect) {
        console.error('TapPay SDK not available when trying to setup card form');
        return;
      }

      try {
        console.log('Setting up TapPay card form...');
        
        // 檢查 DOM 元素是否存在
        const cardNumberElement = document.getElementById('card-number');
        const cardExpiryElement = document.getElementById('card-expiration-date');
        const cardCcvElement = document.getElementById('card-ccv');
        
        if (!cardNumberElement || !cardExpiryElement || !cardCcvElement) {
          console.error('TapPay card form elements not found:', {
            cardNumber: !!cardNumberElement,
            cardExpiry: !!cardExpiryElement,
            cardCcv: !!cardCcvElement
          });
          return;
        }
        
        console.log('TapPay card form elements found, proceeding with setup');
        
        // 設定信用卡表單
        window.TPDirect.card.setup({
          fields: {
            number: {
              element: '#card-number',
              placeholder: '**** **** **** ****'
            },
            expirationDate: {
              element: '#card-expiration-date',
              placeholder: 'MM / YY'
            },
            ccv: {
              element: '#card-ccv',
              placeholder: 'CVV'
            }
          },
          styles: {
            input: {
              'font-size': '16px',
              'color': 'rgb(0, 0, 0)'
            },
            ':focus': {
              'color': 'rgb(0, 0, 0)'
            },
            '.valid': {
              'color': 'rgb(34, 197, 94)'
            },
            '.invalid': {
              'color': 'rgb(239, 68, 68)'
            }
          }
        });

        console.log('TapPay card form setup completed');

        // 監聽卡片狀態
        window.TPDirect.card.onUpdate((update: any) => {
          console.log('TapPay card update:', {
            canGetPrime: update.canGetPrime,
            cardNumberStatus: update.status.number,
            expiryStatus: update.status.expiry,
            ccvStatus: update.status.ccv,
            hasError: update.hasError
          });
          setCardValid(update.canGetPrime);
          // 卡片內容一變動，就視為需要重新取得 prime
          setTappayPrime(null);
          setTappayPrimeIssuedAt(null);
        });
      } catch (error) {
        console.error('TapPay card setup error:', error);
      }
    }, 100); // 延遲 100ms 確保 DOM 準備完成

    return () => clearTimeout(timer);
  }, [isTapPayReady, currentStep, paymentMethod]);

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

  // 根據選擇的專案模板取得對應的價格欄位
  const getPriceColumn = (): string => {
    if (!selectedTemplate) return 'price';
    if (selectedTemplate.mealCount >= 3) return 'price_3_meals';
    if (selectedTemplate.mealCount === 2) return 'price_2_meals';
    return 'price';
  };

  // 當日期變更時，清空已選擇的烤肉日期
  useEffect(() => {
    setBbqMealsByDate({});
  }, [checkInDateStr, checkOutDateStr]);

  // 檢查是否為星期六
  const isSaturday = (date: Date) => {
    return date.getDay() === 6;
  };

  // 檢查是否為國定假日
  const isPublicHoliday = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return publicHolidays.includes(dateStr);
  };

  // 檢查是否為假日（星期六或國定假日）
  const isWeekend = (date: Date) => {
    return isSaturday(date) || isPublicHoliday(date);
  };

  // 獲取餐食方案顯示名稱
  const getMealPlanDisplayName = (planId: string) => {
    // 先檢查是否匹配選中的模板
    if (selectedTemplate && planId === selectedTemplate.template_name) {
      return selectedTemplate.project_name || selectedTemplate.template_name;
    }
    // 檢查所有模板
    const matchedTemplate = pricingTemplates.find(t => t.template_name === planId);
    if (matchedTemplate) {
      return matchedTemplate.project_name || matchedTemplate.template_name;
    }
    const customPlan = customMealPlans.find(p => p.id === planId);
    if (customPlan) {
      return customPlan.name;
    }
    // 預設名稱
    return planId === "2_meals" ? "一泊二食" : planId === "3_meals" ? "一泊三食" : planId;
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
    
    // 注意：過濾邏輯現在依賴於 room_inventory_pricing
    // 這裡暫時返回所有房型，實際價格將在選擇時從庫存獲取
    return roomTypes;
  };

  const calculateTotal = () => {
    if (!selectedRoom || !checkInDate || !checkOutDate) return 0;
    
    // 使用預先獲取的價格
    return Object.values(roomPricing).reduce((sum, price) => sum + price, 0);
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
    const bbqTotal = Object.values(bbqMealsByDate).reduce((sum, count) => sum + (count * mealPlanSettings.pricePerUnit), 0);
    const customTotal = Object.entries(customAddonCounts).reduce((sum, [type, count]) => {
      const setting = customAddonSettings.find(s => s.addon_type === type);
      return sum + (count * (setting?.price_per_unit || 0) * nights);
    }, 0);
    return (petCount * petPlanSettings.pricePerUnit * nights) + bbqTotal + customTotal;
  };

  const calculateFinalTotal = () => {
    return Math.max(0, calculateTotal() + calculateAddonsTotal() - calculateDiscount());
  };

  // 訂金功能已移除：所有訂單一律以扣除折扣後的全額計算
  const calculateDeposit = () => 0;

  const handleApplyDiscount = async (code?: string) => {
    const codeToApply = code || discountCode;
    if (!codeToApply.trim() || !accommodationId) {
      toast({
        title: "請輸入折扣代碼",
        variant: "destructive",
      });
      return;
    }

    setIsValidatingCode(true);
    
    try {
      const orderAmount = calculateTotal();
      const roomId = selectedRoom?.id || null;
      const checkInDateStr = checkInDate ? format(checkInDate, "yyyy-MM-dd") : null;
      
      // 使用資料庫函數驗證折扣碼，傳遞訂單金額、房型和入住日期
      const { data, error } = await supabase.rpc('validate_discount_code', {
        p_code: codeToApply.trim().toUpperCase(),
        p_accommodation_id: accommodationId,
        p_order_amount: orderAmount,
        p_room_type_id: roomId,
        p_check_in_date: checkInDateStr
      });

      if (error) throw error;

      const result = data[0];
      
      if (result.is_valid) {
        setAppliedDiscount({
          code: codeToApply.trim().toUpperCase(),
          type: result.discount_type as "percentage" | "amount",
          value: result.discount_value
        });
        toast({
          title: "折扣代碼已套用",
          description: `已套用 ${
            result.discount_type === "percentage"
              ? `${result.discount_value}% 折扣`
              : `NT$ ${result.discount_value} 折扣`
          }`,
        });
      } else {
        // 如果是房型限制問題，顯示可使用的房型
        let errorMessage = result.message;
        if (result.applicable_room_names && result.applicable_room_names.length > 0) {
          errorMessage += `\n\n此折扣碼僅適用於：${result.applicable_room_names.join('、')}`;
        }
        
        toast({
          title: "折扣代碼無效",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error validating discount code:", error);
      toast({
        title: "驗證失敗",
        description: "無法驗證折扣代碼，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsValidatingCode(false);
    }
  };

  // 自動偵測並套用推薦連結的折扣碼
  useEffect(() => {
    const refCode = searchParams.get('ref');
    
    // 只要有 accommodationId、selectedRoom 和 checkInDate，就自動套用折扣碼
    if (!autoAppliedRef && accommodationId && selectedRoom && checkInDate && refCode) {
      setDiscountCode(refCode);
      setAutoAppliedRef(true);
      // 延遲自動驗證，確保其他數據已載入
      setTimeout(() => {
        handleApplyDiscount(refCode);
      }, 500);
    }
  }, [accommodationId, selectedRoom, checkInDate, autoAppliedRef]);

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    toast({
      title: "已移除折扣代碼",
    });
  };

  const handleNextStep = async () => {
    // 驗證當前步驟
    if (currentStep === "dates") {
      // 強化日期驗證
      if (!checkInDate || !checkOutDate) {
        toast({
          title: "請選擇日期",
          description: "請選擇入住和退房日期",
          variant: "destructive",
        });
        return;
      }

      // 使用 zod schema 驗證日期
      try {
        dateValidationSchema.parse({
          checkInDate,
          checkOutDate,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errorMessage = error.errors[0]?.message || "日期驗證失敗";
          toast({
            title: "日期驗證失敗",
            description: errorMessage,
            variant: "destructive",
          });
          return;
        }
      }

      // 額外檢查：確保日期字符串有效
      if (!checkInDateStr || !checkOutDateStr) {
        toast({
          title: "日期格式錯誤",
          description: "無法格式化日期，請重新選擇",
          variant: "destructive",
        });
        return;
      }

      // 驗證日期字符串可以被正確解析
      const checkInParsed = new Date(checkInDateStr);
      const checkOutParsed = new Date(checkOutDateStr);

      if (isNaN(checkInParsed.getTime()) || isNaN(checkOutParsed.getTime())) {
        toast({
          title: "日期無效",
          description: "選擇的日期無法被識別，請重新選擇",
          variant: "destructive",
        });
        return;
      }

      // 確保解析後的日期順序正確
      if (checkOutParsed <= checkInParsed) {
        toast({
          title: "日期錯誤",
          description: "退房日期必須晚於入住日期",
          variant: "destructive",
        });
        return;
      }

      // 等待可用性檢查完成後，預先判斷是否有可預訂的房型
      if (isCheckingAvailability) {
        toast({
          title: "正在檢查房型可用性",
          description: "請稍候，系統正在確認可預訂房型...",
        });
        return;
      }

      // 如果可用性資料已載入，檢查是否有任何可訂房型
      if (roomTypes.length > 0 && Object.keys(roomAvailability).length > 0) {
        const hasAvailable = roomTypes.some(room => {
          const avail = roomAvailability[room.id];
          if (!avail) return false;
          return !avail.isBlocked && !avail.hasMissingPricing && !avail.hasNoAvailability;
        });
        if (!hasAvailable) {
          toast({
            title: "所選日期無可預訂房型",
            description: "您選擇的日期目前沒有可預訂的房型，請嘗試其他日期。",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (currentStep === "room") {
      if (!selectedRoom) {
        toast({
          title: "請選擇房型",
          description: "請先選擇一個房型以繼續",
          variant: "destructive",
        });
        return;
      }

      // 檢查房型可用性狀態
      const availability = roomAvailability[selectedRoom.id];

      // 檢查是否有缺少價格的日期
      if (availability?.hasMissingPricing) {
        toast({
          title: "無法預訂",
          description: `所選日期 (${availability.missingDates?.join(', ')}) 尚未設定價格，請選擇其他日期`,
          variant: "destructive",
        });
        return;
      }

      // 檢查是否有無庫存的日期
      if (availability?.hasNoAvailability) {
        toast({
          title: "房型已滿",
          description: `所選日期 (${availability.unavailableDates?.join(', ')}) 已無空房，請選擇其他日期`,
          variant: "destructive",
        });
        return;
      }

      // 檢查是否被互斥房型阻擋
      if (availability?.isBlocked) {
        toast({
          title: "無法預訂",
          description: `此房型因「${availability.blockedByRoomName}」已被預訂而無法使用`,
          variant: "destructive",
        });
        return;
      }

      // 檢查總價是否為 0
      const total = calculateTotal();
      if (total <= 0) {
        toast({
          title: "價格異常",
          description: "所選日期的價格為 0，請聯繫客服或選擇其他日期",
          variant: "destructive",
        });
        return;
      }
    }

    if (currentStep === "addons") {
      // 驗證加購方案 - 檢查是否有任何日期設定了人數
      const hasBbqMeals = Object.values(bbqMealsByDate).some((count) => count > 0);
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
      // 必須登入會員
      if (!loggedInMember) {
        toast({
          title: "請先登入會員",
          description: "完成訂房前需登入會員帳號",
          variant: "destructive",
        });
        return;
      }
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

    // 如果選擇信用卡，驗證 TapPay 卡片狀態 + 先取得 prime（避免 confirm 步驟欄位卸載）
    if (currentStep === "payment" && paymentMethod === '信用卡') {
      if (!isTapPayReady) {
        toast({
          title: "付款模組載入中",
          description: "請稍候付款模組載入完成",
          variant: "destructive",
        });
        return;
      }

      if (!cardValid) {
        toast({
          title: "請輸入完整的信用卡資訊",
          description: "請確認卡號、有效期限和安全碼都已正確填寫",
          variant: "destructive",
        });
        return;
      }

      if (!window.TPDirect) {
        toast({
          title: "付款模組尚未就緒",
          description: "請重新整理頁面後再試",
          variant: "destructive",
        });
        return;
      }

      // 若 prime 已過期或尚未取得，重新請 SDK 產生
      if (!tappayPrime || isPrimeExpired()) {
        setIsPreparingPrime(true);
        try {
          const prime = await getTapPayPrime();
          setTappayPrime(prime);
          setTappayPrimeIssuedAt(Date.now());
          console.log('[TapPay][Booking] Prime prepared for confirm step');
        } catch (err: any) {
          const msg = err?.message || '取得付款授權失敗，請重新輸入信用卡資訊後再試';
          toast({
            title: "無法取得付款授權",
            description: msg,
            variant: "destructive",
          });
          return;
        } finally {
          setIsPreparingPrime(false);
        }
      }
    } else if (currentStep === "payment") {
      // 非信用卡付款，確保不會誤用舊 prime
      setTappayPrime(null);
      setTappayPrimeIssuedAt(null);
    }

    // 切換到下一步 - 如果沒有加購方案則跳過 addons 步驟
    const hasAddons = petPlanSettings.enabled || mealPlanSettings.enabled || customAddonSettings.length > 0;
    const steps: BookingStep[] = hasAddons 
      ? ["dates", "room", "addons", "guest", "payment", "confirm"]
      : ["dates", "room", "guest", "payment", "confirm"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevStep = () => {
    // 如果沒有加購方案則跳過 addons 步驟
    const hasAddons = petPlanSettings.enabled || mealPlanSettings.enabled || customAddonSettings.length > 0;
    const steps: BookingStep[] = hasAddons 
      ? ["dates", "room", "addons", "guest", "payment", "confirm"]
      : ["dates", "room", "guest", "payment", "confirm"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  // 錯誤分類函數
  const classifyPaymentError = (error: any): {
    type: 'network' | 'card' | 'system' | 'validation' | 'unknown';
    message: string;
    suggestion: string;
  } => {
    const errorMessage = error?.message || String(error);
    
    // 網路錯誤
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('連線')) {
      return {
        type: 'network',
        message: '網路連線不穩定',
        suggestion: '請檢查您的網路連線，然後重試'
      };
    }
    
    // 卡片相關錯誤
    if (errorMessage.includes('card') || errorMessage.includes('卡') || errorMessage.includes('餘額') || errorMessage.includes('額度')) {
      return {
        type: 'card',
        message: '信用卡驗證失敗',
        suggestion: '請確認卡號、有效期限和安全碼正確，或嘗試其他付款方式'
      };
    }
    
    // 驗證錯誤
    if (errorMessage.includes('invalid') || errorMessage.includes('無效') || errorMessage.includes('格式')) {
      return {
        type: 'validation',
        message: '付款資訊格式錯誤',
        suggestion: '請重新檢查並輸入正確的付款資訊'
      };
    }
    
    // 系統錯誤
    if (errorMessage.includes('system') || errorMessage.includes('系統') || errorMessage.includes('服務')) {
      return {
        type: 'system',
        message: '付款系統暫時無法使用',
        suggestion: '請稍後再試，或聯絡客服協助'
      };
    }
    
    // 未知錯誤
    return {
      type: 'unknown',
      message: '付款過程發生錯誤',
      suggestion: '請重試或選擇其他付款方式'
    };
  };

  // 付款重試處理
  const handlePaymentRetry = () => {
    if (paymentRetryCount >= MAX_RETRY_ATTEMPTS) {
      toast({
        title: "已達重試上限",
        description: "請檢查付款資訊後重新預訂",
        variant: "destructive",
      });
      return;
    }

    setPaymentRetryCount((prev) => prev + 1);
    setShowRetryDialog(false);
    setPaymentFailed(false);
    setLastPaymentError(null);

    // 信用卡重試需要重新取得 prime（confirm 步驟沒有卡片欄位）
    if (paymentMethod === '信用卡') {
      setCurrentStep('payment');
      toast({
        title: "請重新輸入信用卡資訊",
        description: "為了重試付款，需要重新取得付款授權",
      });
      return;
    }

    handleConfirmBooking();
  };

  const handleConfirmBooking = async () => {
    if (!selectedRoom || !accommodationId) {
      console.error("缺少必要資訊");
      toast({
        title: "訂房失敗",
        description: "缺少必要資訊，請重新操作",
        variant: "destructive",
      });
      return;
    }

    // 重置付款錯誤狀態
    setLastPaymentError(null);

    // 最終日期驗證 - 防止無效日期提交到數據庫
    if (!checkInDate || !checkOutDate) {
      console.error("日期遺失");
      toast({
        title: "日期資料遺失",
        description: "入住或退房日期遺失，請重新選擇",
        variant: "destructive",
      });
      return;
    }

    // 驗證日期對象有效性
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      console.error("日期無效");
      toast({
        title: "日期無效",
        description: "日期格式錯誤，請返回重新選擇日期",
        variant: "destructive",
      });
      setCurrentStep("dates");
      return;
    }

    // 使用 schema 再次驗證
    try {
      dateValidationSchema.parse({
        checkInDate,
        checkOutDate,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors[0]?.message || "日期驗證失敗";
        console.error("日期驗證失敗:", errorMessage);
        toast({
          title: "日期驗證失敗",
          description: errorMessage,
          variant: "destructive",
        });
        setCurrentStep("dates");
        return;
      }
    }

    // 驗證日期字符串
    if (!checkInDateStr || !checkOutDateStr) {
      console.error("日期字符串格式錯誤");
      toast({
        title: "日期格式錯誤",
        description: "無法格式化日期，請返回重新選擇",
        variant: "destructive",
      });
      setCurrentStep("dates");
      return;
    }

    // 最後檢查：確保字符串可以被正確解析
    const checkInParsed = new Date(checkInDateStr);
    const checkOutParsed = new Date(checkOutDateStr);
    
    if (isNaN(checkInParsed.getTime()) || isNaN(checkOutParsed.getTime())) {
      console.error("日期解析失敗");
      toast({
        title: "日期資料損壞",
        description: "日期資料已損壞，請返回重新選擇日期",
        variant: "destructive",
      });
      setCurrentStep("dates");
      return;
    }

    if (checkOutParsed <= checkInParsed) {
      console.error("日期順序錯誤");
      toast({
        title: "日期順序錯誤",
        description: "退房日期必須晚於入住日期，請返回修正",
        variant: "destructive",
      });
      setCurrentStep("dates");
      return;
    }

    if (isSubmitting) {
      return; // 防止重複提交
    }

    setIsSubmitting(true);


    try {
      const roomTotal = calculateTotal();
      const addonsTotal = calculateAddonsTotal();
      const totalPrice = roomTotal + addonsTotal;
      const discountAmount = calculateDiscount();
      const finalPrice = calculateFinalTotal();
      const depositAmount = calculateDeposit();

      // 準備加購方案資訊
      const nights = calculateNights();
      const petPlanPrice = petCount > 0 ? petCount * petPlanSettings.pricePerUnit * nights : 0;
      
      const mealPlanDetailsData = Object.entries(bbqMealsByDate)
        .filter(([_, count]) => count > 0)
        .map(([dateStr, count]) => ({
          date: dateStr,
          count: count,
          pricePerUnit: mealPlanSettings.pricePerUnit,
          price: count * mealPlanSettings.pricePerUnit
        }));
      
      const mealPlanTotalPrice = mealPlanDetailsData.reduce((sum, detail) => sum + detail.price, 0);

      // 處理客戶資料（創建或更新）
      let customerId: string | null = null;
      try {
        // A3 修正：改為顯式查詢，避免 .or() 字串拼接被使用者輸入破壞
        // 先用 email 查（若有），找不到再用 phone 查
        let existingCustomer: { id: string; visit_count: number | null } | null = null;

        const trimmedEmail = (guestInfo.email || "").trim();
        if (trimmedEmail) {
          const { data: byEmail } = await supabase
            .from("customers")
            .select("id, visit_count")
            .eq("accommodation_id", accommodationId)
            .eq("email", trimmedEmail)
            .maybeSingle();
          existingCustomer = byEmail ?? null;
        }

        if (!existingCustomer && guestInfo.phone) {
          const { data: byPhone } = await supabase
            .from("customers")
            .select("id, visit_count")
            .eq("accommodation_id", accommodationId)
            .eq("phone", guestInfo.phone.trim())
            .maybeSingle();
          existingCustomer = byPhone ?? null;
        }

        if (existingCustomer) {
          // 更新現有客戶資料
          const { data: updatedCustomer, error: updateError } = await supabase
            .from("customers")
            .update({
              name: guestInfo.name,
              phone: guestInfo.phone,
              email: guestInfo.email || null,
              visit_count: (existingCustomer.visit_count || 0) + 1,
            })
            .eq("id", existingCustomer.id)
            .select()
            .single();

          if (updateError) {
            console.error("更新客戶資料錯誤:", updateError);
          } else {
            customerId = updatedCustomer.id;
          }
        } else {
          // 創建新客戶
          const { data: newCustomer, error: createError } = await supabase
            .from("customers")
            .insert([{
              accommodation_id: accommodationId,
              name: guestInfo.name,
              phone: guestInfo.phone,
              email: guestInfo.email || null,
              first_order_date: checkInDateStr,
              visit_count: 1,
            }])
            .select()
            .single();

          if (createError) {
            console.error("創建客戶資料錯誤:", createError);
          } else {
            customerId = newCustomer.id;
          }
        }
      } catch (error) {
        console.error("處理客戶資料時發生錯誤:", error);
        // 繼續創建訂單，即使客戶資料處理失敗
      }

      // Server-side price validation to prevent client-side manipulation
      try {
        const { data: validationResult, error: validationError } = await supabase.functions.invoke(
          'validate-order-prices',
          {
            body: {
              accommodationId,
              roomTypeId: selectedRoom.id,
              checkInDate: checkInDateStr,
              checkOutDate: checkOutDateStr,
              totalPrice,
              discountCode: appliedDiscount?.code || null,
              discountAmount,
              finalPrice,
              mealPlan: selectedMealPlan,
              mealPlanDetails: mealPlanDetailsData,
              mealPlanTotal: mealPlanTotalPrice,
              petCount,
              petPlanPrice,
              customAddonDetails: Object.entries(customAddonCounts)
                .filter(([_, count]) => count > 0)
                .map(([type, count]) => {
                  const setting = customAddonSettings.find(s => s.addon_type === type);
                  return {
                    addon_type: type,
                    count,
                    price_per_unit: setting?.price_per_unit || 0,
                    total: count * (setting?.price_per_unit || 0) * nights,
                  };
                }),
            },
          }
        );

        if (validationError) {
          console.error("Price validation error:", validationError);
          toast({
            title: "價格驗證失敗",
            description: "無法驗證訂單價格，請重新整理頁面後再試",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        if (!validationResult?.isValid) {
          console.error("Price validation failed:", validationResult?.errors);
          toast({
            title: "價格驗證失敗",
            description: "訂單價格與系統計算不符，請重新整理頁面後再試",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      } catch (validationErr) {
        // A4 修正：價格驗證服務發生例外時一律拒絕，避免攻擊者操縱前端金額
        console.error("Price validation exception:", validationErr);
        toast({
          title: "價格驗證服務暫時無法使用",
          description: "為保障您的權益，目前無法送出訂單，請稍後再試或聯繫客服。",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // 檢查包棟互斥邏輯（使用資料庫欄位而非硬編碼名稱）
      const isExclusiveRoom = selectedRoom.is_exclusive_package === true || selectedRoom.is_bound_to_exclusive === true;
      if (isExclusiveRoom) {
        const nights = calculateNights();
        const start = new Date(checkInDateStr);
        
        for (let i = 0; i < nights; i++) {
          const currentDate = new Date(start);
          currentDate.setDate(start.getDate() + i);
          const dateStr = currentDate.toISOString().split('T')[0];

          const { data: bookingCheck } = await supabase
            .rpc('check_exclusive_room_booking', {
              p_accommodation_id: accommodationId,
              p_date: dateStr
            });

          if (bookingCheck && bookingCheck[0]?.has_booking) {
            toast({
              title: "預訂失敗",
              description: `${dateStr} 已被 ${bookingCheck[0].booked_room_type_name} 預訂，包棟互斥無法重複預訂`,
              variant: "destructive",
            });
            setIsSubmitting(false);
            return;
          }
        }
      }

      // 處理在線支付（信用卡或 LINE Pay）
      let paymentTransactionId = null;
      let paidOrderResult: { id: string; order_number: string; final_price: number } | null = null;

      if (paymentMethod === '信用卡') {
        setIsProcessingPayment(true);

        try {
          console.log('Processing TapPay payment...');

          const prime = tappayPrime;
          if (!prime || isPrimeExpired()) {
            toast({
              title: "付款授權已過期",
              description: "TapPay 授權有效期 90 秒已逾時，請回到付款步驟重新輸入信用卡資訊",
              variant: "destructive",
            });
            setTappayPrime(null);
            setTappayPrimeIssuedAt(null);
            setCurrentStep("payment");
            setIsSubmitting(false);
            return;
          }

          setTappayPrime(null);
          setTappayPrimeIssuedAt(null);

          // Idempotency key：每次提交產生一次，存於 ref 以便重試時保持相同
          const idempotencyKey =
            (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

          // 先嘗試走 3DS 流程（如不需 3DS，後端會直接付款並建單）
          // 為簡化邏輯：先呼叫 process-tappay-payment 取得是否需要 3DS。
          // 若需要 3DS → 走 sessionStorage + complete-3ds-booking（已支援 idempotency_key）
          // 若不需要 3DS → 改呼叫 create-paid-order 一次完成扣款 + 建單（含失敗退刷）
          const baseUrl = window.location.origin;
          const frontendRedirectUrl = `${baseUrl}/payment-result?source=booking`;

          // 為了同時支援 3DS 與非 3DS，我們先呼叫 process-tappay-payment（會自動帶 3DS）
          // 但對非 3DS 的情境，後端已經完成扣款，因此須立即建單；建單失敗時須退刷
          // 為避免複雜度，這裡採用「create-paid-order」單一入口（只走非 3DS）；
          // 而 3DS 仍由 process-tappay-payment 啟動，因為 prime 一旦消費就不能重用
          //
          // 流程：先呼叫 process-tappay-payment（會 enable 3DS）
          //   - requires3DSecure = true → 跳轉，3DS 完成後 complete-3ds-booking 建單
          //   - requires3DSecure = false → 此時款項已扣，立即用 idempotency_key 建單；失敗則退刷

          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
            'process-tappay-payment',
            {
              body: {
                prime,
                amount: finalPrice,
                orderId: idempotencyKey.substring(0, 50),
                cardholder: {
                  phoneNumber: guestInfo.phone,
                  name: guestInfo.name,
                  email: guestInfo.email || '',
                },
                details: `${selectedRoom.name} - ${checkInDateStr} 至 ${checkOutDateStr}`,
                frontendRedirectUrl,
              },
            }
          );

          if (paymentError) throw paymentError;

          if (!paymentResult.success) {
            const errorInfo = {
              type: 'card' as const,
              message: paymentResult.message || '付款失敗',
              suggestion: paymentResult.suggestion || '請檢查卡片資訊或聯繫發卡銀行',
              errorCode: paymentResult.errorCode,
              technicalMessage: paymentResult.technicalMessage,
            };
            console.error('TapPay payment failed:', errorInfo);
            setLastPaymentError(errorInfo);
            setPaymentFailed(true);
            setShowRetryDialog(true);
            setIsProcessingPayment(false);
            setIsSubmitting(false);
            return;
          }

          // === 3DS 路徑 ===
          if (paymentResult.requires3DSecure && paymentResult.paymentUrl) {
            console.log('[TapPay][Booking] Redirecting to 3D Secure...');

            const pendingBookingData = {
              accommodationId,
              selectedRoom: { id: selectedRoom.id, name: selectedRoom.name },
              checkInDate: checkInDateStr,
              checkOutDate: checkOutDateStr,
              guestInfo,
              mealPlan: selectedMealPlan,
              mealPlanDetails: mealPlanDetailsData,
              mealPlanTotal: mealPlanTotalPrice,
              petCount,
              petPlanPrice,
              finalPrice,
              totalPrice,
              nights,
              discountCode: appliedDiscount?.code,
              discountAmount,
              totalGuests,
              customerId,
              memberId: loggedInMember?.id || null,
              idempotencyKey, // 3DS 完成後 complete-3ds-booking 用此鍵防重複
              source: 'booking',
            };
            sessionStorage.setItem('pending_booking_3ds', JSON.stringify(pendingBookingData));

            toast({
              title: "跳轉 3D 驗證",
              description: "即將跳轉至銀行驗證頁面，完成驗證後將自動建立訂單...",
            });

            window.location.href = paymentResult.paymentUrl;
            return;
          }

          // === 非 3DS 路徑：款項已扣，立即建單；失敗則退刷 ===
          paymentTransactionId = paymentResult.transactionId;
          console.log('Payment successful (no 3DS), creating order with idempotency...');

          const { data: opResult, error: opError } = await supabase.functions.invoke(
            'create-paid-order',
            {
              body: {
                idempotencyKey,
                // Post-charge mode: TapPay 已透過 process-tappay-payment 完成扣款，
                // 此呼叫只負責「以 idempotency_key 建單；失敗則自動退刷」
                alreadyChargedRecTradeId: paymentTransactionId,
                accommodationId,
                selectedRoom: { id: selectedRoom.id, name: selectedRoom.name },
                checkInDate: checkInDateStr,
                checkOutDate: checkOutDateStr,
                guestInfo,
                mealPlan: selectedMealPlan,
                mealPlanDetails: mealPlanDetailsData,
                mealPlanTotal: mealPlanTotalPrice,
                petCount,
                petPlanPrice,
                finalPrice,
                totalPrice,
                discountCode: appliedDiscount?.code || null,
                discountAmount,
                totalGuests,
                customerId,
                memberId: loggedInMember?.id || null,
                customAddonDetails: Object.entries(customAddonCounts).filter(([_, c]) => c > 0).length > 0
                  ? Object.entries(customAddonCounts).filter(([_, c]) => c > 0).map(([type, count]) => {
                      const setting = customAddonSettings.find(s => s.addon_type === type);
                      return {
                        addon_type: type,
                        count,
                        price_per_unit: setting?.price_per_unit || 0,
                        total: count * (setting?.price_per_unit || 0) * calculateNights(),
                        unit_label: setting?.unit_label || '',
                      };
                    })
                  : null,
                nights,
              },
            }
          );

          if (opError || !opResult?.success) {
            console.error('Order creation after charge failed:', opError, opResult);
            reportFrontendError({
              category: "booking_flow",
              step: "create_paid_order_post_charge",
              errorMessage: opResult?.message || opError?.message || "create-paid-order failed",
              accommodationId,
              idempotencyKey,
              context: {
                recTradeId: paymentTransactionId,
                finalPrice,
                paymentMethod,
              },
            });
            toast({
              title: '訂單建立失敗',
              description: opResult?.message || '請聯繫客服協助處理',
              variant: 'destructive',
            });
            setIsProcessingPayment(false);
            setIsSubmitting(false);
            return;
          }

          paidOrderResult = opResult.order;
          console.log('Order created:', paidOrderResult?.order_number);

          toast({ title: "付款成功", description: "正在完成訂單..." });
        } catch (error) {
          console.error('Payment error:', error);
          const errorInfo = classifyPaymentError(error);
          reportFrontendError({
            category: "payment",
            step: "tappay_charge",
            errorMessage: error instanceof Error ? error.message : String(error),
            accommodationId,
            context: { paymentMethod, errorType: errorInfo?.type },
          });
          setLastPaymentError(errorInfo);
          setPaymentFailed(true);
          setShowRetryDialog(true);
          setIsProcessingPayment(false);
          setIsSubmitting(false);
          return;
        } finally {
          setIsProcessingPayment(false);
        }
      } else if (paymentMethod === 'LINE Pay') {
        setIsProcessingPayment(true);
        
        try {
          const orderId = `LP-${Date.now()}`;
          const currentUrl = window.location.origin;
          
          // 呼叫後端創建 LINE Pay 付款請求
          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
            'process-linepay-payment',
            {
              body: {
                action: 'request',
                amount: finalPrice,
                orderId: orderId,
                orderData: {
                  roomTypeId: selectedRoom.id,
                  roomTypeName: selectedRoom.name,
                  confirmUrl: `${currentUrl}/book/linepay-confirm`,
                  cancelUrl: `${currentUrl}/book?step=payment`,
                },
              },
            }
          );

          if (paymentError) {
            throw paymentError;
          }

          if (!paymentResult.success) {
            throw new Error(paymentResult.message || 'LINE Pay 付款請求失敗');
          }

          console.log('LINE Pay request successful:', paymentResult);
          
          // 儲存訂單資料到 sessionStorage，以便付款確認後使用
          const orderSessionData = {
            accommodationId,
            selectedRoom,
            checkInDateStr,
            checkOutDateStr,
            guestInfo,
            totalPrice,
            discountAmount,
            finalPrice,
            depositAmount,
            petCount,
            petPlanPrice,
            mealPlanDetailsData,
            mealPlanTotalPrice,
            selectedMealPlan,
            totalGuests,
            nights,
            appliedDiscount,
            customerId,
            linePayTransactionId: paymentResult.transactionId,
            linePayOrderId: orderId,
          };
          
          sessionStorage.setItem('pendingLinePayOrder', JSON.stringify(orderSessionData));
          
          // 導向 LINE Pay 付款頁面
          window.location.href = paymentResult.paymentUrl;
          return; // 不繼續執行後續代碼
        } catch (error) {
          console.error('LINE Pay error:', error);
          
          // 處理 LINE Pay 特定錯誤
          let errorMessage = '付款過程發生錯誤';
          let errorSuggestion = '請重試或選擇其他付款方式';
          let errorType: 'network' | 'card' | 'system' | 'validation' | 'unknown' = 'unknown';
          
          if (error && typeof error === 'object' && 'message' in error) {
            const err = error as any;
            
            // 檢查是否為後端返回的結構化錯誤
            if (err.errorCategory) {
              switch (err.errorCategory) {
                case 'config':
                  errorMessage = 'LINE Pay 服務設定錯誤';
                  errorSuggestion = '請聯繫客服處理，或選擇信用卡付款';
                  errorType = 'system';
                  break;
                case 'validation':
                  errorMessage = err.message || '訂單資訊有誤';
                  errorSuggestion = err.suggestion || '請檢查訂單資訊';
                  errorType = 'validation';
                  break;
                case 'network':
                  errorMessage = 'LINE Pay 服務暫時無法連線';
                  errorSuggestion = '請檢查網路連線後重試';
                  errorType = 'network';
                  break;
                case 'auth':
                  errorMessage = 'LINE Pay 授權失敗';
                  errorSuggestion = '請重新登入 LINE 或使用其他付款方式';
                  errorType = 'system';
                  break;
                default:
                  errorMessage = err.message || errorMessage;
                  errorSuggestion = err.suggestion || errorSuggestion;
              }
            } else if (err.message) {
              errorMessage = err.message;
            }
          }
          
          const errorInfo = {
            type: errorType,
            message: errorMessage,
            suggestion: errorSuggestion,
          };
          
          setLastPaymentError(errorInfo);
          setPaymentFailed(true);
          
          // 顯示錯誤對話框
          setShowRetryDialog(true);
          
          setIsSubmitting(false);
          setIsProcessingPayment(false);
          return;
        } finally {
          setIsProcessingPayment(false);
        }
      }

      // 信用卡（非 3DS）路徑：訂單已由 create-paid-order 建立，跳過下方 insert
      let orderData: any;
      if (paidOrderResult) {
        orderData = {
          id: paidOrderResult.id,
          order_number: paidOrderResult.order_number,
          final_price: paidOrderResult.final_price,
        };
      } else {
        // 準備訂單備註（如果有交易 ID，加入備註）
        let orderNotes = guestInfo.notes || "";
        if (paymentTransactionId) {
          orderNotes = `[TapPay 交易 ID: ${paymentTransactionId}]${orderNotes ? ` ${orderNotes}` : ''}`;
        }
        const { data: insertedOrder, error: orderError } = await supabase
          .from("orders")
          .insert([{
            accommodation_id: accommodationId,
            room_type_id: selectedRoom.id,
             customer_id: customerId,
             member_id: loggedInMember?.id || null,
             order_number: "", // 由資料庫 trigger 自動生成
            guest_name: guestInfo.name,
            guest_phone: guestInfo.phone,
            guest_email: guestInfo.email || null,
            guest_address: guestInfo.address || null,
            check_in_date: checkInDateStr,
            check_out_date: checkOutDateStr,
            guest_count: totalGuests,
            meal_plan: selectedMealPlan,
            total_price: totalPrice,
            discount_code: appliedDiscount ? appliedDiscount.code : null,
            discount_amount: discountAmount,
            final_price: finalPrice,
            deposit_amount: 0,
            deposit_payment_method: (paymentMethod === '信用卡' || paymentMethod === 'LINE Pay') ? (paymentMethod === '信用卡' ? 'credit_card' : 'line_pay') : null,
            balance_payment_method: null,
            payment_status: paymentTransactionId ? "paid" : "unpaid",
            paid_amount: paymentTransactionId ? finalPrice : 0,
            order_status: "pending",
            notes: orderNotes || null,
            pet_count: petCount,
            pet_plan_price: petPlanPrice,
            meal_plan_details: mealPlanDetailsData,
            meal_plan_total: mealPlanTotalPrice,
            custom_addon_details: Object.entries(customAddonCounts).filter(([_, count]) => count > 0).length > 0
              ? Object.entries(customAddonCounts).filter(([_, count]) => count > 0).map(([type, count]) => {
                  const setting = customAddonSettings.find(s => s.addon_type === type);
                  return {
                    addon_type: type,
                    count,
                    price_per_unit: setting?.price_per_unit || 0,
                    total: count * (setting?.price_per_unit || 0) * calculateNights(),
                    unit_label: setting?.unit_label || '',
                  };
                })
              : null,
          }])
          .select()
          .single();

        if (orderError) {
          throw orderError;
        }
        orderData = insertedOrder;
      }

      // 觸發 KOL Webhook（如果使用了折扣碼）
      if (appliedDiscount && orderData?.id) {
        try {
          await supabase.functions.invoke('kol-webhook', {
            body: { order_id: orderData.id }
          });
        } catch (webhookError) {
          // Webhook 錯誤不影響訂單流程
          console.log('KOL webhook notification sent (or skipped if not configured)');
        }
      }

      // 發送訂購確認郵件
      let emailSent = false;
      if (guestInfo.email) {
        try {
          const mealPlanDetailsForEmail = mealPlanDetailsData.map(detail => ({
            date: format(new Date(detail.date), "MM/dd"),
            count: detail.count,
            price: detail.price
          }));

          const { data: emailData, error: emailError } = await supabase.functions.invoke(
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
                mealPlanDisplayName: getMealPlanDisplayName(selectedMealPlan),
                finalPrice: finalPrice,
                depositAmount: depositAmount,
                paymentMethod: paymentMethod,
                petCount: petCount > 0 ? petCount : undefined,
                petPlanPrice: petPlanPrice > 0 ? petPlanPrice : undefined,
                mealPlanDetails: mealPlanDetailsForEmail.length > 0 ? mealPlanDetailsForEmail : undefined,
                mealPlanTotal: mealPlanTotalPrice > 0 ? mealPlanTotalPrice : undefined,
              },
            }
          );

          if (emailError) {
            emailSent = false;
          } else if (emailData?.warning) {
            emailSent = false;
          } else {
            emailSent = true;
          }
        } catch (emailError) {
          console.error("發送確認郵件時發生錯誤:", emailError);
          emailSent = false;
        }
      }

      // 設置成功狀態，顯示成功頁面
      setSuccessOrderData({
        ...orderData,
        roomName: selectedRoom.name,
        emailSent,
        nights: calculateNights(),
      });
      setBookingSuccess(true);
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

  // 如果沒有加購方案則不顯示 addons 步驟
  const hasAddons = petPlanSettings.enabled || mealPlanSettings.enabled || customAddonSettings.length > 0;
  
  const stepIndicators = hasAddons 
    ? [
        { key: "dates", label: "選擇日期", icon: Calendar },
        { key: "room", label: "選擇房型", icon: Home },
        { key: "addons", label: "加購方案", icon: ShoppingBag },
        { key: "guest", label: "填寫資訊", icon: User },
        { key: "payment", label: "付款方式", icon: CreditCard },
        { key: "confirm", label: "確認訂單", icon: CheckCircle },
      ]
    : [
        { key: "dates", label: "選擇日期", icon: Calendar },
        { key: "room", label: "選擇房型", icon: Home },
        { key: "guest", label: "填寫資訊", icon: User },
        { key: "payment", label: "付款方式", icon: CreditCard },
        { key: "confirm", label: "確認訂單", icon: CheckCircle },
      ];

  const currentStepIndex = stepIndicators.findIndex((s) => s.key === currentStep);

  return (
    <div className={`min-h-screen bg-background ${themeClass}`}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-24 object-contain" />
          </Link>
          <Button variant="ghost" onClick={() => navigate(-1)} size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
        </div>
      </header>

      {bookingSuccess && successOrderData ? (
        /* 訂房成功頁面 */
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <Card className="border-2 border-primary/20 shadow-lg">
              <CardContent className="pt-12 pb-8 px-6 md:px-12">
                {/* 成功圖示 */}
                <div className="flex justify-center mb-6">
                  <div className="rounded-full bg-primary/10 p-6">
                    <CheckCircle className="h-16 w-16 text-primary" />
                  </div>
                </div>

                {/* 標題 */}
                <h1 className="text-3xl font-bold text-center mb-2">訂房成功！</h1>
                <p className="text-center text-muted-foreground mb-8">
                  您的訂單已成功建立
                </p>

                <Separator className="mb-6" />

                {/* 訂單編號 */}
                <div className="bg-primary/5 rounded-lg p-6 mb-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">訂單編號</p>
                    <p className="text-2xl font-bold text-primary">{successOrderData.order_number}</p>
                  </div>
                </div>

                {/* 確認信狀態 */}
                {successOrderData.guest_email && (
                  <div className={`rounded-lg p-4 mb-6 ${
                    successOrderData.emailSent 
                      ? 'bg-primary/10 border border-primary/20' 
                      : 'bg-muted border border-border'
                  }`}>
                    <div className="flex items-start gap-3">
                      <Mail className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                        successOrderData.emailSent ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                      <div className="flex-1">
                        <p className="font-medium mb-1">
                          {successOrderData.emailSent ? '確認信已發送' : '確認信發送失敗'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {successOrderData.emailSent 
                            ? `訂房確認信已發送至 ${successOrderData.guest_email}` 
                            : '郵件發送失敗，但您的訂單已成功建立。如有需要，請聯繫我們。'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 訂單摘要 */}
                <div className="space-y-4 mb-8">
                  <h3 className="font-semibold text-lg">訂單摘要</h3>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">房型</span>
                      <span className="font-medium">{successOrderData.roomName}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">入住日期</span>
                      <span className="font-medium">{successOrderData.check_in_date}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">退房日期</span>
                      <span className="font-medium">{successOrderData.check_out_date}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">住宿天數</span>
                      <span className="font-medium">{successOrderData.nights} 晚</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">入住人數</span>
                      <span className="font-medium">{successOrderData.guest_count} 人</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-3 bg-primary/5 px-4 rounded-lg mt-4">
                      <span className="font-semibold">總金額</span>
                      <span className="font-bold text-lg text-primary">
                        NT$ {successOrderData.final_price?.toLocaleString()}
                      </span>
                    </div>
                    
                    {/* 訂金欄位已移除 */}
                  </div>
                </div>

                {/* 提醒資訊 */}
                <div className="bg-muted/50 rounded-lg p-4 mb-8">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    我們會在入住前與您聯繫確認相關細節。如有任何問題，請隨時與我們聯絡。
                  </p>
                </div>

                {/* 操作按鈕 */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => navigate("/")}
                  >
                    返回首頁
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      navigate("/");
                    }}
                  >
                    查看更多房型
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          {/* Progress Indicator */}
          <div className="border-b bg-card">
            <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
              <div className="flex items-center justify-between max-w-4xl mx-auto">
                {stepIndicators.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = index === currentStepIndex;
                  const isCompleted = index < currentStepIndex;
                  
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div
                          className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 transition-colors ${
                            isCompleted
                              ? "bg-primary border-primary text-primary-foreground"
                              : isActive
                              ? "border-primary text-primary"
                              : "border-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
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
          <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[2fr_1fr] gap-4 sm:gap-8">
          {/* Left: Form Content */}
          <div className="w-full">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl sm:text-2xl">
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
                    {/* 方案選擇器 */}
                    {pricingTemplates.length > 1 && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-base font-semibold">
                          📋 選擇方案
                        </Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {pricingTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => {
                                setSelectedTemplate(template);
                                setSelectedMealPlan(template.template_name);
                                if (template.meal_plans && template.meal_plans.length > 0) {
                                  setCustomMealPlans(template.meal_plans as CustomMealPlan[]);
                                } else {
                                  setCustomMealPlans([]);
                                }
                              }}
                              className={cn(
                                "px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all text-center",
                                selectedTemplate?.id === template.id
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background hover:border-primary/50 text-foreground"
                              )}
                            >
                              {template.project_name || template.template_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 顯示載入狀態 */}
                    {checkInDate && checkOutDate && isCheckingAvailability && (
                      <div className="bg-muted p-6 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                          <span>正在檢查房型可用性...</span>
                        </div>
                      </div>
                    )}
                    {/* 只有在檢查完成後才顯示內容 */}
                    {(!checkInDate || !checkOutDate || !isCheckingAvailability) && (
                      <>
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
                    {(() => {
                      const baseRooms = checkInDate && checkOutDate ? getAvailableRooms() : roomTypes;
                      const filteredRooms = baseRooms.filter((room) => {
                        // 如果沒有選擇日期，顯示所有房型
                        if (!checkInDate || !checkOutDate) return true;
                        
                        // 檢查房型可用性，過濾掉有問題的房型
                        const availability = roomAvailability[room.id];
                        
                        // 如果可用性資料尚未載入（檢查尚未完成），先隱藏房型
                        if (!availability) return false;
                        
                        const isBlocked = availability.isBlocked || false;
                        const hasMissingPricing = availability.hasMissingPricing || false;
                        const hasNoAvailability = availability.hasNoAvailability || false;
                        
                        // 只顯示沒有問題的房型
                        return !isBlocked && !hasMissingPricing && !hasNoAvailability;
                      });
                      
                      // 當有房型但全部都無法預訂時，顯示友善提示
                      if (checkInDate && checkOutDate && baseRooms.length > 0 && filteredRooms.length === 0) {
                        return (
                          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 sm:p-6 rounded-xl sm:rounded-lg text-center">
                            {/* 手機版：圓形圖示背景；電腦版：簡單圖示 */}
                            <div className="flex justify-center mb-3">
                              <div className="w-14 h-14 sm:w-auto sm:h-auto rounded-full bg-amber-100 dark:bg-amber-900/50 sm:bg-transparent dark:sm:bg-transparent flex items-center justify-center">
                                <AlertTriangle className="h-7 w-7 sm:h-8 sm:w-8 text-amber-500" />
                              </div>
                            </div>
                            <p className="text-foreground font-medium mb-2">
                              很抱歉，您選擇的日期目前沒有可預訂的房型
                            </p>
                            {/* 手機版：顯示選擇的日期 */}
                            <div className="sm:hidden mb-3">
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-background/80 rounded-full text-sm font-medium">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span>{format(checkInDate, "MM/dd")} - {format(checkOutDate, "MM/dd")}</span>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              可能原因：房間已被預訂、該日期尚未開放訂房，或價格尚未設定。
                            </p>
                            <p className="text-sm text-muted-foreground mb-4 hidden sm:block">
                              建議您嘗試其他日期，或直接聯繫我們協助安排。
                            </p>
                            {/* 手機版：垂直排列按鈕；電腦版：水平排列 */}
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                              <Button 
                                variant="outline" 
                                onClick={() => setCurrentStep("dates")}
                                className="gap-2 w-full sm:w-auto"
                              >
                                <Calendar className="h-4 w-4" />
                                選擇其他日期
                              </Button>
                              {accommodationLineId && (
                                <Button 
                                  variant="outline" 
                                  asChild
                                  className="gap-2 w-full sm:w-auto"
                                >
                                  <a 
                                    href={`https://line.me/R/ti/p/${accommodationLineId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Smartphone className="h-4 w-4" />
                                    LINE 聯繫我們
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      }
                      
                      return filteredRooms.map((room) => {
                      return (
                      <Card
                        key={room.id}
                        className={cn(
                          "transition-all overflow-hidden relative cursor-pointer hover:shadow-md",
                          selectedRoom?.id === room.id && "border-2 border-primary shadow-md",
                          (!selectedRoom?.id || selectedRoom?.id !== room.id) && "border"
                        )}
                        onClick={() => setSelectedRoom(room)}
                      >
                        <div className="grid md:grid-cols-[3fr_2fr] gap-0 h-full">
                          {/* 左側圖片 - 占60% */}
                          <div className="relative bg-muted min-h-[240px] sm:min-h-[320px] md:min-h-full overflow-hidden">
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
                          <CardContent className="p-4 sm:p-6 flex flex-col justify-between">
                            <div className="mb-3 sm:mb-4">
                              <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">{room.name}</h3>
                              
                              <div className="space-y-3 mb-4">
                                {(room.room_count || room.quad_room_count || room.double_room_count) && (
                                  <div className="text-base text-foreground/80 font-medium leading-relaxed">
                                    {room.room_count && room.room_count > 0 && <span className="font-semibold">{room.room_count} 間房</span>}
                                    {((room.quad_room_count !== null && room.quad_room_count > 0) || (room.double_room_count !== null && room.double_room_count > 0)) && (
                                      <span className="ml-2 text-muted-foreground">
                                        (
                                        {room.quad_room_count !== null && room.quad_room_count > 0 && <span>四人房 {room.quad_room_count} 間</span>}
                                        {room.quad_room_count !== null && room.quad_room_count > 0 && room.double_room_count !== null && room.double_room_count > 0 && <span>、</span>}
                                        {room.double_room_count !== null && room.double_room_count > 0 && <span>雙人房 {room.double_room_count} 間</span>}
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
                    );
                    });
                    })()}
                      </>
                    )}
                  </div>
                )}

                {/* Step 2: Date Selection */}
                {currentStep === "dates" && (
                  <div className="space-y-6">
                    {/* 可預訂日期提示 */}
                    <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <Home className="h-4 w-4 text-primary flex-shrink-0" />
                      <p className="text-sm text-foreground">
                        {selectedRoom && <>已選擇房型：<span className="font-semibold">{selectedRoom.name}</span>　</>}
                        {isLoadingRoomDates 
                          ? <span className="text-muted-foreground">（載入可預訂日期中...）</span>
                          : <span className="text-muted-foreground">（<span className="font-extrabold text-foreground">粗體</span>日期表示可預訂，灰色日期表示不可預訂）</span>
                        }
                      </p>
                    </div>
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
                            <div className="p-3">
                            <CalendarComponent
                              mode="single"
                              selected={checkInDate}
                              month={checkInCalendarMonth}
                              onMonthChange={(month) => {
                                setCheckInCalendarMonth(month);
                                setCheckOutCalendarMonth(month);
                              }}
                              onSelect={(date) => {
                                if (date && !isNaN(date.getTime())) {
                                  if (!isCalendarDateBookable(date)) {
                                    toast({
                                      title: "此日期已無庫存",
                                      description: "請選擇其他可預訂日期",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  setCheckInDate(date);
                                  setTimeout(() => {
                                    setIsCheckInDateOpen(false);
                                    if (checkOutDate && checkOutDate <= date) {
                                      setCheckOutDate(undefined);
                                    }
                                    setIsCheckOutDateOpen(true);
                                  }, 100);
                                } else {
                                  toast({
                                    title: "無效日期",
                                    description: "選擇的日期無效，請重新選擇",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                if (date < today) return true;
                                if (!isCalendarDateBookable(date)) return true;
                                return false;
                              }}
                              modifiers={{
                                holiday: (date) => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  if (date < today) return false;
                                  if (!isCalendarDateBookable(date)) return false;
                                  return isWeekend(date);
                                },
                                 available: (date) => {
                                   const dateStr = formatISO(date, { representation: 'date' });
                                   return availableDatesForCalendar.has(dateStr);
                                 },
                                  unavailable: (date) => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    return date >= today && !isCalendarDateBookable(date);
                                  },
                              }}
                              modifiersClassNames={{
                                holiday: "bg-primary/10 text-primary font-semibold rounded-md",
                                available: "!font-extrabold text-foreground",
                                 unavailable: "pointer-events-none opacity-40 text-muted-foreground line-through",
                              }}
                              initialFocus
                              className="pointer-events-auto"
                              variant="frontend"
                            />
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs flex-wrap">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-primary/10 rounded-md border border-primary/20"></div>
                                <span className="text-muted-foreground">假日定價</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-background rounded-md border border-border"></div>
                                <span className="text-muted-foreground">平日定價</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 text-sm">30</span>
                                <span className="text-muted-foreground">已滿房</span>
                              </div>
                            </div>
                            </div>
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
                            <div className="p-3">
                            <CalendarComponent
                              mode="single"
                              selected={checkOutDate}
                              defaultMonth={checkInDate || undefined}
                              month={checkOutCalendarMonth}
                              onMonthChange={setCheckOutCalendarMonth}
                              onSelect={(date) => {
                                if (date && !isNaN(date.getTime())) {
                                  if (checkInDate && date <= checkInDate) {
                                    toast({
                                      title: "日期錯誤",
                                      description: "退房日期必須晚於入住日期",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (checkInDate && !isStayRangeBookable(checkInDate, date)) {
                                    toast({
                                      title: "所選區間已無庫存",
                                      description: "請選擇連續可預訂的住宿日期",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  setCheckOutDate(date);
                                  setTimeout(() => {
                                    setIsCheckOutDateOpen(false);
                                  }, 100);
                                } else {
                                  toast({
                                    title: "無效日期",
                                    description: "選擇的日期無效，請重新選擇",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                if (date < today) return true;
                                if (checkInDate && date <= checkInDate) return true;
                                if (checkInDate && !isStayRangeBookable(checkInDate, date)) return true;
                                return false;
                              }}
                              modifiers={{
                                holiday: (date) => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  if (date < today) return false;
                                  if (checkInDate && date <= checkInDate) return false;
                                  if (checkInDate && !isStayRangeBookable(checkInDate, date)) return false;
                                  return isWeekend(date);
                                },
                                 available: (date) => {
                                   const dateStr = formatISO(date, { representation: 'date' });
                                   return availableDatesForCalendar.has(dateStr);
                                 },
                                  unavailable: (date) => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    return date >= today && checkInDate !== undefined && !isStayRangeBookable(checkInDate, date);
                                  },
                              }}
                              modifiersClassNames={{
                                holiday: "bg-primary/10 text-primary font-semibold rounded-md",
                                available: "!font-extrabold text-foreground",
                                 unavailable: "pointer-events-none opacity-40 text-muted-foreground line-through",
                              }}
                              initialFocus
                              className="pointer-events-auto"
                              variant="frontend"
                            />
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs flex-wrap">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-primary/10 rounded-md border border-primary/20"></div>
                                <span className="text-muted-foreground">假日定價</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-background rounded-md border border-border"></div>
                                <span className="text-muted-foreground">平日定價</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 text-sm">30</span>
                                <span className="text-muted-foreground">已滿房</span>
                              </div>
                            </div>
                            </div>
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
                    {/* 寵物方案 */}
                    {petPlanSettings.enabled && (
                    <Card className="border-2">
                      <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm sm:text-xl font-bold leading-snug">
                            🐾 寵物方案
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-xs"
                            onClick={() => setIsPetPolicyDialogOpen(true)}
                          >
                            詳細內容
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          每隻 NT$ {petPlanSettings.pricePerUnit} / 每晚・上限 {petPlanSettings.maxQuantity} 隻
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4 px-3 sm:px-6">
                        {petCount === 0 ? (
                          <Button
                            onClick={() => setPetCount(1)}
                            variant="outline"
                            size="lg"
                            className="w-full h-12"
                          >
                            <ShoppingBag className="mr-2 h-5 w-5" />
                            加購寵物方案
                          </Button>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                              <div>
                                <p className="font-semibold text-base">攜帶寵物數量</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  NT$ {petPlanSettings.pricePerUnit} × {petCount} 隻 × {calculateNights()} 晚
                                </p>
                              </div>
                              <Button
                                onClick={() => setPetCount(0)}
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-center gap-4">
                              <Button
                                onClick={() => setPetCount(Math.max(0, petCount - 1))}
                                disabled={petCount === 0}
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 rounded-lg"
                              >
                                -
                              </Button>
                              <span className="w-12 text-center font-bold text-xl">{petCount}</span>
                              <Button
                                onClick={() => setPetCount(Math.min(petPlanSettings.maxQuantity, petCount + 1))}
                                disabled={petCount >= petPlanSettings.maxQuantity}
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 rounded-lg"
                              >
                                +
                              </Button>
                            </div>
                            <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
                              <p className="text-base font-bold text-center">
                                小計：NT$ {(petCount * petPlanSettings.pricePerUnit * calculateNights()).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    )}

                    {/* 餐食方案 */}
                    {mealPlanSettings.enabled && (
                    <Card className="border-2">
                      <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm sm:text-xl font-bold leading-snug">
                            🍖 餐食方案
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-xs"
                            onClick={() => setIsBbqDetailsDialogOpen(true)}
                          >
                            詳細內容
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          每人 NT$ {mealPlanSettings.pricePerUnit} / 每日・平日 {mealPlanSettings.weekdayMinQuantity} 人起・假日 {mealPlanSettings.weekendMinQuantity} 人起・上限 {mealPlanSettings.maxQuantity} 人
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4 px-3 sm:px-6">
                        {!isBbqMealsExpanded ? (
                          <Button
                            onClick={() => {
                                const dates = getStayDates();
                              if (dates.length > 0) {
                                const newBbqMeals: Record<string, number> = {};
                                dates.forEach(dateStr => {
                                  const date = new Date(dateStr);
                                  const isWeekendDate = isWeekend(date);
                                  const minCount = isWeekendDate ? mealPlanSettings.weekendMinQuantity : mealPlanSettings.weekdayMinQuantity;
                                  newBbqMeals[dateStr] = minCount;
                                });
                                setBbqMealsByDate(newBbqMeals);
                                setIsBbqMealsExpanded(true);
                              }
                            }}
                            variant="outline"
                            size="lg"
                            className="w-full h-12"
                          >
                            <ShoppingBag className="mr-2 h-5 w-5" />
                            加購餐食方案
                          </Button>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                              <div>
                                <p className="font-semibold text-base">已選擇日期與人數</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  可針對各日期調整用餐人數
                                </p>
                              </div>
                              <Button
                                onClick={() => {
                                  setBbqMealsByDate({});
                                  setHiddenBbqDates(new Set());
                                  setIsBbqMealsExpanded(false);
                                }}
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* 日期選擇與人數設定 */}
                            {checkInDate && checkOutDate && (
                            <div className="border-t pt-4">
                              <Label className="text-sm font-semibold mb-3 block">選擇用餐日期及人數</Label>
                              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {getStayDates().filter(dateStr => !hiddenBbqDates.has(dateStr)).map((dateStr) => {
                                  const date = new Date(dateStr);
                                  const currentCount = bbqMealsByDate[dateStr] || 0;
                                  const isWeekendDate = isWeekend(date);
                                  const minCount = isWeekendDate ? mealPlanSettings.weekendMinQuantity : mealPlanSettings.weekdayMinQuantity;
                                  const maxCount = mealPlanSettings.maxQuantity;
                                  
                                  return (
                                    <div
                                      key={dateStr}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 bg-card gap-3 sm:gap-4"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Label className="text-sm font-semibold">
                                            {format(date, "MM/dd (E)", { locale: zhTW })}
                                          </Label>
                                          {isWeekendDate && <Badge variant="secondary" className="text-xs">假日</Badge>}
                                        </div>
                                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                          {currentCount > 0 ? (
                                            `NT$ ${(currentCount * mealPlanSettings.pricePerUnit).toLocaleString()}`
                                          ) : (
                                            `基本 ${minCount} 人`
                                          )}
                                        </p>
                                       </div>
                                        <div className="flex items-center gap-2">
                                           <Button
                                             type="button"
                                             onClick={(e) => {
                                               e.stopPropagation();
                                               setHiddenBbqDates(prev => new Set([...prev, dateStr]));
                                               setBbqMealsByDate(prev => {
                                                 const newData = { ...prev };
                                                 delete newData[dateStr];
                                                 return newData;
                                               });
                                             }}
                                             variant="ghost"
                                             size="icon"
                                             className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                                             title="清除此日期"
                                           >
                                             <X className="h-4 w-4" />
                                           </Button>
                                        <Button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newCount = currentCount - 1;
                                            if (newCount >= minCount) {
                                              setBbqMealsByDate(prev => ({ ...prev, [dateStr]: newCount }));
                                            }
                                          }}
                                          disabled={currentCount === 0 || currentCount === minCount}
                                          variant="outline"
                                          size="icon"
                                          className="h-9 w-9 rounded-lg"
                                        >
                                          -
                                        </Button>
                                        <span className="w-10 text-center font-semibold">{currentCount === 0 ? minCount : currentCount}</span>
                                        <Button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newCount = currentCount === 0 ? minCount : Math.min(maxCount, currentCount + 1);
                                            setBbqMealsByDate(prev => ({ ...prev, [dateStr]: newCount }));
                                          }}
                                          disabled={currentCount >= maxCount}
                                          variant="outline"
                                          size="icon"
                                          className="h-9 w-9 rounded-lg"
                                        >
                                          +
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            )}
                          </div>
                        )}

                        {Object.values(bbqMealsByDate).some(count => count > 0) && (
                          <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
                            <p className="text-base font-bold text-center">
                              小計：NT$ {Object.values(bbqMealsByDate).reduce((sum, count) => sum + (count * mealPlanSettings.pricePerUnit), 0).toLocaleString()}
                              <span className="text-muted-foreground font-normal ml-2 text-sm">
                                ({Object.keys(bbqMealsByDate).length} 天)
                              </span>
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    )}

                    {/* 自訂加購方案（如加床服務等） */}
                    {customAddonSettings.map((addon) => {
                      const count = customAddonCounts[addon.addon_type] || 0;
                      const nights = calculateNights();
                      return (
                        <Card key={addon.addon_type} className="border-2">
                          <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm sm:text-xl font-bold leading-snug break-words">
                                🛏️ {addon.description || addon.addon_type}
                              </CardTitle>
                              {addon.detailed_description && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 text-xs"
                                  onClick={() => {
                                    toast({
                                      title: addon.description || addon.addon_type,
                                      description: addon.detailed_description || '',
                                    });
                                  }}
                                >
                                  詳細內容
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">
                              每{addon.unit_label} NT$ {addon.price_per_unit.toLocaleString()} / 每晚・上限 {addon.max_quantity} {addon.unit_label}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-4 px-3 sm:px-6">
                            {count === 0 ? (
                              <Button
                                onClick={() => setCustomAddonCounts(prev => ({ ...prev, [addon.addon_type]: 1 }))}
                                variant="outline"
                                size="lg"
                                className="w-full h-12"
                              >
                                <ShoppingBag className="mr-2 h-5 w-5 shrink-0" />
                                <span className="truncate">加購此方案</span>
                              </Button>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3 sm:p-4 gap-2">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm sm:text-base">數量</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground break-words">
                                      {count} {addon.unit_label} × NT$ {addon.price_per_unit.toLocaleString()} × {nights} 晚
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                    <Button
                                      onClick={() => {
                                        const newCount = count - 1;
                                        if (newCount <= 0) {
                                          setCustomAddonCounts(prev => {
                                            const next = { ...prev };
                                            delete next[addon.addon_type];
                                            return next;
                                          });
                                        } else {
                                          setCustomAddonCounts(prev => ({ ...prev, [addon.addon_type]: newCount }));
                                        }
                                      }}
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg"
                                    >
                                      -
                                    </Button>
                                    <span className="w-8 text-center text-lg font-bold">{count}</span>
                                    <Button
                                      onClick={() => setCustomAddonCounts(prev => ({ ...prev, [addon.addon_type]: Math.min(addon.max_quantity, count + 1) }))}
                                      disabled={count >= addon.max_quantity}
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg"
                                    >
                                      +
                                    </Button>
                                  </div>
                                </div>
                                <div className="bg-primary/10 border border-primary/20 p-3 sm:p-4 rounded-lg text-center">
                                  <p className="font-bold text-sm sm:text-base">
                                    小計：NT$ {(count * addon.price_per_unit * nights).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}

                    {/* 加購總計 */}
                    {((petPlanSettings.enabled && petCount > 0) || (mealPlanSettings.enabled && Object.values(bbqMealsByDate).some(count => count > 0)) || Object.values(customAddonCounts).some(c => c > 0)) && (
                      <Card className="bg-primary/5 border-2 border-primary/30">
                        <CardContent className="p-4 sm:p-6">
                          <div className="space-y-2 sm:space-y-3">
                            <p className="text-base sm:text-lg font-bold">加購方案總計</p>
                            {petCount > 0 && (
                              <div className="flex justify-between text-xs sm:text-base gap-2">
                                <span className="text-muted-foreground min-w-0 truncate">
                                  🐾 寵物 × {petCount} × {calculateNights()} 晚
                                </span>
                                <span className="font-semibold shrink-0">NT$ {(petCount * petPlanSettings.pricePerUnit * calculateNights()).toLocaleString()}</span>
                              </div>
                            )}
                            {Object.entries(bbqMealsByDate).filter(([_, count]) => count > 0).map(([dateStr, count]) => (
                              <div key={dateStr} className="flex justify-between text-xs sm:text-base gap-2">
                                <span className="text-muted-foreground min-w-0 truncate">
                                  🍖 {format(new Date(dateStr), "MM/dd")} 餐食 × {count} 人
                                </span>
                                <span className="font-semibold shrink-0">NT$ {(count * mealPlanSettings.pricePerUnit).toLocaleString()}</span>
                              </div>
                            ))}
                            {Object.entries(customAddonCounts).filter(([_, count]) => count > 0).map(([type, count]) => {
                              const setting = customAddonSettings.find(s => s.addon_type === type);
                              return (
                                <div key={type} className="flex justify-between text-xs sm:text-base gap-2">
                                  <span className="text-muted-foreground min-w-0 truncate">
                                    🛏️ {setting?.description || type} × {count} × {calculateNights()} 晚
                                  </span>
                                  <span className="font-semibold shrink-0">NT$ {(count * (setting?.price_per_unit || 0) * calculateNights()).toLocaleString()}</span>
                                </div>
                              );
                            })}
                            <Separator className="my-2 sm:my-3" />
                            <div className="flex justify-between text-lg sm:text-xl">
                              <span className="font-bold">總計</span>
                              <span className="font-bold text-primary">NT$ {calculateAddonsTotal().toLocaleString()}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {(petCount === 0 && !Object.values(bbqMealsByDate).some(count => count > 0) && !Object.values(customAddonCounts).some(c => c > 0)) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>您可以選擇加購方案，或直接進入下一步</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Guest Info */}
                {currentStep === "guest" && (
                  <div className="space-y-6">
                    {/* 會員登入區塊（必要） */}
                    {!loggedInMember ? (
                      <Card className="border-2 border-orange-400 bg-orange-50/80">
                        <CardContent className="py-6">
                          <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center">
                              <User className="h-7 w-7 text-orange-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-base">請先登入會員</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                完成訂房前需登入會員帳號，訂房消費可累積紅利點數
                              </p>
                            </div>
                            <Button
                              className="bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white px-8"
                              onClick={() => {
                                const returnUrl = window.location.pathname + window.location.search;
                                window.location.href = `/member/auth?redirect=${encodeURIComponent(returnUrl)}`;
                              }}
                            >
                              <User className="h-4 w-4 mr-2" />
                              登入 / 註冊會員
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="border-2 border-green-200 bg-green-50/50">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                            <p className="text-sm font-medium text-green-800">
                              已登入會員：{loggedInMember.name}，訂房可累積紅利點數
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* 基本資料卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <User className="h-5 w-5 text-primary" />
                          基本資料
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          請填寫您的基本聯絡資訊，以便我們與您確認訂房細節
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-sm font-medium">
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
                            <p className="text-xs text-destructive mt-1">{errors.name}</p>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="phone" className="text-sm font-medium">
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
                            <p className="text-xs text-destructive mt-1">{errors.phone}</p>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-sm font-medium">
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
                            <p className="text-xs text-destructive mt-1">{errors.email}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* 其他資訊卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <Home className="h-5 w-5 text-primary" />
                          其他資訊
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          選填項目，可幫助我們提供更好的服務
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="space-y-2">
                          <Label htmlFor="address" className="text-sm font-medium">
                            聯絡地址（選填）
                          </Label>
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
                          <Label htmlFor="notes" className="text-sm font-medium">
                            備註（選填）
                          </Label>
                          <Textarea
                            id="notes"
                            value={guestInfo.notes}
                            onChange={(e) =>
                              setGuestInfo({ ...guestInfo, notes: e.target.value })
                            }
                            placeholder="如有特殊需求，請在此說明"
                            rows={5}
                            maxLength={500}
                            className="resize-none"
                          />
                          <p className="text-xs text-muted-foreground text-right">
                            {guestInfo.notes.length} / 500
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 提示資訊 */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <div className="flex gap-3">
                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            請確保資料正確
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            我們會透過您提供的聯絡方式寄送訂單確認信，並在入住前與您聯繫確認相關細節
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Payment */}
                {currentStep === "payment" && (
                  <div className="space-y-6">
                    {/* 折扣代碼卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <Badge className="h-5 w-5" />
                          折扣代碼
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          如果您有折扣代碼，請在此輸入以享受優惠
                        </p>
                      </CardHeader>
                      <CardContent>
                        {!appliedDiscount ? (
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                            <Input
                              id="discountCode"
                              value={discountCode}
                              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                              placeholder="請輸入折扣代碼"
                              className="h-12 text-base"
                              maxLength={10}
                              disabled={isValidatingCode}
                            />
                            <Button
                              onClick={() => handleApplyDiscount()}
                              disabled={isValidatingCode || !discountCode.trim()}
                              className="shrink-0 h-12 px-6 w-full sm:w-auto"
                              size="lg"
                            >
                              {isValidatingCode ? "驗證中..." : "套用"}
                            </Button>
                          </div>
                        ) : (
                          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="bg-primary/20 rounded-full p-2">
                                  <CheckCircle className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <p className="font-semibold text-base">已套用折扣代碼：{appliedDiscount.code}</p>
                                  <p className="text-sm text-muted-foreground mt-0.5">
                                    折扣 {appliedDiscount.type === "percentage" 
                                      ? `${appliedDiscount.value}%` 
                                      : `NT$ ${appliedDiscount.value.toLocaleString()}`}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleRemoveDiscount}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-4 w-4 mr-1" />
                                移除
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 付款方式卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <CreditCard className="h-5 w-5 text-primary" />
                          付款方式
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          請選擇您偏好的付款方式
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* 顯示所有可用的付款方式（包括信用卡和 LINE Pay） */}
                        {(() => {
                          const availableMethods = Array.isArray(bookingSettings?.payment_methods) 
                            ? bookingSettings.payment_methods
                            : ['現場付款'];
                          
                          // 如果沒有設定付款方式，預設提供「現場付款」
                          // 暫時隱藏 LINE Pay 選項
                          const displayMethods = (availableMethods.length > 0 
                            ? availableMethods 
                            : ['現場付款']).filter((m: string) => m !== 'LINE Pay');
                          
                          return displayMethods.map((method: string) => {
                            const PaymentIcon = method === '信用卡' ? CreditCard : 
                                               method === 'LINE Pay' ? Smartphone : 
                                               Home;
                            
                            return (
                              <div
                                key={method}
                                className={`cursor-pointer transition-all rounded-lg border-2 p-4 hover:border-primary/50 ${
                                  paymentMethod === method
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border bg-card"
                                }`}
                                onClick={() => setPaymentMethod(method)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`rounded-full p-2 ${
                                    paymentMethod === method
                                      ? "bg-primary/20"
                                      : "bg-muted"
                                  }`}>
                                    <PaymentIcon className={`h-5 w-5 ${
                                      paymentMethod === method
                                        ? "text-primary"
                                        : "text-muted-foreground"
                                    }`} />
                                  </div>
                                  <div className="flex-1">
                                    <span className={`font-medium text-base ${
                                      paymentMethod === method
                                        ? "text-foreground"
                                        : "text-foreground/80"
                                    }`}>
                                      {method}
                                    </span>
                                    {/* 訂金提示已移除：線上付款一律收全額 */}
                                  </div>
                                  {paymentMethod === method && (
                                    <CheckCircle className="h-5 w-5 text-primary ml-auto" />
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}

                        {/* TapPay 信用卡表單 */}
                        {paymentMethod === '信用卡' && (
                          <div className="mt-4 p-4 border rounded-lg bg-card">
                            <div className="mb-3">
                              <p className="text-sm font-medium text-foreground mb-1">請輸入信用卡資訊</p>
                              <p className="text-xs text-muted-foreground">您的卡片資訊由 TapPay 安全加密處理</p>
                            </div>
                            {tappayConfigLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                <span className="ml-2 text-sm text-muted-foreground">取得付款設定...</span>
                              </div>
                            ) : tappayConfigError ? (
                              <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>付款模組載入失敗</AlertTitle>
                                <AlertDescription>
                                  <p className="mb-3">{tappayConfigError}</p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => reloadTapPayConfig()}
                                  >
                                    重新載入
                                  </Button>
                                </AlertDescription>
                              </Alert>
                            ) : !isTapPayReady ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                <span className="ml-2 text-sm text-muted-foreground">載入付款表單...</span>
                              </div>
                            ) : (
                              <>
                                <div className="space-y-3">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">卡號</Label>
                                    <div id="card-number" className="tpfield h-10 border rounded-md px-3 bg-background"></div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">有效期限</Label>
                                      <div id="card-expiration-date" className="tpfield h-10 border rounded-md px-3 bg-background"></div>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">安全碼</Label>
                                      <div id="card-ccv" className="tpfield h-10 border rounded-md px-3 bg-background"></div>
                                    </div>
                                  </div>
                                </div>
                                {cardValid && (
                                  <div className="mt-3 flex items-center gap-2 text-sm text-success">
                                    <CheckCircle className="h-4 w-4" />
                                    <span>卡片資訊已驗證</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        
                        {/* 付款錯誤提示 */}
                        {lastPaymentError && paymentMethod && (
                          <Alert variant="destructive" className="mt-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>付款失敗</AlertTitle>
                            <AlertDescription>
                              <p className="mb-2">{lastPaymentError.message}</p>
                              <p className="text-sm">{lastPaymentError.suggestion}</p>
                              {paymentRetryCount > 0 && (
                                <p className="text-xs mt-2 opacity-80">
                                  已重試 {paymentRetryCount}/{MAX_RETRY_ATTEMPTS} 次
                                </p>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>

                    {/* 訂金說明已移除：所有訂單一律收取全額 */}

                    {/* 提示資訊 */}
                    {paymentMethod && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                        <div className="flex gap-3">
                          <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              付款方式已選擇
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              您已選擇「{paymentMethod}」作為付款方式，請確認後繼續下一步
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 5: Confirmation */}
                {currentStep === "confirm" && (
                  <div className="space-y-6">
                    {/* 訂房資訊卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <Home className="h-5 w-5 text-primary" />
                          訂房資訊
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          請確認您的訂房資訊是否正確
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">房型</p>
                          <p className="font-semibold text-sm sm:text-base">{selectedRoom?.name}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">入住</p>
                            <p className="font-medium text-xs sm:text-sm">{format(new Date(checkInDateStr), "MM/dd (E)", { locale: zhTW })}</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">退房</p>
                            <p className="font-medium text-xs sm:text-sm">{format(new Date(checkOutDateStr), "MM/dd (E)", { locale: zhTW })}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">人數</p>
                            <p className="font-medium text-xs sm:text-sm">{totalGuests} 人</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">方案</p>
                            <p className="font-medium text-xs sm:text-sm">{getMealPlanDisplayName(selectedMealPlan)}</p>
                          </div>
                        </div>

                        {(petCount > 0 || Object.values(bbqMealsByDate).some(count => count > 0) || Object.values(customAddonCounts).some(c => c > 0)) && (
                          <>
                            <Separator />
                            <div className="space-y-3">
                              <p className="text-sm font-semibold flex items-center gap-2">
                                <ShoppingBag className="h-4 w-4 text-primary" />
                                加購方案
                              </p>
                              {petCount > 0 && (
                                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm">🐾 寵物方案 × {petCount} 隻 × {calculateNights()} 晚</span>
                                    <span className="text-sm font-semibold">NT$ {(petCount * petPlanSettings.pricePerUnit * calculateNights()).toLocaleString()}</span>
                                  </div>
                                </div>
                              )}
                              {Object.entries(bbqMealsByDate).filter(([_, count]) => count > 0).length > 0 && (
                                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                                  <p className="text-sm font-medium flex items-center gap-2">
                                    🍖 餐食方案
                                  </p>
                                  <div className="space-y-1 pl-4">
                                    {Object.entries(bbqMealsByDate)
                                      .filter(([_, count]) => count > 0)
                                      .map(([dateStr, count]) => (
                                        <div key={dateStr} className="flex justify-between text-xs">
                                          <span className="text-muted-foreground">
                                            {format(new Date(dateStr), "yyyy/MM/dd (E)", { locale: zhTW })} × {count} 人
                                          </span>
                                          <span className="font-medium">NT$ {(count * mealPlanSettings.pricePerUnit).toLocaleString()}</span>
                                        </div>
                                      ))
                                    }
                                  </div>
                                </div>
                              )}
                              {Object.entries(customAddonCounts).filter(([_, count]) => count > 0).map(([type, count]) => {
                                const setting = customAddonSettings.find(s => s.addon_type === type);
                                return (
                                  <div key={type} className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">🛏️ {setting?.description || type} × {count} × {calculateNights()} 晚</span>
                                      <span className="text-sm font-semibold">NT$ {(count * (setting?.price_per_unit || 0) * calculateNights()).toLocaleString()}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* 旅客資訊卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <User className="h-5 w-5 text-primary" />
                          旅客資訊
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          確認聯絡資訊無誤
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-2 sm:space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:gap-3">
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">姓名</p>
                            <p className="font-medium text-sm">{guestInfo.name}</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              手機號碼
                            </p>
                            <p className="font-medium text-sm">{guestInfo.phone}</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              電子郵件
                            </p>
                            <p className="font-medium text-sm break-all">{guestInfo.email}</p>
                          </div>
                          {guestInfo.address && (
                            <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">聯絡地址</p>
                              <p className="font-medium text-sm">{guestInfo.address}</p>
                            </div>
                          )}
                          {guestInfo.notes && (
                            <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">備註</p>
                              <p className="font-medium text-sm leading-relaxed">{guestInfo.notes}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* 付款方式卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <CreditCard className="h-5 w-5 text-primary" />
                          付款方式
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          確認您選擇的付款方式
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="p-4 bg-muted/50 rounded-lg">
                          <p className="font-medium text-base">{paymentMethod}</p>
                        </div>
                        {appliedDiscount && (
                          <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Badge className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">已套用折扣代碼</p>
                                <p className="font-medium text-sm">{appliedDiscount.code}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 重要提醒 */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <div className="flex gap-3">
                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-foreground">
                            請確認所有資訊
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-1 leading-relaxed">
                            <li>• 確認訂房資訊、旅客資訊及付款方式無誤後，點擊「確認訂房」</li>
                            <li>• 我們會寄送訂單確認信至您的電子郵件</li>
                            <li>• 如需修改，請點擊「上一步」返回編輯</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex gap-3 sm:gap-4 mt-4 sm:mt-6 sticky bottom-0 bg-background py-3 sm:py-0 sm:static -mx-3 px-3 sm:mx-0 sm:px-0 border-t sm:border-t-0 z-10">
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
                  disabled={isPreparingPrime}
                  className="flex-1"
                  size="lg"
                >
                  {isPreparingPrime ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      準備付款中...
                    </>
                  ) : (
                    <>
                      下一步
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmBooking}
                  disabled={isSubmitting || isProcessingPayment || paymentFailed}
                  className={`flex-1 ${paymentFailed ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary'}`}
                  size="lg"
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      處理付款中...
                    </>
                  ) : isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      建立訂單中...
                    </>
                  ) : paymentFailed ? (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      付款失敗
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

          {/* Right: Summary Sidebar - 只在有可用房型時顯示 */}
          {(() => {
            // 檢查是否所有房型都無法預訂
            const hasAvailableRooms = !checkInDate || !checkOutDate || isCheckingAvailability || roomTypes.some(room => {
              const availability = roomAvailability[room.id];
              if (!availability) return false;
              return !availability.isBlocked && !availability.hasMissingPricing && !availability.hasNoAvailability;
            });
            
            // 如果在房型選擇步驟且所有房型都無法預訂，隱藏訂單摘要
            if (currentStep === "room" && checkInDate && checkOutDate && !isCheckingAvailability && !hasAvailableRooms) {
              return null;
            }
            
            return (
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
                              {getMealPlanDisplayName(selectedMealPlan)} × {calculateNights()} 晚
                            </span>
                            <span className="font-medium">
                              NT$ {calculateTotal().toLocaleString()}
                            </span>
                          </div>
                          {petCount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                🐾 寵物方案 × {petCount} × {calculateNights()} 晚
                              </span>
                              <span className="font-medium">
                                NT$ {(petCount * petPlanSettings.pricePerUnit * calculateNights()).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {Object.entries(bbqMealsByDate).filter(([_, count]) => count > 0).map(([dateStr, count]) => (
                            <div key={dateStr} className="flex justify-between">
                              <span className="text-muted-foreground">
                                🍖 {format(new Date(dateStr), "MM/dd")} 餐食方案 × {count} 人
                              </span>
                              <span className="font-medium">
                                NT$ {(count * mealPlanSettings.pricePerUnit).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {Object.entries(customAddonCounts).filter(([_, count]) => count > 0).map(([type, count]) => {
                            const setting = customAddonSettings.find(s => s.addon_type === type);
                            return (
                              <div key={type} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  🛏️ {setting?.description || type} × {count} × {calculateNights()} 晚
                                </span>
                                <span className="font-medium">
                                  NT$ {(count * (setting?.price_per_unit || 0) * calculateNights()).toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
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
                        {false && (
                          <>
                            <Separator />
                            <div className="bg-primary/5 p-3 rounded-lg">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium">需支付訂金</span>
                              </div>
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
            );
          })()}
        </div>
      </div>
      </>
      )}

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
        <DialogContent className="max-w-3xl w-[95vw] md:w-full max-h-[85vh] md:max-h-[90vh] flex flex-col gap-0 p-0">
          <div className="p-4 md:p-6 border-b">
            <DialogTitle className="text-xl md:text-2xl font-bold mb-2">🐾 毛孩方案</DialogTitle>
            <DialogDescription className="text-base md:text-lg text-primary font-semibold">
              每隻 NT$ {petPlanSettings.pricePerUnit} / 每晚
            </DialogDescription>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div 
              className="space-y-4 md:space-y-5 text-sm md:text-base prose prose-sm max-w-none"
              dangerouslySetInnerHTML={createSanitizedHtml(petPlanSettings.detailedDescription || `
                  <h3 class="text-lg md:text-xl font-semibold">寵物入住守則</h3>
                  <div class="space-y-4 text-sm md:text-base">
                    <p class="text-[15px] md:text-base">僅開放毛孩進入指定之 2 棟 Villa 及公共區域。請於訂房時選擇加購毛孩方案。</p>
                    <p class="text-[15px] md:text-base">毛孩於辦理入住時，預先支付現金 2,000 元押金，退房確認房內各項設備正常後歸還。</p>
                    <div class="bg-primary/5 p-3 md:p-4 rounded-lg">
                      <h4 class="font-semibold mb-2 text-sm md:text-base">寵物專屬備品：</h4>
                      <p class="text-[15px] md:text-base">園區提供寵物餐碗、寵物行軍床、寵物零食。</p>
                    </div>
                    <div class="bg-destructive/10 p-3 md:p-4 rounded-lg border border-destructive/20">
                      <p class="font-semibold text-destructive text-[15px] md:text-base">
                        若違反下述規範，家長則須支付 5,000 元罰金。
                      </p>
                    </div>
                  </div>
                `)}
            />
          </div>

          <div className="p-4 md:p-6 border-t bg-muted/30">
            <Button onClick={() => setIsPetPolicyDialogOpen(false)} className="w-full h-11 md:h-10 text-base">
              我了解了
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* 餐食加購詳細內容對話框 */}
      <Dialog open={isBbqDetailsDialogOpen} onOpenChange={setIsBbqDetailsDialogOpen}>
        <DialogContent className="max-w-3xl w-[95vw] md:w-full max-h-[85vh] md:max-h-[90vh] flex flex-col gap-0 p-0">
          <div className="p-4 md:p-6 border-b">
            <DialogTitle className="text-xl md:text-2xl font-bold mb-2">🍖 餐食方案</DialogTitle>
            <DialogDescription className="text-base md:text-lg text-primary font-semibold">
              每人 NT$ {mealPlanSettings.pricePerUnit} / 每日
            </DialogDescription>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div 
              className="space-y-4 md:space-y-5 text-sm md:text-base prose prose-sm max-w-none"
              dangerouslySetInnerHTML={createSanitizedHtml(mealPlanSettings.detailedDescription || `
                  <div>
                    <p class="text-base md:text-lg text-muted-foreground font-semibold mb-1">森山寫照 X 燃甄 RAN RAN</p>
                    <p class="text-lg md:text-xl font-bold text-primary">炭火饗之夜 Evening Dining Set</p>
                  </div>
                  <div class="bg-muted/50 p-3 md:p-4 rounded-lg">
                    <h3 class="text-base md:text-lg font-semibold mb-3">📋 注意事項</h3>
                    <ul class="space-y-3 text-sm md:text-base list-none">
                      <li class="flex gap-2">
                        <span class="text-primary font-semibold flex-shrink-0">•</span>
                        <span class="text-[15px] md:text-base">平日下限${mealPlanSettings.weekdayMinQuantity}人，假日下限${mealPlanSettings.weekendMinQuantity}人，上限${mealPlanSettings.maxQuantity}人</span>
                      </li>
                      <li class="flex gap-2">
                        <span class="text-primary font-semibold flex-shrink-0">•</span>
                        <span class="text-[15px] md:text-base">需於訂房時預約，現場恕不接受臨時加購</span>
                      </li>
                    </ul>
                  </div>
                `)}
            />
          </div>

          <div className="p-4 md:p-6 border-t bg-muted/30">
            <Button onClick={() => setIsBbqDetailsDialogOpen(false)} className="w-full h-11 md:h-10 text-base">
              我了解了
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 付款重試對話框 */}
      <Dialog open={showRetryDialog} onOpenChange={(open) => {
        setShowRetryDialog(open);
        if (!open) {
          setPaymentFailed(false);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <X className="h-6 w-6 text-destructive" />
            付款失敗
          </DialogTitle>
          <DialogDescription className="space-y-4">
            {lastPaymentError && (
              <>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <p className="text-sm font-semibold mb-2 text-destructive">{lastPaymentError.message}</p>
                  <p className="text-xs text-muted-foreground">{lastPaymentError.suggestion}</p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm font-semibold mb-2">建議處理方式：</p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>檢查信用卡資訊是否正確（卡號、有效期限、安全碼）</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>確認網路連線是否穩定</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>確認信用卡額度是否足夠</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>嘗試使用其他付款方式</span>
                    </li>
                  </ul>
                </div>

                {paymentRetryCount > 0 && (
                  <div className="text-xs text-center bg-muted/30 py-2 rounded-lg">
                    已重試 <span className="font-semibold text-primary">{paymentRetryCount}</span> / {MAX_RETRY_ATTEMPTS} 次
                  </div>
                )}
              </>
            )}
          </DialogDescription>
          
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowRetryDialog(false);
                setPaymentFailed(false);
                setCurrentStep('payment');
              }}
              className="flex-1"
            >
              返回修改
            </Button>
            <Button
              onClick={handlePaymentRetry}
              disabled={paymentRetryCount >= MAX_RETRY_ATTEMPTS}
              className="flex-1"
            >
              {paymentRetryCount >= MAX_RETRY_ATTEMPTS ? '已達上限' : '重試付款'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 開發環境住宿切換器 */}
      <DevAccommodationSwitcher />
    </div>
  );
};

export default BookingFlow;
