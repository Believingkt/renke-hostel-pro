import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { bookingPath } from "@/lib/frontendUrl";
import { supabase } from "@/integrations/supabase/client";
import { atmAmountLimitMessage, isAtmAmountAllowed } from "@/lib/atmLimits";
import { getDepositBreakdown } from "@/lib/bookingDeposit";

import { useSubdomain } from "@/hooks/use-subdomain";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
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
  Building2,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";
import {
  guestInfoSchema,
  bookingFlowDateSchema as dateValidationSchema,
} from "@/lib/schemas/booking";
import { getOtpCooldown, markOtpSent } from "@/lib/otpThrottle";
import { requestMemberOtp } from "@/lib/requestMemberOtp";
import { SYNTHETIC_EMAIL_RE } from "@/components/member/MissingEmailNotice";

import { format, formatISO, addMonths, endOfMonth } from "date-fns";
import { classifyDayTier } from "@/utils/templatePriceResolver";
import { isTemplateActiveForDates, getTierForDate, hasSegments as templateHasSegments } from "@/utils/pricingTemplateHelpers";
import {
  DEFAULT_CHILD_AGE_RULES,
  parseChildAgeRules,
  evaluateChildSelection,
  type ChildAgeRules,
  type ChildSelection,
} from "@/lib/child-rules";
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
import { resolveAddonIcon } from "@/lib/addonIcon";
import { cleanAddonName, shortUnit, addonPriceLine, addonNightsMultiplier, normalizeAddonPricingMode, addonStepUp, addonStepDown } from "@/lib/addonLabels";
import BookerForm from "@/components/booking-flow/BookerForm";
import MobileOrderSummary from "@/components/booking-flow/MobileOrderSummary";
import MemberSessionBar from "@/components/booking-flow/MemberSessionBar";
import { getPaymentOriginForAccommodation } from "@/utils/paymentDomain";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import roomDeluxe from "@/assets/room-deluxe.jpg";
import roomSuite from "@/assets/room-suite.jpg";
import roomStandard from "@/assets/room-standard.jpg";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { DevAccommodationSwitcher } from "@/components/DevAccommodationSwitcher";
import MobileBottomNav from "@/components/member/MobileBottomNav";
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
  bank_account_info?: string | null;
}

const DEPOSIT_AMOUNT = 5000;

import {
  detectTierByDate,
  useAccommodationHolidays,
} from "@/hooks/use-accommodation-packages";
import {
  fetchPackageDatePricesForPackage,
  overrideKey,
  type PackageDatePriceMap,
} from "@/lib/packageDatePrice";

type BookingStep = "dates" | "room" | "addons" | "guest" | "payment" | "confirm";

const BookingFlow = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { accommodationId, isLoading: subdomainLoading, error: subdomainError } = useSubdomain();
  const keyboardInset = useKeyboardInset();
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

  // 國定假日（供方案 tier 判定使用）
  const { isHolidayDate: isPackageHolidayDate } = useAccommodationHolidays(accommodationId);

  
  // 強制：若 URL 已帶 roomId + 日期，一律直達單頁結帳，絕對不顯示選擇房型/日期步驟
  const [currentStep, setCurrentStep] = useState<BookingStep>(() => {
    const hasRoom = !!searchParams.get("roomId");
    const hasDates = !!searchParams.get("checkIn") && !!searchParams.get("checkOut");
    const stepParam = searchParams.get("step");
    if (stepParam && ["dates", "room", "addons", "guest", "payment", "confirm"].includes(stepParam)) {
      return stepParam as BookingStep;
    }
    if (hasRoom && hasDates) return "payment";
    return "dates";
  });
  // 加購方案是否展開（預設收合）
  const [isAddonsExpanded, setIsAddonsExpanded] = useState(false);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [accommodationName, setAccommodationName] = useState("");
  const [accommodationLogo, setAccommodationLogo] = useState<string | null>(null);
  const [isAccommodationLoaded, setIsAccommodationLoaded] = useState(false);
  const [accommodationLineId, setAccommodationLineId] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomPricing, setRoomPricing] = useState<Record<string, number>>({});
  
  // 會員登入狀態
  const [loggedInMember, setLoggedInMember] = useState<{ id: string; name: string; email: string; phone: string } | null>(null);
  // LINE / Facebook 登入的會員：帳號本身沒有可收信的 Email（社群假信箱），
  // 結帳頁輸入的 Email 只作為「寄送通知信」用途，不再觸發 OTP 會員驗證。
  const [isSocialMember, setIsSocialMember] = useState(false);

  // Email 先行驗證狀態
  const [emailCheckStatus, setEmailCheckStatus] = useState<"idle" | "checking" | "exists" | "new" | "registered">("idle");
  const [emailCheckedFor, setEmailCheckedFor] = useState<string>("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registeredMemberId, setRegisteredMemberId] = useState<string | null>(null);
  const checkInFlightRef = useRef<string | null>(null);

  // Email 檢查 / OTP / 註冊 handlers 在 guestInfo 宣告後定義（見下方）



  // 訂房資料
  const [selectedRoom, setSelectedRoom] = useState<RoomType | null>(null);
  const [selectedMealPlan, setSelectedMealPlan] = useState<string>("2_meals");
  const [guestInfo, setGuestInfo] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    eta: "",
  });

  // Debounce Email 檢查
  useEffect(() => {
    const email = (guestInfo.email || "").trim().toLowerCase();
    // 社群登入會員：Email 僅用於接收通知信，不做會員驗證
    if (loggedInMember && isSocialMember) {
      setEmailCheckStatus("idle");
      setOtpSent(false);
      return;
    }
    if (loggedInMember && email === (loggedInMember.email || "").trim().toLowerCase()) {
      setEmailCheckStatus("idle");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailCheckStatus("idle");
      setEmailCheckedFor("");
      setOtpSent(false);
      return;
    }
    // Guard: 已檢查過同一 email 就跳過（無論狀態），避免覆蓋 registered
    if (email === emailCheckedFor) return;
    const t = setTimeout(async () => {
      // Prevent concurrent duplicate calls for same email
      if (checkInFlightRef.current === email) return;
      checkInFlightRef.current = email;
      setEmailCheckStatus("checking");
      try {
        const { data, error } = await supabase.functions.invoke("check-member-email", { body: { email } });
        if (error) throw error;
        setEmailCheckedFor(email);
        if (data?.exists) {
          setEmailCheckStatus("exists");
          // Throttle: skip send if within cooldown / hourly cap
          const wait = getOtpCooldown(email);
          if (wait > 0) {
            setOtpSent(true);
            toast({
              title: "驗證碼稍候可再寄送",
              description: `為避免超過寄送限制，請 ${wait} 秒後再試，或直接輸入先前收到的驗證碼`,
            });
          } else if (!otpSending) {
            setOtpSending(true);
            const result = await requestMemberOtp(email, { redirectTo: window.location.href });
            setOtpSending(false);
            if (!result.ok) {
              if (result.rateLimited) setOtpSent(true);
              toast({
                title: result.rateLimited ? "驗證碼稍候可再寄送" : "驗證碼寄送失敗",
                description: result.message || "請稍後再試",
                variant: result.rateLimited ? "default" : "destructive",
              });
            } else {
              setOtpSent(true);
            }
          }

        } else {
          setEmailCheckStatus("new");
          setOtpSent(false);
        }
      } catch (e: any) {
        setEmailCheckStatus("idle");
        toast({ title: "無法驗證此 Email", description: e?.message || "請稍後再試", variant: "destructive" });
      } finally {
        if (checkInFlightRef.current === email) checkInFlightRef.current = null;
      }
    }, 800);
    return () => clearTimeout(t);
  }, [guestInfo.email, loggedInMember, isSocialMember, emailCheckedFor, toast]);

  /** 已登入帳號與輸入 Email 不一致時，訂單不可掛在舊帳號上 */
  const isMemberEmailMismatch = !!loggedInMember
    && !isSocialMember
    && !!guestInfo.email.trim()
    && guestInfo.email.trim().toLowerCase() !== (loggedInMember.email || "").trim().toLowerCase();
  const effectiveMemberId = loggedInMember && !isMemberEmailMismatch ? loggedInMember.id || null : null;

  const handleSwitchAccount = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("signOut failed", e);
    }
    setLoggedInMember(null);
    setEmailCheckStatus("idle");
    setEmailCheckedFor("");
    setOtpSent(false);
    setOtpCode("");
    setOtpError("");
    toast({ title: "已登出原帳號", description: "請以本次訂房的 Email 完成驗證登入" });
  };

  const handleVerifyOtp = async () => {
    const email = guestInfo.email.trim().toLowerCase();
    if (!otpCode || otpCode.length < 6) {
      setOtpError("請輸入完整的 6 位數驗證碼");
      toast({ title: "請輸入 6 位數驗證碼", variant: "destructive" });
      return;
    }
    setOtpVerifying(true);
    setOtpError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: "email" });
      if (error || !data?.user) {
        const raw = (error?.message || "").toLowerCase();
        const friendly = raw.includes("expired")
          ? "驗證碼已逾時（寄出後 10 分鐘內有效），請點下方「重新寄送驗證碼」取得新的驗證碼。"
          : raw.includes("invalid") || raw.includes("token")
          ? "驗證碼錯誤，請確認信件中最新一封的 6 位數字後再試一次。"
          : raw.includes("rate") || raw.includes("many")
          ? "嘗試次數過多，請稍候幾分鐘後再重新寄送驗證碼。"
          : (error?.message || "驗證失敗，請再試一次或重新寄送驗證碼。");
        setOtpError(friendly);
        toast({ title: "驗證失敗", description: friendly, variant: "destructive" });
        return;
      }
      setOtpError("");

      const userId = data.user.id;
      let { data: profile } = await supabase
        .from("platform_members")
        .select("id, user_id, name, email, phone")
        .eq("user_id", userId)
        .maybeSingle();

      // Bug B: 舊帳號無 profile，立即以 guestInfo 補建
      if (!profile) {
        const upsertPayload = {
          user_id: userId,
          email,
          name: guestInfo.name || email.split("@")[0],
          phone: guestInfo.phone || null,
        };
        const { data: upserted, error: upsertErr } = await supabase
          .from("platform_members")
          .upsert(upsertPayload, { onConflict: "user_id" })
          .select("id, user_id, name, email, phone")
          .maybeSingle();
        if (upsertErr) {
          console.error("platform_members upsert failed:", upsertErr.message);
        } else if (upserted) {
          profile = upserted;
        }
      }

      const p: any = profile || { id: null, user_id: userId, name: guestInfo.name || "", email, phone: guestInfo.phone || "" };
      // member_id 對應 platform_members.id（非 auth user id），會員中心以此查詢訂單
      setLoggedInMember({ id: p.id || "", name: p.name || "", email: (p.email || email).toLowerCase(), phone: p.phone || "" });
      setEmailCheckedFor((p.email || email).toLowerCase());
      setGuestInfo(prev => ({
        ...prev,
        name: prev.name || p.name || "",
        phone: prev.phone || p.phone || "",
        email: p.email || email,
      }));
      toast({ title: "驗證成功", description: "已登入會員" });
    } catch (e: any) {
      setOtpError(e?.message || "驗證時發生錯誤，請再試一次或重新寄送驗證碼。");
      toast({ title: "驗證失敗", description: e?.message || "請稍後再試", variant: "destructive" });
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleQuickRegister = async (withPassword: boolean) => {
    const email = guestInfo.email.trim().toLowerCase();
    if (!email) return;
    if (withPassword && registerPassword.length < 8) {
      toast({ title: "密碼至少 8 碼", variant: "destructive" });
      return;
    }
    setRegisterSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-member-guest", {
        body: {
          email,
          password: withPassword ? registerPassword : undefined,
          name: guestInfo.name || undefined,
          phone: guestInfo.phone || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRegisteredMemberId(data.member_id);

      // Bug E: 註冊成功後自動登入
      if (withPassword) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: registerPassword,
        });
        if (signInErr || !signInData?.user) {
          setEmailCheckStatus("registered");
          toast({
            title: "註冊成功，請完成 Email 驗證",
            description: signInErr?.message || "驗證信已寄出，驗證後即可登入",
          });
        } else {
          const { data: newMember } = await supabase
            .from("platform_members")
            .select("id, name, email, phone")
            .eq("user_id", signInData.user.id)
            .maybeSingle();
          setLoggedInMember({
            id: newMember?.id || data?.member_id || "",
            name: newMember?.name || guestInfo.name || "",
            email: (newMember?.email || email).toLowerCase(),
            phone: newMember?.phone || guestInfo.phone || "",
          });
          setEmailCheckedFor(email);
          toast({ title: "註冊並登入成功" });
        }
      } else {
        // 無密碼：切換至 OTP 驗證模式讓使用者完成登入
        const wait = getOtpCooldown(email);
        const result = wait > 0
          ? { ok: true, cooldown: wait, message: "" }
          : await requestMemberOtp(email, { redirectTo: window.location.href });
        if (!result.ok && !result.rateLimited) {
          setEmailCheckStatus("registered");
          toast({
            title: "註冊成功",
            description: result.message || "驗證信已寄出，請至信箱確認",
          });
        } else {
          setEmailCheckStatus("exists");
          setOtpSent(true);
          setEmailCheckedFor(email);
          toast({
            title: "註冊成功，請輸入驗證碼",
            description: result.rateLimited
              ? (result.message || "請稍候後再重新寄送驗證碼")
              : "6 位數驗證碼已寄至您的信箱",
          });
        }

      }
    } catch (e: any) {
      const raw = e?.message || "";
      const msg = raw === "email_exists" ? "此 Email 已註冊，請改用登入" : (raw || "註冊失敗，請稍後再試");
      toast({ title: "註冊失敗", description: msg, variant: "destructive" });
    } finally {
      setRegisterSubmitting(false);
    }
  };


  const [paymentMethod, setPaymentMethod] = useState("");
  // 訂單金額付款方式：信用卡 | ATM 虛擬帳號（信用卡沿用 paymentMethod，這裡是上層分類）
  const [orderPaymentType, setOrderPaymentType] = useState<"credit_card" | "atm" | "">("");
  // 押金 5000 付款方式：card（線上綁卡 / 沿用同張卡）| cash（現場現金）
  // 押金付款方式（UI 已移除，預設現場現金以維持既有流程）
  const [depositPaymentType, setDepositPaymentType] = useState<"card" | "cash" | "">("cash");
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
    /** 整段期間每晚可訂間數的最小值（多間預訂用） */
    minAvailable?: number | null;
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

  // 兒童分齡（嬰兒 / 幼兒 / 兒童 → contextGuests.children 沿用為「兒童 7-12」）
  const [childRules, setChildRules] = useState<ChildAgeRules>(DEFAULT_CHILD_AGE_RULES);
  const [infantsCount, setInfantsCount] = useState(0);
  const [toddlersCount, setToddlersCount] = useState(0);
  const [bbqMealsByDate, setBbqMealsByDate] = useState<Record<string, number>>({});
  const [hiddenBbqDates, setHiddenBbqDates] = useState<Set<string>>(new Set());
  const [isBbqMealsExpanded, setIsBbqMealsExpanded] = useState(false);

  // 自訂加購方案（非 pet/meal 類型）
  interface CustomAddonSetting {
    id: string;
    addon_type: string;
    description: string | null;
    detailed_description: string | null;
    price_per_unit: number;
    min_quantity: number;
    max_quantity: number;
    unit_label: string;
    pricing_mode: 'per_night' | 'per_stay';
    enabled: boolean;
    icon_key: string | null;
    show_icon: boolean;
    auto_include: boolean;
    is_locked: boolean;
  }
  const [customAddonSettings, setCustomAddonSettings] = useState<CustomAddonSetting[]>([]);
  const [customAddonCounts, setCustomAddonCounts] = useState<Record<string, number>>({});
  const [isBbqDetailsDialogOpen, setIsBbqDetailsDialogOpen] = useState(false);
  const [customAddonDetail, setCustomAddonDetail] = useState<{ title: string; subtitle: string; html: string } | null>(null);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  
  // TapPay 設定 - 從後端動態載入
  // 需要 TapPay 卡片欄位的情境：
  // 1. 訂單金額付款方式為信用卡
  // 2. 訂單為 ATM 虛擬帳號，但押金選擇線上綁卡（需單獨輸入綁卡用信用卡）
  const needsCardForm =
    paymentMethod === '信用卡' ||
    (orderPaymentType === 'atm' && depositPaymentType === 'card');
  const shouldLoadTapPay = needsCardForm;
  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
    reload: reloadTapPayConfig,
  } = useTapPayConfig(shouldLoadTapPay);


  // TapPay 狀態
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [cardFieldError, setCardFieldError] = useState<string | null>(null);
  const [cardSubmitAttempted, setCardSubmitAttempted] = useState(false);
  const cardErrorDebounceRef = useRef<number | null>(null);
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
    room_type_ids?: string[] | null;
    weekday_price: number | null;
    peak_price: number | null;
    weekend_price: number | null;
    price: number | null;
    valid_from?: string | null;
    valid_until?: string | null;
    room_overrides?: any;
    season_segments?: any;
    extra_dates?: any;
    excluded_dates?: any;
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
      if (!user) { setLoggedInMember(null); setIsSocialMember(false); return; }
      const { data: member } = await supabase
        .from("platform_members")
        .select("id, name, email, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (member) {
        const memberEmail = member.email || user.email || "";
        const social = SYNTHETIC_EMAIL_RE.test(memberEmail);
        setIsSocialMember(social);
        setLoggedInMember({ ...member, email: social ? "" : memberEmail });
        // 自動填入會員資料（社群假信箱不帶入，讓客人自行填寫收信用 Email）
        setGuestInfo(prev => ({
          ...prev,
          name: prev.name || member.name || "",
          email: prev.email || (social ? "" : memberEmail),
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
          .select("name, line_id, header_logo_url, child_age_rules")
          .eq("id", accommodationId)
          .single();
        
        if (infoData) {
          setAccommodationName(infoData.name);
          setAccommodationLineId(infoData.line_id);
          setAccommodationLogo(infoData.header_logo_url);
          setChildRules(parseChildAgeRules((infoData as any).child_age_rules));
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
          .eq("accommodation_id", accommodationId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

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
          const otherAddons = addonData.filter(a => a.addon_type !== 'pet' && a.addon_type !== 'meal' && a.enabled && (a as any).show_on_frontend !== false);
          if (otherAddons.length > 0) {
            setCustomAddonSettings(otherAddons.map(a => ({
              id: a.id,
              addon_type: a.addon_type,
              description: a.description,
              detailed_description: a.detailed_description,
              price_per_unit: a.price_per_unit,
              min_quantity: (a as any).min_quantity ?? 0,
              max_quantity: a.max_quantity,
              unit_label: a.unit_label,
              pricing_mode: normalizeAddonPricingMode((a as any).pricing_mode),
              enabled: a.enabled || false,
              icon_key: (a as any).icon_key ?? null,
              show_icon: (a as any).show_icon !== false,
              auto_include: (a as any).auto_include === true,
              is_locked: (a as any).is_locked === true,
            })));
            // 自動帶入的加購（例如清潔費）：只影響新訂單，預設帶入下限數量
            const autoDefaults: Record<string, number> = {};
            for (const a of otherAddons) {
              if ((a as any).auto_include === true) {
                autoDefaults[a.addon_type] = Math.max(1, (a as any).min_quantity ?? 0);
              }
            }
            if (Object.keys(autoDefaults).length > 0) {
              setCustomAddonCounts(prev => ({ ...autoDefaults, ...prev }));
            }
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
          .select("id, template_name, project_name, meal_plans, display_order, room_type_id, room_type_ids, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, price, valid_from, valid_until, room_overrides, season_segments, extra_dates, excluded_dates")
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
              room_type_ids: (t as any).room_type_ids ?? null,
              weekday_price: t.weekday_price ?? null,
              peak_price: t.peak_price ?? null,
              weekend_price: t.weekend_price ?? null,
              price: t.price ?? null,
              valid_from: (t as any).valid_from ?? null,
              valid_until: (t as any).valid_until ?? null,
              room_overrides: (t as any).room_overrides ?? [],
              season_segments: (t as any).season_segments ?? [],
              extra_dates: (t as any).extra_dates ?? [],
              excluded_dates: (t as any).excluded_dates ?? [],
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

  // 當選擇房型 / 日期 / 國定假日變化時，篩選對應的專案模板
  // 規則：若任一晚對應的 tier 價格 ≤ 0（且無 fallback），該方案視為當期不販售→隱藏
  useEffect(() => {
    if (allPricingTemplates.length === 0) return;

    let filtered: PricingTemplateOption[];
    if (selectedRoom) {
      filtered = allPricingTemplates.filter(t => {
        const ids = t.room_type_ids;
        if (Array.isArray(ids) && ids.length > 0) return ids.includes(selectedRoom.id);
        return t.room_type_id === selectedRoom.id;
      });
      if (filtered.length === 0) {
        filtered = allPricingTemplates.filter(t => {
          const ids = t.room_type_ids;
          const hasIds = Array.isArray(ids) && ids.length > 0;
          return !hasIds && !t.room_type_id;
        });
      }
    } else {
      filtered = allPricingTemplates;
    }

    // 依入住日期 tier 過濾「當期不販售」方案
    if (checkInDate && checkOutDate) {
      const nights = Math.max(0, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000));
      if (nights > 0) {
        const dateStrs: string[] = [];
        for (let i = 0; i < nights; i++) {
          const d = new Date(checkInDate);
          d.setDate(d.getDate() + i);
          dateStrs.push(format(d, "yyyy-MM-dd"));
        }

        // 期限硬性限制：使用 helpers（同時支援 season_segments 與舊版 valid_from/until）
        filtered = filtered.filter(t => isTemplateActiveForDates(t as any, dateStrs));

        const holidaySet = new Set(publicHolidays);
        const tiers: Array<"weekday" | "peak" | "weekend"> = [];
        for (let i = 0; i < nights; i++) {
          const d = new Date(checkInDate);
          d.setDate(d.getDate() + i);
          tiers.push(classifyDayTier(d, holidaySet));
        }

        const legacyTierPrice = (t: PricingTemplateOption, tier: "weekday" | "peak" | "weekend") => {
          const ovList = Array.isArray(t.room_overrides) ? t.room_overrides : [];
          const ov = selectedRoom ? ovList.find((o: any) => o?.room_type_id === selectedRoom.id) : null;
          if (ov) {
            if (tier === "weekend") return ov.weekend_price ?? t.weekend_price ?? t.price ?? 0;
            if (tier === "peak") return ov.peak_price ?? ov.weekday_price ?? t.peak_price ?? t.price ?? 0;
            return ov.weekday_price ?? t.weekday_price ?? t.price ?? 0;
          }
          if (tier === "weekend") return t.weekend_price ?? t.price ?? 0;
          if (tier === "peak") return t.peak_price ?? t.weekday_price ?? t.price ?? 0;
          return t.weekday_price ?? t.price ?? 0;
        };

        filtered = filtered.filter(t => {
          if (templateHasSegments(t as any)) {
            // segments 模式：逐日逐 tier 檢查
            return dateStrs.every((dStr, i) => {
              const info = getTierForDate(t as any, selectedRoom?.id ?? null, dStr, tiers[i]);
              return info.enabled && info.price != null && info.price > 0;
            });
          }

          const ovList = Array.isArray(t.room_overrides) ? t.room_overrides : [];
          const ov = selectedRoom ? ovList.find((o: any) => o?.room_type_id === selectedRoom.id) : null;
          const hasAnyTierPrice =
            (t.weekday_price ?? 0) > 0 ||
            (t.peak_price ?? 0) > 0 ||
            (t.weekend_price ?? 0) > 0 ||
            (t.price ?? 0) > 0 ||
            (ov?.weekday_price ?? 0) > 0 ||
            (ov?.peak_price ?? 0) > 0 ||
            (ov?.weekend_price ?? 0) > 0;
          if (!hasAnyTierPrice) return true;
          // 同時檢查每個 tier 的 enabled 開關：被關閉者視為不可販售
          const tierEnabled = (tier: 'weekday' | 'peak' | 'weekend') => {
            const enKey = tier === 'weekday' ? 'weekday_enabled' : tier === 'peak' ? 'peak_enabled' : 'weekend_enabled';
            if (ov && (ov as any)[enKey] !== undefined) return (ov as any)[enKey] !== false;
            return (t as any)[enKey] !== false;
          };
          return tiers.every(tier => tierEnabled(tier) && legacyTierPrice(t, tier) > 0);
        });
      }
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
  }, [selectedRoom, allPricingTemplates, checkInDate, checkOutDate, publicHolidays]);

  // Read checkIn/checkOut/adults/children from URL params and set in context
  // 注意：URL 參數為權威來源。使用者從詳情頁重新選日期後會導回同一個 /book 路由，
  // 元件不會重新掛載，若只在 context 為空時才套用，就會殘留上一次搜尋的舊日期。
  const lastSyncedSearchRef = useRef<string | null>(null);
  useEffect(() => {
    const search = searchParams.toString();
    const ciParam = searchParams.get("checkIn");
    const coParam = searchParams.get("checkOut");
    const adultsParam = searchParams.get("adults");
    const childrenParam = searchParams.get("children");
    const hasNewSearch = lastSyncedSearchRef.current !== search;
    lastSyncedSearchRef.current = search;

    if (ciParam) {
      const d = new Date(ciParam + "T00:00:00");
      if (!isNaN(d.getTime()) && (!checkInDate || format(checkInDate, "yyyy-MM-dd") !== ciParam)) {
        setCheckInDate(d);
      }
    }
    if (coParam) {
      const d = new Date(coParam + "T00:00:00");
      if (!isNaN(d.getTime()) && (!checkOutDate || format(checkOutDate, "yyyy-MM-dd") !== coParam)) {
        setCheckOutDate(d);
      }
    }

    // 從詳情頁重新選方案但未帶日期時，清掉上一筆殘留的月份，避免沿用舊搜尋
    if (hasNewSearch && !ciParam && !coParam && (searchParams.get("roomId") || searchParams.get("packageId"))) {
      if (checkInDate) setCheckInDate(undefined);
      if (checkOutDate) setCheckOutDate(undefined);
    }

    if (adultsParam || childrenParam) {
      const a = adultsParam ? parseInt(adultsParam, 10) : contextGuests.adults;
      const c = childrenParam ? parseInt(childrenParam, 10) : contextGuests.children;
      if (!isNaN(a) && !isNaN(c) && (a !== contextGuests.adults || c !== contextGuests.children)) {
        setGuests({ adults: a, children: c });
      }
    }
    const infantsParam = searchParams.get("infants");
    const toddlersParam = searchParams.get("toddlers");
    if (infantsParam !== null) {
      const v = parseInt(infantsParam, 10);
      if (!isNaN(v)) setInfantsCount(Math.max(0, v));
    }
    if (toddlersParam !== null) {
      const v = parseInt(toddlersParam, 10);
      if (!isNaN(v)) setToddlersCount(Math.max(0, v));
    }
  }, [searchParams, checkInDate, checkOutDate]);

  // 登入（OTP / 社群）完成後重新以 URL 為準同步一次，避免會員資料載入時覆蓋成舊日期
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      const ciParam = searchParams.get("checkIn");
      const coParam = searchParams.get("checkOut");
      if (ciParam) {
        const d = new Date(ciParam + "T00:00:00");
        if (!isNaN(d.getTime())) setCheckInDate(d);
      }
      if (coParam) {
        const d = new Date(coParam + "T00:00:00");
        if (!isNaN(d.getTime())) setCheckOutDate(d);
      }
    });
    return () => subscription.unsubscribe();
  }, [searchParams]);


  // 從 URL 帶入旅客在詳情頁選定的方案 ID（accommodation_packages.id）
  // 三條建單路徑都會寫入 orders.package_id：
  //   1) 非 3DS 信用卡 → create-paid-order Edge Function
  //   2) 3DS 信用卡 → pending_booking_3ds → complete-3ds-booking Edge Function
  //   3) ATM / 無付款 → 前端直接 insert orders
  const selectedPackageId = searchParams.get("packageId") || null;

  // 載入所選包區方案的房型分配、尊榮禮遇與價格（供手機版摘要與總價計算）
  const [selectedPackage, setSelectedPackage] = useState<{
    name: string | null;
    subtitle: string | null;
    room_allocation: string | null;
    room_type_allocation: Array<{ room_type_id: string; qty: number }>;
    includes: Array<{ text: string; available: "yes" | "no" | "optional"; price_note?: string }>;
    sale_price: number | null;
    original_price: number | null;
    tier_prices: Record<string, { sale?: number; original?: number }> | null;
    applicable_tiers: string[] | null;
  } | null>(null);

  useEffect(() => {
    if (!selectedPackageId) {
      setSelectedPackage(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_packages")
        .select("name, subtitle, room_allocation, room_type_allocation, includes, sale_price, original_price, tier_prices, applicable_tiers")
        .eq("id", selectedPackageId)
        .maybeSingle();
      if (cancelled || !data) return;
      const d = data as any;
      setSelectedPackage({
        name: d.name ?? null,
        subtitle: d.subtitle ?? null,
        room_allocation: typeof d.room_allocation === "string" ? d.room_allocation : null,
        room_type_allocation: Array.isArray(d.room_type_allocation)
          ? d.room_type_allocation.filter(
              (r: any) => r && typeof r.room_type_id === "string" && Number(r.qty) > 0
            )
          : [],
        includes: Array.isArray(d.includes) ? d.includes : [],
        sale_price: d.sale_price != null ? Number(d.sale_price) : null,
        original_price: d.original_price != null ? Number(d.original_price) : null,
        tier_prices: d.tier_prices && typeof d.tier_prices === "object" ? d.tier_prices : null,
        applicable_tiers: Array.isArray(d.applicable_tiers) ? d.applicable_tiers : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPackageId]);

  // 方案「單日價格覆寫」：庫存日曆上針對該方案某日直接改的價，優先於 tier 價
  const [packageDateOverrides, setPackageDateOverrides] = useState<PackageDatePriceMap>(new Map());
  const stayDateStrs = useMemo(() => {
    if (!checkInDate || !checkOutDate) return [] as string[];
    const out: string[] = [];
    const cur = new Date(checkInDate);
    while (cur < checkOutDate) {
      out.push(format(cur, "yyyy-MM-dd"));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [checkInDate, checkOutDate]);
  const stayDatesKey = stayDateStrs.join(",");
  useEffect(() => {
    let cancelled = false;
    if (!selectedPackageId || stayDateStrs.length === 0) {
      setPackageDateOverrides(new Map());
      return;
    }
    (async () => {
      const map = await fetchPackageDatePricesForPackage(selectedPackageId, stayDateStrs);
      if (!cancelled) setPackageDateOverrides(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPackageId, stayDatesKey]);

  // 依日期取包區方案「每晚 sale」
  // 優先序：package_date_prices 單日覆寫 → tier_prices（平日／週五日／假日） → sale_price
  const getPackageNightlySale = (d: Date): number | null => {
    if (!selectedPackage) return null;
    const dateStr = format(d, "yyyy-MM-dd");
    if (selectedPackageId) {
      const ov = packageDateOverrides.get(overrideKey(selectedPackageId, dateStr));
      // 只設「單日適用狀態」未填價的列不影響計價
      if (ov && ov.sale_price != null) return ov.sale_price;
    }
    const tier = detectTierByDate(d, isPackageHolidayDate(d));
    const override = selectedPackage.tier_prices?.[tier];
    if (override && override.sale != null) return Number(override.sale);
    return selectedPackage.sale_price;
  };

  // 依日期取包區方案「每晚原價（劃掉價）」：未設定時回退「房價價格設定」（逐晚庫存價），再回退 sale
  const getPackageNightlyOriginal = (d: Date): number | null => {
    if (!selectedPackage) return null;
    const dateStr = format(d, "yyyy-MM-dd");
    if (selectedPackageId) {
      const ov = packageDateOverrides.get(overrideKey(selectedPackageId, dateStr));
      if (ov && ov.sale_price != null) {
        if (ov.original_price != null && ov.original_price > 0) return ov.original_price;
        return ov.sale_price;
      }
    }

    const tier = detectTierByDate(d, isPackageHolidayDate(d));
    const override = selectedPackage.tier_prices?.[tier];
    if (override && override.original != null && Number(override.original) > 0) {
      return Number(override.original);
    }
    if (selectedPackage.original_price != null && selectedPackage.original_price > 0) {
      return selectedPackage.original_price;
    }
    // 回退：房價價格設定（room_inventory_pricing 逐晚價）
    const invPrice = roomPricing[format(d, "yyyy-MM-dd")];
    if (invPrice != null && invPrice > 0) return invPrice;
    return getPackageNightlySale(d);
  };


  // 依每晚 tier 計算包區方案總價
  const calculatePackageTotal = (): number | null => {
    if (!selectedPackage || !checkInDate || !checkOutDate) return null;
    const nights = calculateNights();
    if (nights <= 0) return null;
    let total = 0;
    let hasAny = false;
    for (let i = 0; i < nights; i++) {
      const d = new Date(checkInDate);
      d.setDate(d.getDate() + i);
      const nightly = getPackageNightlySale(d);
      if (nightly == null) return null; // 無法計價 → 交由 room_inventory 邏輯
      total += nightly;
      hasAny = true;
    }
    return hasAny ? total : null;
  };

  // 折扣碼計算基準：包區方案「原價（劃掉用）」總額
  const calculatePackageOriginalTotal = (): number | null => {
    if (!selectedPackage || !checkInDate || !checkOutDate) return null;
    const nights = calculateNights();
    if (nights <= 0) return null;
    let total = 0;
    for (let i = 0; i < nights; i++) {
      const d = new Date(checkInDate);
      d.setDate(d.getDate() + i);
      const nightly = getPackageNightlyOriginal(d);
      if (nightly == null) return null;
      total += nightly;
    }
    return total;
  };


  const lastRoomSyncSearchRef = useRef<string | null>(null);
  useEffect(() => {
    const search = searchParams.toString();
    const roomId = searchParams.get("roomId");
    const step = searchParams.get("step");
    const ciParam = searchParams.get("checkIn");
    const coParam = searchParams.get("checkOut");
    const hasNewSearch = lastRoomSyncSearchRef.current !== search;

    // roomId 同樣以 URL 為準：重新從詳情頁選方案時要覆蓋掉舊房型
    if (roomId && roomTypes.length > 0 && selectedRoom?.id !== roomId) {
      lastRoomSyncSearchRef.current = search;
      const room = roomTypes.find((r) => r.id === roomId);
      if (room) {
        setSelectedRoom(room);
        // 明確指定 step 優先；否則若已帶入 roomId + 日期，直接進入單頁結帳
        if (step && ["dates", "room", "addons", "guest", "payment", "confirm"].includes(step)) {
          setCurrentStep(step as BookingStep);
        } else if (ciParam && coParam) {
          setCurrentStep("payment");
        } else {
          setCurrentStep("dates");
        }
      }
      return;
    }

    // 新的方案連結未帶 roomId 時，清掉上一筆殘留的房型選擇
    if (hasNewSearch) {
      lastRoomSyncSearchRef.current = search;
      if (!roomId && searchParams.get("packageId") && selectedRoom) {
        setSelectedRoom(null);
        setCurrentStep("room");
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

        // Paginated fetch — Supabase caps rows at 1000 by default, which
        // would silently truncate results for many room_types × ~180 days
        // and make later dates falsely look unavailable in the calendar.
        type InvRow = {
          date: string;
          room_type_id: string;
          is_available: boolean | null;
          available_rooms: number | null;
          price: number | null;
        };
        const PAGE = 1000;
        let allInventoryRows: InvRow[] = [];
        let fromIdx = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: pageRows, error: pageErr } = await supabase
            .from('room_inventory_pricing')
            .select('date, room_type_id, is_available, available_rooms, price')
            .in('room_type_id', roomTypeIds)
            .gte('date', todayStr)
            .lte('date', endStr)
            .range(fromIdx, fromIdx + PAGE - 1);
          if (pageErr) throw pageErr;
          if (pageRows && pageRows.length > 0) {
            allInventoryRows = allInventoryRows.concat(pageRows as InvRow[]);
            fromIdx += PAGE;
            hasMore = pageRows.length === PAGE;
          } else {
            hasMore = false;
          }
        }

        const adjustedResults = await Promise.all(
          roomTypeIds.map(async (roomTypeId) => {
            const { data, error } = await supabase.rpc('get_adjusted_room_inventory_batch', {
              p_room_type_id: roomTypeId,
              p_dates: dateRange,
              p_accommodation_id: accommodationId,
            });
            if (error) throw error;
            return { roomTypeId, rows: data || [] };
          })
        );

        const inventoryIndex = new Map<string, InvRow>();
        allInventoryRows.forEach((row) => {
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
            const selectedPrice = inventoryRow?.price;

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

  // 當日期或房型變化時，預先獲取價格和檢查可用性（批次版：一次查整段日期區間）
  useEffect(() => {
    const fetchRoomPricingAndAvailability = async () => {
      if (!selectedRoom || !checkInDate || !checkOutDate || !accommodationId) {
        setRoomPricing({});
        return;
      }

      const nights = calculateNights();
      if (nights === 0) return;

      const start = new Date(checkInDateStr);
      const dateRange: string[] = [];
      for (let i = 0; i < nights; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        dateRange.push(currentDate.toISOString().split('T')[0]);
      }
      const rangeStartStr = dateRange[0];
      const rangeEndStr = dateRange[dateRange.length - 1];

      const pricing: Record<string, number> = {};
      let hasBlocked = false;
      let blockedByName = '';
      let hasMissingPricing = false;
      let hasNoAvailability = false;
      // 多間預訂用：整段期間「每晚可訂間數」的最小值
      let minAvailable = Number.POSITIVE_INFINITY;

      const missingDates: string[] = [];
      const unavailableDates: string[] = [];

      try {
        const priceCol = getPriceColumn();

        // 批次一：整段日期區間的 room_inventory_pricing
        const { data: pricingRows, error: pricingErr } = await supabase
          .from('room_inventory_pricing')
          .select('date, price, price_2_meals, price_3_meals, available_rooms, is_available')
          .eq('room_type_id', selectedRoom.id)
          .gte('date', rangeStartStr)
          .lte('date', rangeEndStr);
        if (pricingErr) throw pricingErr;

        const pricingByDate = new Map<string, any>();
        (pricingRows || []).forEach((r: any) => pricingByDate.set(r.date, r));

        // 批次二：一次拿整段日期的調整後庫存 / 互斥狀態
        const { data: adjustedRows, error: adjustedErr } = await supabase.rpc(
          'get_adjusted_room_inventory_batch',
          {
            p_room_type_id: selectedRoom.id,
            p_dates: dateRange,
            p_accommodation_id: accommodationId,
          },
        );
        if (adjustedErr) throw adjustedErr;

        const adjustedByDate = new Map<string, any>();
        (adjustedRows || []).forEach((row: any) => {
          const dateKey = typeof row.date_value === 'string'
            ? row.date_value
            : new Date(row.date_value).toISOString().split('T')[0];
          adjustedByDate.set(dateKey, row);
        });

        for (const dateStr of dateRange) {
          const priceData = pricingByDate.get(dateStr);
          const selectedPrice = priceCol === 'price_3_meals'
            ? priceData?.price_3_meals
            : priceCol === 'price_2_meals'
              ? priceData?.price_2_meals
              : priceData?.price;

          if (!priceData || selectedPrice === null || selectedPrice === undefined) {
            hasMissingPricing = true;
            missingDates.push(dateStr);
            pricing[dateStr] = 0;
          } else {
            pricing[dateStr] = selectedPrice;

            const isClosed = priceData.is_available === false;
            if (isClosed) {
              hasNoAvailability = true;
              if (!unavailableDates.includes(dateStr)) unavailableDates.push(dateStr);
            }
            if (!isClosed && priceData.available_rooms !== null && priceData.available_rooms <= 0) {
              hasNoAvailability = true;
              if (!unavailableDates.includes(dateStr)) unavailableDates.push(dateStr);
            }
          }

          const adjusted = adjustedByDate.get(dateStr);
          if (adjusted?.is_blocked) {
            hasBlocked = true;
            blockedByName = adjusted.blocked_by_room_name || blockedByName;
          }
          const adjustedAvailable = adjusted?.available_rooms;
          if (adjustedAvailable !== null && adjustedAvailable !== undefined) {
            minAvailable = Math.min(
              minAvailable,
              adjusted?.is_blocked ? 0 : Number(adjustedAvailable),
            );
          }
          if (
            adjustedAvailable !== null &&
            adjustedAvailable !== undefined &&
            adjustedAvailable <= 0 &&
            !unavailableDates.includes(dateStr)
          ) {
            hasNoAvailability = true;
            unavailableDates.push(dateStr);
          }

        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching price/availability (batch):', error);
        }
        hasMissingPricing = true;
        for (const dateStr of dateRange) {
          if (!missingDates.includes(dateStr)) missingDates.push(dateStr);
          pricing[dateStr] = 0;
        }
      }

      setRoomPricing(pricing);

      setRoomAvailability(prev => ({
        ...prev,
        [selectedRoom.id]: {
          isBlocked: hasBlocked,
          blockedByRoomName: blockedByName,
          hasMissingPricing,
          missingDates,
          hasNoAvailability,
          unavailableDates,
          minAvailable: Number.isFinite(minAvailable) ? minAvailable : null,
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
    if (!tappayConfig || currentStep !== 'payment' || !needsCardForm) {
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
  }, [currentStep, needsCardForm, tappayConfig]);

  // 第二步：當 DOM 元素準備好後設定 TapPay 表單
  useEffect(() => {
    if (!isTapPayReady || currentStep !== 'payment' || !needsCardForm) {
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
        // 註：欄位由 TapPay iframe 注入（PCI 規範），卡號自動每 4 碼分隔、
        // 到期日自動 MM / YY 格式化由 SDK 內部處理；外部 JS 無法也不該改寫
        // iframe 內容，因此格式化完全不影響後端 prime 的有效性驗證。
        window.TPDirect.card.setup({
          fields: {
            number: {
              element: '#card-number',
              placeholder: '1234 5678 9012 3456'
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
              'color': 'rgb(0, 0, 0)',
              'letter-spacing': '0.5px'
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
          // TapPay status: 0=valid, 1=invalid, 2=incomplete, 3=empty
          const fieldLabel = (s: number, name: string) => {
            if (s === 1) return `${name}格式錯誤`;
            if (s === 2) return `${name}尚未填寫完整`;
            if (s === 3) return `請輸入${name}`;
            return null;
          };
          const errs = [
            fieldLabel(update.status.number, "卡號"),
            fieldLabel(update.status.expiry, "有效期限"),
            fieldLabel(update.status.ccv, "安全碼"),
          ].filter(Boolean) as string[];
          const nextError = update.canGetPrime ? null : (errs[0] ?? null);
          // 即時驗證：合法時立即清除錯誤；錯誤訊息以 400ms 去抖更新，避免邊輸入邊跳訊息
          if (cardErrorDebounceRef.current) {
            window.clearTimeout(cardErrorDebounceRef.current);
            cardErrorDebounceRef.current = null;
          }
          if (nextError === null) {
            setCardFieldError(null);
          } else {
            cardErrorDebounceRef.current = window.setTimeout(() => {
              setCardFieldError(nextError);
            }, 400);
          }
          // 卡片內容一變動，就視為需要重新取得 prime
          setTappayPrime(null);
          setTappayPrimeIssuedAt(null);
        });
      } catch (error) {
        console.error('TapPay card setup error:', error);
      }
    }, 100); // 延遲 100ms 確保 DOM 準備完成

    return () => clearTimeout(timer);
  }, [isTapPayReady, currentStep, needsCardForm]);

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

  /**
   * 多間預訂間數：
   * 僅「非包棟 且 房間數 > 1」的散房房型才支援（一棟多人數方案的民宿不適用）。
   * 其餘一律視為 1 間。
   */
  const roomQuantity = useMemo(() => {
    const units = selectedRoom?.room_count ?? 1;
    const multiUnitAllowed = !!selectedRoom && selectedRoom.is_exclusive_package !== true && units > 1;
    if (!multiUnitAllowed) return 1;
    const n = parseInt(searchParams.get("rooms") || "1", 10) || 1;
    return Math.max(1, Math.min(n, units));
  }, [selectedRoom, searchParams]);
  const isMultiRoom = roomQuantity > 1;

  const calculateTotal = () => {
    if (!selectedRoom || !checkInDate || !checkOutDate) return 0;

    // 若為包區方案，優先以方案的每晚 sale（週末 tier_prices.weekend.sale，其餘 sale_price）計算
    const packageTotal = calculatePackageTotal();
    if (packageTotal != null) return packageTotal * roomQuantity;

    // 若 URL 帶了 packageId 但方案尚未載入完成，回傳 0 阻擋送出，避免誤用房型原價
    if (selectedPackageId) return 0;

    // 使用預先獲取的價格（room_inventory_pricing 逐晚 price）× 間數
    return Object.values(roomPricing).reduce((sum, price) => sum + price, 0) * roomQuantity;
  };

  // 折扣基準：有包區方案時以「原價（劃掉用）」計算；否則以實際房費計算
  const getDiscountBase = () => {
    const originalTotal = calculatePackageOriginalTotal();
    if (originalTotal != null && originalTotal > 0) return originalTotal * roomQuantity;
    return calculateTotal();
  };


  /**
   * 套用折扣碼時，房費以「原價」計價（折扣碼與人客多優惠不疊加）：
   * 最終 = 原價 - 折扣。未套用折扣碼時維持售價。
   */
  const getRoomChargeTotal = () => {
    const sale = calculateTotal();
    if (!appliedDiscount) return sale;
    return Math.max(sale, getDiscountBase());
  };

  const calculateDiscount = () => {
    if (!appliedDiscount) return 0;
    const cap = getRoomChargeTotal();
    if (appliedDiscount.type === "percentage") {
      const raw = Math.round(getDiscountBase() * (appliedDiscount.value / 100));
      return Math.min(raw, cap); // 折扣不得超過房費
    }
    return Math.min(appliedDiscount.value, cap);
  };



  const getChildSelection = (): ChildSelection => ({
    infants: infantsCount,
    toddlers: toddlersCount,
    children: contextGuests?.children || 0,
  });

  const evaluateChildren = () =>
    evaluateChildSelection(
      childRules,
      getChildSelection(),
      calculateNights(),
      contextGuests?.adults || 2,
    );


  const calculateChildExtraTotal = () => evaluateChildren().extraFeeTotal;

  /** 行程購物車帶入的加購列（僅在購物車結帳且館別相符時生效，不影響既有 /booking 行為） */
  const tripCheckoutLines = useMemo(() => {
    const staged = readTripCheckout();
    if (!staged || !accommodationId || staged.accommodationId !== accommodationId) return [];
    return staged.lines || [];
  }, [accommodationId]);
  const tripCheckoutTripId = useMemo(() => {
    const staged = readTripCheckout();
    if (!staged || !accommodationId || staged.accommodationId !== accommodationId) return null;
    return staged.tripId;
  }, [accommodationId]);
  const tripAddonTotal = tripCheckoutLines.reduce((sum, l) => sum + (Number(l.total) || 0), 0);

  /** 組出送往既有金流／訂單的 custom_addon_details（既有加購 + 行程加購） */
  const buildCustomAddonLines = () => {
    const nights = calculateNights();
    const existing = Object.entries(customAddonCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => {
        const setting = customAddonSettings.find(s => s.addon_type === type);
        return {
          addon_id: setting?.id,
          addon_type: type,
          count,
          price_per_unit: setting?.price_per_unit || 0,
          pricing_mode: setting?.pricing_mode || 'per_night',
          total: count * (setting?.price_per_unit || 0) * addonNightsMultiplier(setting?.pricing_mode, nights),
          unit_label: setting?.unit_label || '',
        };
      });
    return [...existing, ...tripCheckoutLines];
  };

  const calculateAddonsTotal = () => {
    const nights = calculateNights();
    const bbqTotal = Object.values(bbqMealsByDate).reduce((sum, count) => sum + (count * mealPlanSettings.pricePerUnit), 0);
    const customTotal = Object.entries(customAddonCounts).reduce((sum, [type, count]) => {
      const setting = customAddonSettings.find(s => s.addon_type === type);
      return sum + (count * (setting?.price_per_unit || 0) * addonNightsMultiplier(setting?.pricing_mode, nights));
    }, 0);
    return (petCount * petPlanSettings.pricePerUnit * nights) + bbqTotal + customTotal + tripAddonTotal + calculateChildExtraTotal();
  };

  const calculateFinalTotal = () => {
    return Math.max(0, getRoomChargeTotal() + calculateAddonsTotal() - calculateDiscount());
  };


  // 訂金功能已移除：所有訂單一律以扣除折扣後的全額計算
  const calculateDeposit = () => 0;

  /** ATM 匯款訂金拆分：線上僅收訂金（預設 30%），尾款現場付清 */
  const getAtmDepositBreakdown = () => getDepositBreakdown(calculateFinalTotal(), bookingSettings);


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
        // 若已預先選定房型（如 URL 帶 roomId），僅檢查該房型；否則檢查所有房型
        const roomsToCheck = selectedRoom ? [selectedRoom] : roomTypes;
        const hasAvailable = roomsToCheck.some(room => {
          const avail = roomAvailability[room.id];
          if (!avail) return false;
          return !avail.isBlocked && !avail.hasMissingPricing && !avail.hasNoAvailability;
        });
        if (!hasAvailable) {
          toast({
            title: selectedRoom ? "所選房型於此日期無空房" : "所選日期無可預訂房型",
            description: selectedRoom
              ? `「${selectedRoom.name}」於 ${checkInDateStr} ~ ${checkOutDateStr} 已無庫存，請改選其他日期或房型。`
              : "您選擇的日期目前沒有可預訂的房型，請嘗試其他日期。",
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

      // 多間預訂：確認整段期間每晚都還有足夠間數（防超賣）
      if (
        isMultiRoom &&
        typeof availability?.minAvailable === "number" &&
        availability.minAvailable < roomQuantity
      ) {
        toast({
          title: "可訂間數不足",
          description: `您選擇 ${roomQuantity} 間，但所選日期最少僅剩 ${availability.minAvailable} 間，請調整間數或日期`,
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

    if (currentStep === "payment") {
      // 會員登入為選填：非會員可以繼續，但若剛註冊過但尚未驗證僅提示
      // （不再硬性阻擋）
      // 驗證客人資訊
      try {
        guestInfoSchema.parse(guestInfo);
        setErrors({});
      } catch (error) {
        if (error instanceof z.ZodError) {
          const fieldLabels: Record<string, string> = {
            name: "姓名",
            phone: "手機號碼",
            email: "電子郵件",
            address: "地址",
            notes: "備註",
          };
          const newErrors: Record<string, string> = {};
          const messages: string[] = [];
          error.errors.forEach((err) => {
            const key = err.path[0]?.toString();
            if (key && !newErrors[key]) {
              newErrors[key] = err.message;
              messages.push(`${fieldLabels[key] ?? key}：${err.message}`);
            }
          });
          setErrors(newErrors);
          toast({
            title: "請完成必填欄位",
            description: messages.join("；"),
            variant: "destructive",
          });
          const firstKey = Object.keys(newErrors)[0];
          if (firstKey) {
            setTimeout(() => {
              const el = document.getElementById(firstKey);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              (el as HTMLInputElement | null)?.focus?.();
            }, 50);
          }
          return;
        }
      }
    }

    if (currentStep === "payment" && !orderPaymentType) {
      toast({
        title: "請選擇付款方式",
        description: "請選擇訂單付款方式",
        variant: "destructive",
      });
      return;
    }


    // 如果選擇信用卡，驗證 TapPay 卡片狀態 + 先取得 prime（避免 confirm 步驟欄位卸載）
    if (currentStep === "payment" && needsCardForm) {
      const isDepositCardOnly = orderPaymentType === "atm" && depositPaymentType === "card";
      // 標記已嘗試送出，之後欄位下方才會顯示錯誤
      setCardSubmitAttempted(true);

      if (!isTapPayReady) {
        const msg = "付款模組載入中，請稍候";
        if (isDepositCardOnly) setCardFieldError(msg);
        toast({
          title: "付款模組載入中",
          description: "請稍候付款模組載入完成",
          variant: "destructive",
        });
        return;
      }

      if (!cardValid) {
        const msg = cardFieldError ?? "請確認卡號、有效期限和安全碼都已正確填寫";
        if (isDepositCardOnly) setCardFieldError(msg);
        toast({
          title: "請輸入完整的信用卡資訊",
          description: msg,
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

      // 通過欄位驗證，清除欄位錯誤（tokenization 結果會再覆寫）
      setCardFieldError(null);

      // 押金線上綁卡：每次「下一步」都先完成 tokenization 取得新 prime
      // 訂單也是信用卡：若 prime 已過期或尚未取得才重取
      const mustRefreshPrime = isDepositCardOnly || !tappayPrime || isPrimeExpired();
      if (mustRefreshPrime) {
        setIsPreparingPrime(true);
        try {
          const prime = await getTapPayPrime();
          setTappayPrime(prime);
          setTappayPrimeIssuedAt(Date.now());
          console.log('[TapPay][Booking] Prime prepared for confirm step');
        } catch (err: any) {
          const rawMsg = err?.message || '';
          // 將常見 TapPay 錯誤對應到友善訊息
          let friendly = rawMsg || '取得付款授權失敗，請重新輸入信用卡資訊後再試';
          if (/SDK/i.test(rawMsg)) {
            friendly = '付款模組尚未載入完成，請重新整理頁面後再試';
          } else if (/逾時|timeout/i.test(rawMsg)) {
            friendly = '取得付款授權逾時，請檢查網路連線後重試';
          } else if (/卡號|card.*number/i.test(rawMsg)) {
            friendly = '卡號格式錯誤，請重新輸入卡號';
          } else if (/有效期|expir/i.test(rawMsg)) {
            friendly = '有效期限錯誤，請重新輸入有效期限';
          } else if (/CCV|CVC|安全碼/i.test(rawMsg)) {
            friendly = '安全碼錯誤，請重新輸入卡片背面安全碼';
          }
          if (isDepositCardOnly) setCardFieldError(friendly);
          toast({
            title: "無法取得付款授權",
            description: friendly,
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

    // 單頁結帳：dates → room → checkout(payment) → confirm
    const steps: BookingStep[] = ["dates", "room", "payment", "confirm"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  /** 回到民宿訂房頁（保留日期／人數等條件） */
  const goBackToVilla = () => {
    if (!accommodationId) {
      navigate(-1);
      return;
    }
    // 回訂房頁時保留住宿型態（包棟 / 單間房），避免從散房方案返回卻跳回包棟列表
    const stayParam =
      searchParams.get("stay") ??
      (selectedRoom ? (selectedRoom.is_exclusive_package === true ? "package" : "common") : null);
    navigate(
      bookingPath({
        accommodationId,
        params: {
          checkIn: searchParams.get("checkIn"),
          checkOut: searchParams.get("checkOut"),
          adults: searchParams.get("adults"),
          children: searchParams.get("children"),
          rooms: searchParams.get("rooms"),
          stay: stayParam,
        },
      }),
    );
  };

  const handlePrevStep = () => {
    // 結帳頁的「上一步」直接回民宿訂房頁
    if (currentStep === "payment" || currentStep === "dates" || currentStep === "room") {
      goBackToVilla();
      return;
    }
    if (currentStep === "confirm") {
      setCurrentStep("payment");
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

    // 人數上限驗證（避免提交後才被資料庫 trigger 擋下）
    const roomCapacity = (selectedRoom as any)?.capacity ?? (selectedRoom as any)?.max_guests ?? 0;
    if (roomCapacity && totalGuests > roomCapacity) {
      toast({
        title: "入住人數超過房型上限",
        description: `本房型最多可入住 ${roomCapacity} 人，您目前選擇 ${totalGuests} 人，請調整人數或改選其他房型`,
        variant: "destructive",
      });
      return;
    }

    // 兒童分齡：阻擋不接受的年齡層或超過上限的選擇
    const childSelection = getChildSelection();
    const childEval = evaluateChildSelection(
      childRules,
      childSelection,
      calculateNights(),
      contextGuests?.adults || 2,
    );
    if (childEval.blocked) {
      toast({
        title: "入住條件不符",
        description:
          childEval.blockReason ||
          "兒童人數超過上限或本民宿不接受該年齡層，請回上一步調整人數。",
        variant: "destructive",
      });
      return;
    }


    if (isSubmitting) {
      return; // 防止重複提交
    }

    setIsSubmitting(true);


    try {
      const roomTotal = getRoomChargeTotal();
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
              packageId: selectedPackageId,
              roomQuantity,
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
                    addon_id: setting?.id,
                    addon_type: type,
                    count,
                    price_per_unit: setting?.price_per_unit || 0,
                    pricing_mode: setting?.pricing_mode || 'per_night',
                    total: count * (setting?.price_per_unit || 0) * addonNightsMultiplier(setting?.pricing_mode, nights),
                  };
                }),
              childSelection,
              childExtraTotal: childEval.extraFeeTotal,
              guestEmail: guestInfo.email || null,
            },
          }
        );

        if (validationError) {
          console.error("Price validation error:", validationError);
          // 下單限流（429）：顯示後端提供的說明
          let rateLimitMessage: string | null = null;
          try {
            const ctx = (validationError as any)?.context;
            if (ctx?.status === 429) {
              const parsed = JSON.parse(await ctx.text());
              rateLimitMessage = parsed?.errors?.[0] || "請稍後再試。";
            }
          } catch { /* ignore */ }

          toast({
            title: rateLimitMessage ? "訂單暫時無法送出" : "價格驗證失敗",
            description: rateLimitMessage || "無法驗證訂單價格，請重新整理頁面後再試",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        if (!validationResult?.isValid) {
          console.error("Price validation failed:", validationResult?.errors);
          toast({
            title: validationResult?.rateLimited ? "訂單暫時無法送出" : "價格驗證失敗",
            description: validationResult?.rateLimited
              ? (validationResult?.errors?.[0] || "請稍後再試。")
              : "訂單價格與系統計算不符，請重新整理頁面後再試",
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
          console.log('Binding credit card (no charge until check-in)...');

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

          // Idempotency key：每次提交產生一次
          const idempotencyKey =
            (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

          // 信用卡流程：結帳當下「只綁卡不扣款」，入住當天由排程自動扣款
          const { data: opResult, error: opError } = await supabase.functions.invoke(
            'create-card-bound-order',
            {
              body: {
                idempotencyKey,
                prime,
                cardholder: {
                  phoneNumber: guestInfo.phone,
                  name: guestInfo.name,
                  email: guestInfo.email || '',
                },
                accommodationId,
                selectedRoom: { id: selectedRoom.id, name: selectedRoom.name },
                checkInDate: checkInDateStr,
                checkOutDate: checkOutDateStr,
                guestInfo,
                mealPlan: selectedMealPlan,
                mealPlanDetails: mealPlanDetailsData,
                mealPlanTotal: mealPlanTotalPrice,
                packageId: selectedPackageId,
                roomQuantity,
                petCount,
                petPlanPrice,
                finalPrice,
                totalPrice,
                discountCode: appliedDiscount?.code || null,
                discountAmount,
                totalGuests,
                customerId,
                memberId: effectiveMemberId,
                customAddonDetails: Object.entries(customAddonCounts).filter(([_, c]) => c > 0).length > 0
                  ? Object.entries(customAddonCounts).filter(([_, c]) => c > 0).map(([type, count]) => {
                      const setting = customAddonSettings.find(s => s.addon_type === type);
                      return {
                        addon_id: setting?.id,
                        addon_type: type,
                        count,
                        price_per_unit: setting?.price_per_unit || 0,
                        pricing_mode: setting?.pricing_mode || 'per_night',
                        total: count * (setting?.price_per_unit || 0) * addonNightsMultiplier(setting?.pricing_mode, calculateNights()),
                        unit_label: setting?.unit_label || '',
                      };
                    })
                  : null,
                nights,
              },
            }
          );

          if (opError || !opResult?.success) {
            console.error('Card binding / order creation failed:', opError, opResult);
            const errorInfo = {
              type: 'card' as const,
              message: opResult?.message || opError?.message || '信用卡綁定失敗',
              suggestion: opResult?.suggestion || '請確認卡片資訊是否正確，或更換其他卡片',
              errorCode: opResult?.errorCode,
              technicalMessage: opResult?.technicalMessage,
            };
            reportFrontendError({
              category: "booking_flow",
              step: "create_card_bound_order",
              errorMessage: errorInfo.message,
              accommodationId,
              idempotencyKey,
              context: { finalPrice, paymentMethod },
            });
            setLastPaymentError(errorInfo);
            setPaymentFailed(true);
            setShowRetryDialog(true);
            setIsProcessingPayment(false);
            setIsSubmitting(false);
            return;
          }

          paidOrderResult = opResult.order;
          console.log('Card-bound order created:', paidOrderResult?.order_number);

          toast({
            title: "信用卡綁定成功",
            description: `訂房已成立，現在不會扣款；系統將於入住當天 ${checkInDateStr} 自動扣款 NT$ ${finalPrice.toLocaleString()}`,
          });

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
        if (orderPaymentType === "atm") {
          const dep = getAtmDepositBreakdown();
          orderNotes = `[訂金制] ATM 線上匯款訂金 NT$ ${dep.deposit.toLocaleString()}（總額 NT$ ${calculateFinalTotal().toLocaleString()} 的 ${dep.percentage}%），尾款 NT$ ${dep.balance.toLocaleString()} 入住現場付清${orderNotes ? ` ${orderNotes}` : ""}`;
        }
        if (paymentTransactionId) {
          orderNotes = `[TapPay 交易 ID: ${paymentTransactionId}]${orderNotes ? ` ${orderNotes}` : ''}`;
        }

        const { data: insertedOrder, error: orderError } = await supabase
          .from("orders")
          .insert([{
            accommodation_id: accommodationId,
            room_type_id: selectedRoom.id,
             customer_id: customerId,
             member_id: effectiveMemberId,
             order_number: "", // 由資料庫 trigger 自動生成
            guest_name: guestInfo.name,
            guest_phone: guestInfo.phone,
            guest_email: guestInfo.email || null,
            guest_address: guestInfo.address || null,
            check_in_date: checkInDateStr,
            check_out_date: checkOutDateStr,
            guest_count: totalGuests,
            meal_plan: selectedMealPlan,
            package_id: selectedPackageId,
            total_price: totalPrice,
            discount_code: appliedDiscount ? appliedDiscount.code : null,
            discount_amount: discountAmount,
            final_price: finalPrice,
            deposit_amount: 0,
            deposit_required_amount: depositPaymentType ? DEPOSIT_AMOUNT : 0,
            deposit_method: depositPaymentType || null,
            deposit_status: depositPaymentType ? "pending" : "not_required",
            deposit_payment_method: orderPaymentType === "credit_card" ? "credit_card" : (orderPaymentType === "atm" ? "bank_transfer" : null),
            balance_payment_method: null,
            payment_method: orderPaymentType === "credit_card" ? "信用卡" : (orderPaymentType === "atm" ? "ATM 虛擬帳號" : null),
            payment_status: paymentTransactionId ? "paid" : (orderPaymentType === "atm" ? "pending_payment" : "unpaid"),
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
                    addon_id: setting?.id,
                    addon_type: type,
                    count,
                    price_per_unit: setting?.price_per_unit || 0,
                    pricing_mode: setting?.pricing_mode || 'per_night',
                    total: count * (setting?.price_per_unit || 0) * addonNightsMultiplier(setting?.pricing_mode, calculateNights()),
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

        // 多間預訂：寫入 order_rooms（庫存扣減以 order_rooms.quantity 為準）
        if (isMultiRoom && insertedOrder?.id) {
          const { error: orderRoomsError } = await supabase.from("order_rooms").insert([{
            order_id: insertedOrder.id,
            room_type_id: selectedRoom.id,
            quantity: roomQuantity,
          }]);
          if (orderRoomsError) {
            console.error("寫入多間房資料失敗:", orderRoomsError);
          }
        }
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

      // 發送訂購確認郵件（統一走 notify-booking-confirmation）
      // - 非 3DS 信用卡（paidOrderResult）：create-paid-order 已寄信，跳過避免重複
      // - ATM 待匯款：建單當下即寄「訂房確認（待匯款）」，入帳後的收據信由 tappay-notify 另寄，不重複
      // - 其餘（信用卡已扣款、現場付款等未付款訂單）：按下「確認訂房」後即刻寄出
      let emailSent = false;
      const shouldSendEmailNow = !paidOrderResult && !!guestInfo.email;

      if (shouldSendEmailNow && orderData?.id) {
        try {
          const paymentMethodLabel =
            orderPaymentType === "credit_card"
              ? "信用卡"
              : orderPaymentType === "atm"
                ? "ATM 虛擬帳號（待匯款）"
                : (paymentMethod || (paymentTransactionId ? "線上付款" : "現場付款"));


          const { data: emailData, error: emailError } = await supabase.functions.invoke(
            "notify-booking-confirmation",
            {
              body: {
                orderId: orderData.id,
                paymentMethodLabel,
              },
            }
          );
          emailSent = !emailError && !!emailData?.success;
        } catch (emailError) {
          console.error("發送確認郵件時發生錯誤:", emailError);
          emailSent = false;
        }
      } else if (paidOrderResult) {
        // 由 create-paid-order 寄送，視為已寄出
        emailSent = !!guestInfo.email;
      }

      // ATM 虛擬帳號：建單成功後跳轉到專屬 ATM 匯款資訊頁
      if (orderPaymentType === "atm" && orderData?.order_number) {
        const params = new URLSearchParams({
          order_number: orderData.order_number,
          acc: accommodationId,
        });
        const baseUrl = await getPaymentOriginForAccommodation(accommodationId);
        window.location.href = `${baseUrl}/booking/atm-info?${params.toString()}`;
        return;
      }

      // 設置成功狀態，顯示成功頁面
      setSuccessOrderData({
        ...orderData,
        roomName: selectedRoom.name,
        emailSent,
        nights: calculateNights(),
      });
      setBookingSuccess(true);
    } catch (error: any) {
      console.error("Error creating order:", error);
      // 兼容 PostgrestError / Error / 任意物件，盡可能顯示具體原因
      let description = "發生錯誤，請稍後再試或聯絡我們";
      const raw = error?.message || error?.error_description || error?.hint || error?.details;
      if (raw && typeof raw === "string") {
        const lower = raw.toLowerCase();
        if (lower.includes("exceeds room capacity")) {
          const m = raw.match(/\((\d+)\).*\((\d+)\)/);
          description = m
            ? `入住人數 ${m[1]} 人超過房型上限（最多 ${m[2]} 人），請調整人數或選擇其他房型`
            : raw;
        } else if (lower.includes("v_pkg") || lower.includes("is not assigned yet")) {
          // 後端方案資料未帶入時的保底提示（避免顯示資料庫內部訊息）
          description = "請先選擇入住方案後再送出訂單";
        } else {
          description = raw;
        }
      }
      toast({
        title: "訂房失敗",
        description,
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
  
  const stepIndicators = [
    { key: "payment", label: "結帳", icon: CreditCard },
    { key: "confirm", label: "確認訂單", icon: CheckCircle },
  ];

  const currentStepIndex = stepIndicators.findIndex((s) => s.key === currentStep);

  const addonsSection = currentStep === "payment" ? (
                  <Collapsible open={isAddonsExpanded} onOpenChange={setIsAddonsExpanded}>
                    <Card className="w-full min-w-0 rounded-xl border-2 border-border bg-card shadow-sm overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="text-sm font-bold text-foreground leading-snug truncate">加購項目（選填）</span>
                          </div>
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              isAddonsExpanded && "rotate-90",
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="w-full min-w-0 px-3 sm:px-4 pb-4 pt-3 space-y-4 border-t border-border bg-muted/20">


                  <div className="w-full min-w-0 space-y-6">


                    {/* 寵物方案 */}
                    {petPlanSettings.enabled && (
                    <Card className="border-2">
                      <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm sm:text-base font-bold leading-snug">
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
                          每隻 NT$ {petPlanSettings.pricePerUnit.toLocaleString()}／晚・最多 {petPlanSettings.maxQuantity} 隻
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
                            <ShoppingBag className="mr-2 h-5 w-5 shrink-0" />
                            <span className="truncate">加購此方案</span>
                          </Button>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3 sm:p-4 gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm sm:text-base">數量</p>
                                <p className="text-xs sm:text-sm text-muted-foreground break-words">
                                  {petCount} 隻 × NT$ {petPlanSettings.pricePerUnit.toLocaleString()} × {calculateNights()} 晚
                                </p>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                <Button
                                  onClick={() => setPetCount(Math.max(0, petCount - 1))}
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg"
                                >
                                  -
                                </Button>
                                <span className="w-8 text-center text-lg font-bold">{petCount}</span>
                                <Button
                                  onClick={() => setPetCount(Math.min(petPlanSettings.maxQuantity, petCount + 1))}
                                  disabled={petCount >= petPlanSettings.maxQuantity}
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
                          <CardTitle className="text-sm sm:text-base font-bold leading-snug">
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
                          每人 NT$ {mealPlanSettings.pricePerUnit.toLocaleString()}／日・平日 {mealPlanSettings.weekdayMinQuantity} 人起・假日 {mealPlanSettings.weekendMinQuantity} 人起・最多 {mealPlanSettings.maxQuantity} 人
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
                      const AddonIcon = resolveAddonIcon(addon.icon_key, addon.addon_type);
                      return (
                        <Card key={addon.addon_type} className="border-2">
                          <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm sm:text-base font-bold leading-snug break-words">
                                <span className="inline-flex items-center gap-1.5">
                                  {addon.show_icon !== false && <AddonIcon className="h-4 w-4 shrink-0 text-primary" />}
                                  {cleanAddonName(addon.addon_type)}
                                </span>
                              </CardTitle>
                              {addon.detailed_description && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 text-xs"
                                  onClick={() => {
                                    setCustomAddonDetail({
                                      title: cleanAddonName(addon.addon_type),
                                      subtitle: addonPriceLine(addon.price_per_unit, addon.unit_label, addon.max_quantity, addon.pricing_mode),
                                      html: addon.detailed_description || '',
                                    });
                                  }}
                                >
                                  詳細內容
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {addonPriceLine(addon.price_per_unit, addon.unit_label, addon.max_quantity, addon.pricing_mode)}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-4 px-3 sm:px-6">
                            {count === 0 ? (
                              <Button
                                onClick={() => setCustomAddonCounts(prev => ({ ...prev, [addon.addon_type]: addonStepUp(0, addon.min_quantity, addon.max_quantity) }))}
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
                                      {count} {shortUnit(addon.unit_label)} × NT$ {addon.price_per_unit.toLocaleString()}{addon.pricing_mode === 'per_stay' ? '（單次）' : ` × ${nights} 晚`}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                    <Button
                                      onClick={() => {
                                        const newCount = addonStepDown(count, addon.min_quantity);
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
                                      disabled={addon.is_locked}
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg"
                                    >
                                      -
                                    </Button>
                                    <span className="w-8 text-center text-lg font-bold">{count}</span>
                                    <Button
                                      onClick={() => setCustomAddonCounts(prev => ({ ...prev, [addon.addon_type]: addonStepUp(count, addon.min_quantity, addon.max_quantity) }))}
                                      disabled={count >= addon.max_quantity}
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg"
                                    >
                                      +
                                    </Button>
                                  </div>
                                </div>
                                {addon.is_locked && (
                                  <p className="text-xs text-muted-foreground -mt-2">
                                    此為必要加購項目，已自動帶入訂單，無法取消或減少數量。
                                  </p>
                                )}
                                <div className="bg-primary/10 border border-primary/20 p-3 sm:p-4 rounded-lg text-center">
                                  <p className="font-bold text-sm sm:text-base">
                                    小計：NT$ {(count * addon.price_per_unit * addonNightsMultiplier(addon.pricing_mode, nights)).toLocaleString()}
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
                                    {cleanAddonName(type)} × {count} {shortUnit(setting?.unit_label)}{setting?.pricing_mode === 'per_stay' ? '（單次）' : ` × ${calculateNights()} 晚`}
                                  </span>
                                  <span className="font-semibold shrink-0">NT$ {(count * (setting?.price_per_unit || 0) * addonNightsMultiplier(setting?.pricing_mode, calculateNights())).toLocaleString()}</span>
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
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <p>目前尚未加購任何項目</p>
                      </div>
                    )}
                  </div>
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
  ) : null;

  return (
    <div className={`min-h-screen bg-background ${themeClass}`}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-24 object-contain" />
          </Link>
          <Button variant="ghost" onClick={goBackToVilla} size="sm">
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
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-4 sm:gap-8 items-start">
          {/* Left: Form Content */}
          <div className="w-full min-w-0">

            <MemberSessionBar
              loggedInMember={loggedInMember}
              bookingEmail={guestInfo.email}
              isMismatch={isMemberEmailMismatch}
              onSwitchAccount={handleSwitchAccount}
              showGoToBookerStep={currentStep !== "payment"}
              onGoToBookerStep={() => {
                setCurrentStep("payment");
                setTimeout(() => {
                  document.getElementById("booker-email")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 100);
              }}
            />
            {currentStep !== "confirm" && (() => {
              const nights = calculateNights();
              const addonLines: Array<{ label: string; qty: string; subtotal: number }> = [];
              if (petPlanSettings.enabled && petCount > 0 && nights > 0) {
                addonLines.push({
                  label: "寵物加購",
                  qty: `${petCount} 隻 × ${nights} 晚`,
                  subtotal: petCount * petPlanSettings.pricePerUnit * nights,
                });
              }
              const bbqTotalCount = Object.values(bbqMealsByDate).reduce((s, c) => s + (c || 0), 0);
              if (mealPlanSettings.enabled && bbqTotalCount > 0) {
                addonLines.push({
                  label: "BBQ 餐食",
                  qty: `${bbqTotalCount} 人份`,
                  subtotal: bbqTotalCount * mealPlanSettings.pricePerUnit,
                });
              }
              Object.entries(customAddonCounts).forEach(([type, count]) => {
                if (!count || count <= 0) return;
                const s = customAddonSettings.find((x) => x.addon_type === type);
                if (!s) return;
                addonLines.push({
                  label: cleanAddonName(s.addon_type),
                  qty: s.pricing_mode === 'per_stay' ? `${count} ${shortUnit(s.unit_label)}（單次）` : `${count} ${shortUnit(s.unit_label)} × ${nights} 晚`,
                  subtotal: count * s.price_per_unit * addonNightsMultiplier(s.pricing_mode, nights),
                });
              });
              const childExtra = calculateChildExtraTotal();
              if (childExtra > 0) {
                addonLines.push({
                  label: "兒童加價",
                  qty: `${nights} 晚`,
                  subtotal: childExtra,
                });
              }
              return (
                <MobileOrderSummary
                  accommodationName={accommodationName}
                  checkInDate={checkInDate}
                  checkOutDate={checkOutDate}
                  calculateNights={calculateNights}
                  totalGuests={totalGuests}
                  adultsCount={contextGuests?.adults || 0}
                  childrenCount={contextGuests?.children || 0}
                  infantsCount={infantsCount}
                  toddlersCount={toddlersCount}
                  selectedRoom={selectedRoom}
                  selectedPackage={selectedPackage}
                  roomAllocation={selectedPackage?.room_allocation || null}
                  roomTypes={roomTypes}
                  roomsCount={roomQuantity}
                  roomSubtotal={getRoomChargeTotal()}
                  roomOriginalSubtotal={appliedDiscount ? null : (calculatePackageOriginalTotal() != null ? calculatePackageOriginalTotal()! * roomQuantity : null)}
                  addonLines={addonLines}
                  calculateFinalTotal={calculateFinalTotal}
                  appliedDiscount={appliedDiscount}
                  calculateDiscount={calculateDiscount}
                />
              );
            })()}
            <div className="lg:hidden mb-4">{addonsSection}</div>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl sm:text-2xl">
                  {currentStep === "room" && "選擇房型"}
                  {currentStep === "dates" && "選擇入住日期"}
                  {currentStep === "payment" && "結帳"}
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
                    {/* 顯示載入狀態：以 skeleton card 呈現，避免整段空白或用「沒有房型」樣式冒充 */}
                    {checkInDate && checkOutDate && (isCheckingAvailability || !hasLoadedDateAvailability) && (
                      <div className="space-y-4">
                        {(roomTypes.length > 0 ? roomTypes : [0, 1]).map((_, idx) => (
                          <Card key={`sk-${idx}`} className="overflow-hidden border">
                            <div className="grid md:grid-cols-[3fr_2fr] gap-0 h-full">
                              <Skeleton className="min-h-[240px] sm:min-h-[320px] md:min-h-full w-full rounded-none" />
                              <CardContent className="p-4 sm:p-6 space-y-3">
                                <Skeleton className="h-6 w-2/3" />
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-4 w-3/4" />
                                <div className="pt-4 border-t space-y-2">
                                  <Skeleton className="h-4 w-1/4" />
                                  <Skeleton className="h-6 w-2/5" />
                                </div>
                              </CardContent>
                            </div>
                          </Card>
                        ))}
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span>正在檢查房型可用性...</span>
                        </div>
                      </div>
                    )}
                    {/* 只有在所有庫存查詢都完成後才顯示房型清單／空狀態 */}
                    {(!checkInDate || !checkOutDate || (!isCheckingAvailability && hasLoadedDateAvailability)) && (
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
                            <div className="p-3 relative">
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
                                    // 載入中：不要用「客滿」樣式冒充；改由 overlay 呈現
                                    if (isLoadingRoomDates || !hasLoadedDateAvailability) return false;
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
                            {(isLoadingRoomDates || !hasLoadedDateAvailability) && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm rounded-md z-10">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <span className="text-xs text-muted-foreground">載入可預訂日期中...</span>
                              </div>
                            )}
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
                            <div className="p-3 relative">
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
                                    // 載入中：不要用「客滿」樣式冒充；改由 overlay 呈現
                                    if (isLoadingRoomDates || !hasLoadedDateAvailability) return false;
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
                            {(isLoadingRoomDates || !hasLoadedDateAvailability) && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm rounded-md z-10">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <span className="text-xs text-muted-foreground">載入可預訂日期中...</span>
                              </div>
                            )}
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


                {/* Step 4: Guest Info */}
                {currentStep === "payment" && (
                  <BookerForm
                    loggedInMember={loggedInMember}
                    isMemberEmailMismatch={isMemberEmailMismatch}
                    onSwitchAccount={handleSwitchAccount}
                    guestInfo={guestInfo}
                    setGuestInfo={setGuestInfo}
                    errors={errors}
                    setErrors={setErrors}
                    emailCheckStatus={emailCheckStatus}
                    otpCode={otpCode}
                    setOtpCode={setOtpCode}
                    otpSending={otpSending}
                    setOtpSending={setOtpSending}
                    otpSent={otpSent}
                    setOtpSent={setOtpSent}
                    otpVerifying={otpVerifying}
                    otpError={otpError}
                    setOtpError={setOtpError}
                    handleVerifyOtp={handleVerifyOtp}
                    registerPassword={registerPassword}
                    setRegisterPassword={setRegisterPassword}
                    registerSubmitting={registerSubmitting}
                    handleQuickRegister={handleQuickRegister}
                  />
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
                                    {appliedDiscount.type === "percentage"
                                      ? `原價折扣 ${appliedDiscount.value}%`
                                      : `折抵 NT$ ${appliedDiscount.value.toLocaleString()}`}
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

                    {/* 訂單金額 付款方式卡片 */}
                    <Card className="border-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <CreditCard className="h-5 w-5 text-primary" />
                          訂單金額付款方式
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                          訂單金額 NT$ {calculateFinalTotal().toLocaleString()}，請選擇付款方式
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {([
                          { key: "credit_card", label: "信用卡（入住當天扣款）", icon: CreditCard, desc: "現在只綁定卡片、不扣款；入住當天由系統自動扣取全額，14 天前取消不收費" },
                          {
                            key: "atm",
                            label: `ATM 虛擬帳號轉帳（先付 ${getAtmDepositBreakdown().percentage}% 訂金）`,
                            icon: Building2,
                            desc: `僅需先匯訂金 NT$ ${getAtmDepositBreakdown().deposit.toLocaleString()}，尾款 NT$ ${getAtmDepositBreakdown().balance.toLocaleString()} 入住現場付清（繳費期限 20 分鐘）`,
                          },
                        ] as const).map((opt) => {
                          const Icon = opt.icon;
                          const selected = orderPaymentType === opt.key;
                          const atmBlocked = opt.key === "atm" && !isAtmAmountAllowed(getAtmDepositBreakdown().deposit);

                          return (
                            <div
                              key={opt.key}
                              className={`transition-all rounded-lg border-2 p-4 ${
                                atmBlocked
                                  ? "cursor-not-allowed opacity-60 border-border bg-muted/30"
                                  : `cursor-pointer hover:border-primary/50 ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card"}`
                              }`}
                              onClick={() => {
                                if (atmBlocked) return;
                                setOrderPaymentType(opt.key);
                                setPaymentMethod(
                                  opt.key === "credit_card" ? "信用卡" : "ATM 虛擬帳號"
                                );
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`rounded-full p-2 ${selected && !atmBlocked ? "bg-primary/20" : "bg-muted"}`}>
                                  <Icon className={`h-5 w-5 ${selected && !atmBlocked ? "text-primary" : "text-muted-foreground"}`} />
                                </div>
                                <div className="flex-1">
                                  <span className="font-medium text-base text-foreground">{opt.label}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {atmBlocked ? atmAmountLimitMessage(getAtmDepositBreakdown().deposit) : opt.desc}
                                  </p>
                                </div>
                                {selected && !atmBlocked && <CheckCircle className="h-5 w-5 text-primary ml-auto" />}
                              </div>
                            </div>
                          );
                        })}

                        {/* TapPay 信用卡表單 */}
                        {orderPaymentType === "credit_card" && (
                          <div className="mt-4 p-4 border rounded-lg bg-card">
                            <div className="mb-3">
                              <p className="text-sm font-medium text-foreground mb-1">請輸入信用卡資訊（現在不會扣款）</p>
                              <p className="text-xs text-muted-foreground">您的卡片資訊由 TapPay 安全加密處理，本站不會保存完整卡號</p>
                            </div>
                            <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                              <p className="text-xs text-foreground font-medium">扣款與取消說明</p>
                              <p className="text-xs text-muted-foreground">
                                ・ 現在僅完成信用卡綁定驗證，<span className="font-medium text-foreground">不會扣款</span>。
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ・ 入住當天（{checkInDate ? format(checkInDate, "yyyy/MM/dd") : "入住日"}）系統將自動扣取 NT$ {calculateFinalTotal().toLocaleString()}。
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ・ 入住日前 14 日（含）以前取消：<span className="font-medium text-foreground">免費，不扣任何款項</span>。
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ・ 14 日內取消：依取消政策級距（13–10 日 30%、9–7 日 50%、6–4 日 60%、3–2 日 70%、前 1 日 80%、當日 100%）自動收取手續費。
                              </p>
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
                                  <Button type="button" variant="outline" size="sm" onClick={() => reloadTapPayConfig()}>
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

                        {/* ATM 虛擬帳號 說明 */}
                        {orderPaymentType === "atm" && (() => {
                          const dep = getAtmDepositBreakdown();
                          return (
                          <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                            <div className="flex items-start gap-2">
                              <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                              <div className="space-y-2 w-full">
                                <p className="text-sm font-medium text-foreground">ATM 虛擬帳號轉帳（訂金制）</p>
                                <div className="rounded-md border bg-background p-3 space-y-1.5">
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>訂單總額</span>
                                    <span>NT$ {calculateFinalTotal().toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-sm font-semibold text-primary">
                                    <span>本次需匯款訂金（{dep.percentage}%）</span>
                                    <span>NT$ {dep.deposit.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>入住現場付清尾款</span>
                                    <span>NT$ {dep.balance.toLocaleString()}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  ・ 送出訂單後將跳轉到「ATM 匯款資訊頁」，由 TapPay 開立此筆訂單的專屬虛擬帳號。<br />
                                  ・ 虛擬帳號金額為 <span className="font-medium text-foreground">訂金 NT$ {dep.deposit.toLocaleString()}</span>，請勿更改匯款金額，以免無法自動核帳。<br />
                                  ・ 可使用 ATM、網路銀行或臨櫃方式轉帳。<br />
                                  ・ 繳費期限 20 分鐘，逾期未繳訂金訂單將自動取消。<br />
                                  ・ 系統收到入帳通知後將自動確認訂房，剩餘尾款 NT$ {dep.balance.toLocaleString()} 於入住當天現場以現金、刷卡或匯款付清。
                                </p>
                              </div>
                            </div>
                          </div>
                          );
                        })()}


                        {/* 付款錯誤提示 */}
                        {lastPaymentError && orderPaymentType && (
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

                    {/* 條款說明（送出訂單即視為同意） */}
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      送出訂單即表示我已閱讀並接受 Lakeze 人客多 之
                      <a
                        href="/legal/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mx-1 text-primary underline underline-offset-4"
                      >
                        條款及細則
                      </a>
                      與
                      <a
                        href="/legal/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mx-1 text-primary underline underline-offset-4"
                      >
                        隱私條款
                      </a>
                      。
                    </p>

                  </div>
                )}


                {/* Step 5: Confirmation */}
                {currentStep === "confirm" && (
                  <div className="space-y-6">
                    {/* 訂單摘要（與上方摘要一致） */}
                    {(() => {
                      const nights = calculateNights();
                      const addonLines: Array<{ label: string; qty: string; subtotal: number }> = [];
                      if (petPlanSettings.enabled && petCount > 0 && nights > 0) {
                        addonLines.push({
                          label: "寵物加購",
                          qty: `${petCount} 隻 × ${nights} 晚`,
                          subtotal: petCount * petPlanSettings.pricePerUnit * nights,
                        });
                      }
                      const bbqTotalCount = Object.values(bbqMealsByDate).reduce((s, c) => s + (c || 0), 0);
                      if (mealPlanSettings.enabled && bbqTotalCount > 0) {
                        addonLines.push({
                          label: "BBQ 餐食",
                          qty: `${bbqTotalCount} 人份`,
                          subtotal: bbqTotalCount * mealPlanSettings.pricePerUnit,
                        });
                      }
                      Object.entries(customAddonCounts).forEach(([type, count]) => {
                        if (!count || count <= 0) return;
                        const s = customAddonSettings.find((x) => x.addon_type === type);
                        if (!s) return;
                        addonLines.push({
                          label: cleanAddonName(s.addon_type),
                          qty: s.pricing_mode === 'per_stay' ? `${count} ${shortUnit(s.unit_label)}（單次）` : `${count} ${shortUnit(s.unit_label)} × ${nights} 晚`,
                          subtotal: count * s.price_per_unit * addonNightsMultiplier(s.pricing_mode, nights),
                        });
                      });
                      const childExtra = calculateChildExtraTotal();
                      if (childExtra > 0) {
                        addonLines.push({
                          label: "兒童加價",
                          qty: `${nights} 晚`,
                          subtotal: childExtra,
                        });
                      }
                      return (
                        <MobileOrderSummary
                          accommodationName={accommodationName}
                          checkInDate={checkInDate}
                          checkOutDate={checkOutDate}
                          calculateNights={calculateNights}
                          totalGuests={totalGuests}
                          adultsCount={contextGuests?.adults || 0}
                          childrenCount={contextGuests?.children || 0}
                          infantsCount={infantsCount}
                          toddlersCount={toddlersCount}
                          selectedRoom={selectedRoom}
                          selectedPackage={selectedPackage}
                          roomAllocation={selectedPackage?.room_allocation || null}
                          roomTypes={roomTypes}
                          roomsCount={roomQuantity}
                          roomSubtotal={getRoomChargeTotal()}
                  roomOriginalSubtotal={appliedDiscount ? null : (calculatePackageOriginalTotal() != null ? calculatePackageOriginalTotal()! * roomQuantity : null)}
                          addonLines={addonLines}
                          calculateFinalTotal={calculateFinalTotal}
                          appliedDiscount={appliedDiscount}
                          calculateDiscount={calculateDiscount}
                        />
                      );
                    })()}


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
                        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">訂單金額</span>
                            <span className="font-medium text-sm">
                              {orderPaymentType === "credit_card" ? "信用卡（入住當天扣款）" : "ATM 虛擬帳號"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">押金 NT$ {DEPOSIT_AMOUNT.toLocaleString()}</span>
                            <span className="font-medium text-sm">
                              {depositPaymentType === "card" ? "線上綁卡" : "現場現金"}
                            </span>
                          </div>
                          {orderPaymentType === "credit_card" && (
                            <div className="pt-2 mt-1 border-t space-y-1.5">
                              <div className="flex justify-between items-center text-sm font-semibold text-primary">
                                <span>本次線上扣款</span>
                                <span>NT$ 0（僅綁卡）</span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>入住當天自動扣款</span>
                                <span>NT$ {calculateFinalTotal().toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                                送出訂單後僅完成信用卡綁定，不會立即扣款；入住當天系統自動扣取全額。入住日前 14 日（含）以前取消完全免費，14 日內取消將依取消政策比例自動收取手續費。
                              </p>
                            </div>
                          )}

                          {orderPaymentType === "atm" && (() => {
                            const dep = getAtmDepositBreakdown();
                            return (
                              <div className="pt-2 mt-1 border-t space-y-1.5">
                                <div className="flex justify-between items-center text-sm font-semibold text-primary">
                                  <span>本次線上匯款訂金（{dep.percentage}%）</span>
                                  <span>NT$ {dep.deposit.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-muted-foreground">
                                  <span>入住現場付清尾款</span>
                                  <span>NT$ {dep.balance.toLocaleString()}</span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                                  送出訂單後將產生專屬虛擬帳號，金額為訂金 NT$ {dep.deposit.toLocaleString()}，請於 20 分鐘內完成匯款；尾款可於入住當天以現金、刷卡或匯款付清。
                                </p>
                              </div>
                            );
                          })()}
                        </div>

                        {appliedDiscount && (
                          <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Badge className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">已套用折扣代碼</p>
                                <p className="font-medium text-sm text-destructive">

                                  {appliedDiscount.code}
                                  {appliedDiscount.type === "percentage"
                                    ? ` 折扣原價${appliedDiscount.value}%`
                                    : ""}
                                  ，折抵 NT$ {calculateDiscount().toLocaleString()}
                                </p>
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
            {/* Navigation Buttons（跟隨頁面內容，位於結帳頁最下方） */}
            <div
              className="flex gap-3 sm:gap-4 mt-4 sm:mt-6"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
              }}
            >


              {(
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

          {/* Right: Summary Sidebar - 桌機版比照手機版摘要 */}
          <div className="hidden lg:block w-full min-w-0">
            <div className="w-full min-w-0 space-y-4">



            {(() => {
              const nights = calculateNights();
              const addonLines: Array<{ label: string; qty: string; subtotal: number }> = [];
              if (petPlanSettings.enabled && petCount > 0 && nights > 0) {
                addonLines.push({
                  label: "寵物加購",
                  qty: `${petCount} 隻 × ${nights} 晚`,
                  subtotal: petCount * petPlanSettings.pricePerUnit * nights,
                });
              }
              const bbqTotalCount = Object.values(bbqMealsByDate).reduce((s, c) => s + (c || 0), 0);
              if (mealPlanSettings.enabled && bbqTotalCount > 0) {
                addonLines.push({
                  label: "BBQ 餐食",
                  qty: `${bbqTotalCount} 人份`,
                  subtotal: bbqTotalCount * mealPlanSettings.pricePerUnit,
                });
              }
              Object.entries(customAddonCounts).forEach(([type, count]) => {
                if (!count || count <= 0) return;
                const s = customAddonSettings.find((x) => x.addon_type === type);
                if (!s) return;
                addonLines.push({
                  label: cleanAddonName(s.addon_type),
                  qty: s.pricing_mode === 'per_stay' ? `${count} ${shortUnit(s.unit_label)}（單次）` : `${count} ${shortUnit(s.unit_label)} × ${nights} 晚`,
                  subtotal: count * s.price_per_unit * addonNightsMultiplier(s.pricing_mode, nights),
                });
              });
              const childExtra = calculateChildExtraTotal();
              if (childExtra > 0) {
                addonLines.push({
                  label: "兒童加價",
                  qty: `${nights} 晚`,
                  subtotal: childExtra,
                });
              }
              return (
                <MobileOrderSummary
                  variant="desktop"
                  accommodationName={accommodationName}
                  checkInDate={checkInDate}
                  checkOutDate={checkOutDate}
                  calculateNights={calculateNights}
                  totalGuests={totalGuests}
                  adultsCount={contextGuests?.adults || 0}
                  childrenCount={contextGuests?.children || 0}
                  infantsCount={infantsCount}
                  toddlersCount={toddlersCount}
                  selectedRoom={selectedRoom}
                  selectedPackage={selectedPackage}
                  roomAllocation={selectedPackage?.room_allocation || null}
                  roomTypes={roomTypes}
                  roomsCount={roomQuantity}
                  roomSubtotal={getRoomChargeTotal()}
                  roomOriginalSubtotal={appliedDiscount ? null : (calculatePackageOriginalTotal() != null ? calculatePackageOriginalTotal()! * roomQuantity : null)}
                  addonLines={addonLines}
                  calculateFinalTotal={calculateFinalTotal}
                  appliedDiscount={appliedDiscount}
                  calculateDiscount={calculateDiscount}
                />
              );
            })()}
            {addonsSection && <div>{addonsSection}</div>}
            </div>
          </div>



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

      {/* 自訂加購詳細內容對話框 */}
      <Dialog open={!!customAddonDetail} onOpenChange={(open) => !open && setCustomAddonDetail(null)}>
        <DialogContent className="max-w-3xl w-[95vw] md:w-full max-h-[85vh] md:max-h-[90vh] flex flex-col gap-0 p-0">
          <div className="p-4 md:p-6 border-b">
            <DialogTitle className="text-xl md:text-2xl font-bold mb-2">
              🛏️ {customAddonDetail?.title}
            </DialogTitle>
            <DialogDescription className="text-base text-primary font-semibold">
              {customAddonDetail?.subtitle}
            </DialogDescription>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div
              className="space-y-4 md:space-y-5 text-sm md:text-base prose prose-sm max-w-none"
              dangerouslySetInnerHTML={createSanitizedHtml(customAddonDetail?.html || '')}
            />
          </div>

          <div className="p-4 md:p-6 border-t bg-muted/30">
            <Button onClick={() => setCustomAddonDetail(null)} className="w-full h-11 md:h-10 text-base">
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

      {/* 手機版底部選單 */}
      <MobileBottomNav />
    </div>
  );
};

export default BookingFlow;
