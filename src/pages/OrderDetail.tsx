import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation, Link, useSearchParams as useSearchParamsHook } from "react-router-dom";
import { ArrowLeft, Mail, Home, ShoppingBag, Globe, UserPlus, CreditCard, XCircle, Pencil, Save, X, Minus, Plus, Trash2, LogIn, LogOut, Copy, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format, eachDayOfInterval, addDays } from "date-fns";
import { resolveTemplatePricesForDates, type PricingTemplateLite } from "@/utils/templatePriceResolver";
import { useToast } from "@/hooks/use-toast";
import { useSecondaryCurrency } from "@/hooks/use-secondary-currency";
import { formatSecondary } from "@/lib/currency";
import { DualCurrencyInput } from "@/components/ui/dual-currency-input";
import { OnlinePaymentDialog } from "@/components/orders/OnlinePaymentDialog";
import { DepositManagementSection } from "@/components/orders/DepositManagementSection";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import OrderAuditLogCard from "@/components/orders/OrderAuditLogCard";
import { computeOrderDiff, computeRoomsDiff, computeExclusiveConfigDiff, computeVisibleNotesDiff, extractAddonNote, extractExtraAddonAmount } from "@/utils/orderAuditDiff";
import { ensureKolQuotaPermit, logKolQuotaOverride, type KolQuotaStatus } from "@/lib/kolReciprocalQuota";
import { KolQuotaConfirmDialog } from "@/components/orders/KolQuotaConfirmDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
interface MealPlanDetail {
  date: string;
  count: number;
  pricePerUnit: number;
  price: number;
}

interface OrderDetail {
  id: string;
  accommodation_id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  guest_address: string | null;
  guest_gender: string | null;
  guest_nationality: string | null;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  order_status: string;
  payment_status: string;
  total_price: number;
  discount_amount: number;
  discount_code: string | null;
  final_price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_method: string | null;
  deposit_payment_method: string | null;
  balance_payment_method: string | null;
  meal_plan: string | null;
  notes: string | null;
  order_date: string;
  room_assigned: boolean;
  pet_count: number;
  pet_plan_price: number;
  meal_plan_details: MealPlanDetail[];
  meal_plan_total: number;
  custom_addon_details: CustomAddonDetail[] | null;
  order_source: string;
  owner_direct?: boolean;
  lock_whole_building?: boolean;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  room_type_id: string | null;
  room_types: {
    name: string;
    name_en: string | null;
  } | null;
}

interface CustomAddonDetail {
  addon_type: string;
  count: number;
  price_per_unit: number;
  total: number;
  unit_label: string;
}

interface CustomMealPlan {
  id: string;
  name: string;
  description: string;
}

interface RoomTypeOption {
  id: string;
  name: string;
  base_price: number;
  is_exclusive_package?: boolean;
}

interface OrderRoom {
  id: string;
  room_type_id: string;
  quantity: number;
  room_price: number;
  template_name: string | null;
  room_unit_id?: string | null;
  room_types?: { name: string } | null;
  room_units?: { unit_number: string; nickname: string | null } | null;
}

interface EditOrderRoom {
  id: string;
  room_type_id: string;
  quantity: number;
  room_price: number;
  unit_price: number;
  template_name: string | null;
  room_unit_id?: string | null;
}

interface RoomUnitOption {
  id: string;
  room_type_id: string;
  unit_number: string;
  nickname: string | null;
  is_active: boolean;
  occupied_by_order_id?: string | null;
  occupied_by_order_number?: string | null;
}
interface AddonSetting {
  id: string;
  addon_type: string;
  description: string | null;
  unit_label: string;
  price_per_unit: number;
  max_quantity: number;
  enabled: boolean;
}

interface EditFormState {
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_address: string;
  guest_gender: string;
  guest_nationality: string;
  guest_count: number;
  order_source: string;
  owner_direct: boolean;
  lock_whole_building: boolean;
  order_status: string;
  payment_status: string;
  deposit_payment_method: string;
  balance_payment_method: string;
  meal_plan: string;
  notes: string;
  room_type_id: string;
  total_price: number;
  discount_amount: number;
  discount_code: string;
  deposit_amount: number;
  paid_amount: number;
  pet_count: number;
  pet_plan_price: number;
  meal_plan_details: MealPlanDetail[];
  meal_plan_total: number;
  custom_addon_details: CustomAddonDetail[];
  addon_total: number;
  addon_note: string;
  extra_addon_amount: number;
}

const OrderDetailPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParamsHook();
  const backTo = (location.state as any)?.from || "/admin/orders";
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSyncingRefund, setIsSyncingRefund] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [kolQuotaPrompt, setKolQuotaPrompt] = useState<{ yearMonth: string; used: number; quota: number; resolve: (v: boolean) => void } | null>(null);
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  const [roomTemplates, setRoomTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [allRoomTemplates, setAllRoomTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [allTemplates, setAllTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPriceEditDialog, setShowPriceEditDialog] = useState(false);
  const [editTotalPrice, setEditTotalPrice] = useState(0);
  const [editDiscountAmount, setEditDiscountAmount] = useState(0);
  const [editDepositAmount, setEditDepositAmount] = useState(0);
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [addonSettings, setAddonSettings] = useState<AddonSetting[]>([]);
  const [orderRooms, setOrderRooms] = useState<OrderRoom[]>([]);
  const [editOrderRooms, setEditOrderRooms] = useState<EditOrderRoom[]>([]);
  const [editExclusiveConfigs, setEditExclusiveConfigs] = useState<Array<Record<string, number>>>([]);
  const setExclusiveConfigAt = useCallback((idx: number, name: string, value: number) => {
    setEditExclusiveConfigs(prev => {
      const next = [...prev];
      while (next.length <= idx) next.push({});
      next[idx] = { ...next[idx], [name]: value };
      return next;
    });
  }, []);
  // 只有森山寫照保留「包區」用語，其餘民宿一律使用「包棟」
  const SENSAN_ACC_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
  const HAKUNA_ACC_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
  const YUNXIU_ACC_ID = "7690a606-6bac-4cd5-a3e7-2fa754b318e8";
  const OLIVIA_ACC_ID = "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8";
  const isSensan = order?.accommodation_id === SENSAN_ACC_ID;
  const isHakuna = order?.accommodation_id === HAKUNA_ACC_ID;
  const isYunxiu = order?.accommodation_id === YUNXIU_ACC_ID;
  const isOlivia = order?.accommodation_id === OLIVIA_ACC_ID;
  const { config: secondaryCurrencyConfig } = useSecondaryCurrency(order?.accommodation_id);
  // 每筆訂單獨立的顯示幣別
  const [orderDisplayCurrency, setOrderDisplayCurrency] = useState<string | null>(null);
  useEffect(() => {
    if (!order?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("order_meta").select("display_currency").eq("order_id", order.id).maybeSingle();
      if (!cancelled) setOrderDisplayCurrency((data as any)?.display_currency ?? null);
    })();
    return () => { cancelled = true; };
  }, [order?.id]);
  const currencyForcedMode = useMemo<"TWD" | "SEC" | null>(() => {
    if (!secondaryCurrencyConfig) return null;
    if (!orderDisplayCurrency) return null;
    return orderDisplayCurrency.toUpperCase() === secondaryCurrencyConfig.code.toUpperCase() ? "SEC" : "TWD";
  }, [orderDisplayCurrency, secondaryCurrencyConfig]);
  const handleCurrencyModeChange = useCallback(async (m: "TWD" | "SEC") => {
    if (!order?.id) return;
    const code = (await import("@/lib/orderDisplayCurrency")).modeToCurrencyCode(m, secondaryCurrencyConfig?.code);
    setOrderDisplayCurrency(code);
    (await import("@/lib/orderDisplayCurrency")).setOrderDisplayCurrency(order.id, code);
  }, [order?.id, secondaryCurrencyConfig?.code]);
  const exclusiveLabel = isSensan ? "包區" : "包棟";
  const [roomUnits, setRoomUnits] = useState<RoomUnitOption[]>([]);
  // DB-driven 包棟組成（HQ 房型與包棟設定）。沒設定 → fallback 舊三家 hardcoded。
  const [customBreakdown, setCustomBreakdown] = useState<Array<{ name: string; count: number }> | null>(null);
  const breakdownItems = useMemo<Array<{ name: string; max: number }>>(() => {
    if (customBreakdown && customBreakdown.length > 0) {
      return customBreakdown.map(b => ({ name: b.name, max: b.count }));
    }
    const maxDouble = isHakuna ? 2 : isOlivia ? 8 : 3;
    const maxQuad = isHakuna ? 4 : isOlivia ? 1 : 3;
    return [
      { name: "雙人房", max: maxDouble },
      { name: "四人房", max: maxQuad },
    ];
  }, [customBreakdown, isHakuna, isOlivia]);
  const [depositRatioRef] = useState<{ current: number }>({ current: 0 });
  const [originalDiscountCode] = useState<{ current: string }>({ current: "" });
  const [initialEditSnapshot] = useState<{ current: { rooms: any[]; exclusiveConfigs: Array<Record<string, number>> } }>({ current: { rooms: [], exclusiveConfigs: [] } });
  const [defaultDepositRatio, setDefaultDepositRatio] = useState<number>(0);

  // Load accommodation booking settings (use_deposit / deposit_percentage) for fallback ratio
  useEffect(() => {
    if (!order?.accommodation_id) return;
    (async () => {
      const { data } = await supabase
        .from("booking_settings")
        .select("use_deposit, deposit_percentage")
        .eq("accommodation_id", order.accommodation_id)
        .maybeSingle();
      if (data && data.use_deposit !== false) {
        setDefaultDepositRatio((data.deposit_percentage ?? 30) / 100);
      } else {
        setDefaultDepositRatio(0);
      }
    })();
  }, [order?.accommodation_id]);

  // Load 包棟方案的內含房間清單（room_types.package_contents）
  // 優先用編輯中的包棟房型；否則 fallback 訂單原本的 room_type_id
  const exclusiveRoomTypeId = useMemo(() => {
    const editExclusive = editOrderRooms.find(r => roomTypes.find(t => t.id === r.room_type_id)?.is_exclusive_package);
    if (editExclusive) return editExclusive.room_type_id;
    return order?.room_type_id || null;
  }, [editOrderRooms, roomTypes, order?.room_type_id]);

  useEffect(() => {
    if (!exclusiveRoomTypeId) {
      setCustomBreakdown(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("room_types")
        .select("package_contents, is_exclusive_package")
        .eq("id", exclusiveRoomTypeId)
        .maybeSingle();
      const items = (data as any)?.package_contents;
      if (Array.isArray(items) && items.length > 0) {
        setCustomBreakdown(
          items
            .map((it: any) => ({ name: String(it.name || ""), count: Number(it.count) || 0 }))
            .filter((it: { name: string; count: number }) => it.name && it.count > 0),
        );
      } else {
        setCustomBreakdown(null);
      }
    })();
  }, [exclusiveRoomTypeId]);
  const getRoomUnitPrice = useCallback((roomPrice: number, quantity: number) => {
    return quantity > 0 ? Math.round(roomPrice / quantity) : roomPrice;
  }, []);

  const getSuggestedRoomUnitPrice = useCallback((roomTypeId: string, currentRoomId?: string) => {
    const candidatePrices = [
      ...editOrderRooms
        .filter((room) => room.room_type_id === roomTypeId && room.id !== currentRoomId)
        .map((room) => room.unit_price || getRoomUnitPrice(room.room_price, room.quantity)),
      ...orderRooms
        .filter((room) => room.room_type_id === roomTypeId && room.id !== currentRoomId)
        .map((room) => getRoomUnitPrice(room.room_price, room.quantity)),
    ].filter((price) => price > 0);

    const roomTypeBasePrice = roomTypes.find((roomType) => roomType.id === roomTypeId)?.base_price ?? 0;

    if (roomTypeBasePrice > 0) {
      candidatePrices.push(roomTypeBasePrice);
    }

    return candidatePrices.length > 0 ? Math.min(...candidatePrices) : 0;
  }, [editOrderRooms, getRoomUnitPrice, orderRooms, roomTypes]);

  /**
   * 依「訂單入住日期」與該房型的對應方案 (template) 透過 templatePriceResolver
   * 計算每晚價格總和，回傳「單間總額（含所有晚數）」。
   * 若找不到方案或日期區間，回傳 0（呼叫端會 fallback 到舊邏輯）。
   */
  const computeRoomTotalByDates = useCallback(async (
    roomTypeId: string,
    templateName: string | null | undefined,
  ): Promise<number> => {
    if (!order?.check_in_date || !order?.check_out_date || !roomTypeId) return 0;
    const start = new Date(order.check_in_date);
    const end = new Date(order.check_out_date);
    if (!(start < end)) return 0;
    const dates = eachDayOfInterval({ start, end: addDays(end, -1) }).map(d => format(d, "yyyy-MM-dd"));
    if (!dates.length) return 0;

    // 候選方案：包含「未綁定房型 (room_type_id = null，視為全房型通用，如包棟方案)」與「綁定本房型」的 templates
    const candidates = allTemplates.filter(t => !t.room_type_id || t.room_type_id === roomTypeId);
    let template: PricingTemplateLite | null = null;
    if (templateName) {
      // 1) 精準同名
      template = candidates.find(t => t.template_name === templateName) || null;
      // 2) 同 meal plan 類別（二食 / 三食 / 一食）
      if (!template) {
        const mealTag = templateName.includes("三食") || templateName.includes("3食")
          ? "三食"
          : templateName.includes("二食") || templateName.includes("2食") || templateName.includes("兩食")
            ? "二食"
            : null;
        if (mealTag) {
          template = candidates.find(t => (t.template_name || "").includes(mealTag)) || null;
        }
      }
    }
    // 3) 退而求其次：該房型的第一個 template
    if (!template) {
      template = candidates[0] || null;
    }

    const priceMap = await resolveTemplatePricesForDates({
      roomTypeId,
      template,
      dates,
      publicHolidays,
    });
    let total = 0;
    for (const d of dates) {
      if (priceMap[d] != null) total += priceMap[d];
    }
    return Math.round(total);
  }, [order?.check_in_date, order?.check_out_date, allTemplates, publicHolidays]);

  const [editForm, setEditForm] = useState<EditFormState>({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    guest_address: "",
    guest_gender: "",
    guest_nationality: "",
    guest_count: 1,
    order_source: "",
    owner_direct: false,
    lock_whole_building: false,
    order_status: "",
    payment_status: "",
    deposit_payment_method: "",
    balance_payment_method: "",
    meal_plan: "",
    notes: "",
    room_type_id: "",
    total_price: 0,
    discount_amount: 0,
    discount_code: "",
    deposit_amount: 0,
    paid_amount: 0,
    pet_count: 0,
    pet_plan_price: 0,
    meal_plan_details: [],
    meal_plan_total: 0,
    custom_addon_details: [],
    addon_total: 0,
    addon_note: "",
    extra_addon_amount: 0,
  });
  const [discountCodeError, setDiscountCodeError] = useState("");
  const [canUnlockPaidOrderDiscount, setCanUnlockPaidOrderDiscount] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkPaidOrderDiscountUnlock = async () => {
      if (!order || !["deposit_paid", "paid", "fully_paid"].includes(order.payment_status)) {
        setCanUnlockPaidOrderDiscount(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCanUnlockPaidOrderDiscount(false);
        return;
      }

      const { data, error } = await supabase.rpc("can_unlock_paid_order_discount", {
        _user_id: user.id,
        _accommodation_id: order.accommodation_id,
      });

      if (!cancelled) {
        setCanUnlockPaidOrderDiscount(!error && !!data);
      }
    };

    checkPaidOrderDiscountUnlock();
    return () => { cancelled = true; };
  }, [order?.id, order?.accommodation_id, order?.payment_status]);

  const startEditing = () => {
    if (!order) return;
    // Parse exclusive package room configs from notes (one line per 包棟)
    const notesStr = order.notes || "";
    // 逐行擷取「【包區/包棟房間配置】...」，動態解析各房型數量（兼容舊「雙人房/四人房」格式）
    const pkgLineRegex = /【\s*(?:包區|包棟)\s*房間配置\s*】\s*(.+)/;
    const parsedConfigs: Array<Record<string, number>> = [];
    notesStr.split(/\r?\n/).forEach(line => {
      const lm = line.match(pkgLineRegex);
      if (!lm) return;
      const body = lm[1];
      // 解析格式：「房型名稱 N 間」逐段
      const cfg: Record<string, number> = {};
      const partRegex = /([\u4e00-\u9fff\w]+?)\s*(\d+)\s*間/g;
      let m: RegExpExecArray | null;
      while ((m = partRegex.exec(body)) !== null) {
        const name = m[1].trim();
        const n = parseInt(m[2]) || 0;
        if (name) cfg[name] = n;
      }
      if (Object.keys(cfg).length > 0) parsedConfigs.push(cfg);
    });
    setEditExclusiveConfigs(parsedConfigs);
    // Snapshot 編輯前的房間配置與包區設定，供儲存時計算差異
    initialEditSnapshot.current = {
      rooms: (orderRooms || []).map(r => ({
        room_type_id: r.room_type_id,
        quantity: r.quantity,
        room_price: r.room_price,
        room_unit_id: r.room_unit_id ?? null,
      })),
      exclusiveConfigs: JSON.parse(JSON.stringify(parsedConfigs)),
    };
    setEditForm({
      guest_name: order.guest_name || "",
      guest_phone: order.guest_phone || "",
      guest_email: order.guest_email || "",
      guest_address: order.guest_address || "",
      guest_gender: order.guest_gender || "",
      guest_nationality: order.guest_nationality || "",
      guest_count: order.guest_count || 1,
      order_source: order.order_source || "website",
      owner_direct: !!order.owner_direct,
      lock_whole_building: !!order.lock_whole_building,
      order_status: order.order_status || "pending",
      payment_status: order.payment_status || "unpaid",
      deposit_payment_method: order.deposit_payment_method || "none",
      balance_payment_method: order.balance_payment_method || "none",
      meal_plan: (() => {
        const raw = order.meal_plan;
        if (!raw) return "none";
        // Legacy: meal_plan stored as template UUID — normalize to template_name
        const byId = roomTemplates.find(t => t.id === raw) || allRoomTemplates.find(t => t.id === raw);
        if (byId) return byId.template_name;
        return raw;
      })(),
      notes: (order.notes || "")
        .replace(/【(?:加購備註|額外現場加購備註)[^】]*】\n?[\s\S]*?\n?【(?:加購備註|額外現場加購備註)END】\n?/g, "")
        .replace(/^【(?:加購備註|額外現場加購備註)[^】]*】.*$\n?/gm, "")
        .replace(/【額外現場加購金額[^】]*】\n?[\s\S]*?\n?【額外現場加購金額END】\n?/g, "")
        .trim(),
      room_type_id: order.room_type_id || "",
      total_price: order.total_price || 0,
      discount_amount: order.discount_amount || 0,
      discount_code: order.discount_code || "",
      deposit_amount: order.deposit_amount || 0,
      paid_amount: order.paid_amount || 0,
      pet_count: (() => {
        const all = (order.custom_addon_details as CustomAddonDetail[]) || [];
        const legacyPet = all.find(d => d.addon_type === 'pet');
        return (order.pet_count || 0) > 0 ? order.pet_count : (legacyPet?.count || 0);
      })(),
      pet_plan_price: (() => {
        const all = (order.custom_addon_details as CustomAddonDetail[]) || [];
        const legacyPet = all.find(d => d.addon_type === 'pet');
        return (order.pet_plan_price || 0) > 0 ? order.pet_plan_price : (legacyPet?.total || 0);
      })(),
      meal_plan_details: order.meal_plan_details || [],
      meal_plan_total: order.meal_plan_total || 0,
      // Exclude reserved types (pet/meal/bbq) — those are handled by their dedicated UI sections,
      // otherwise legacy entries would be double-counted (invisible in UI but added to total).
      custom_addon_details: ((order.custom_addon_details as CustomAddonDetail[]) || [])
        .filter(d => d.addon_type !== 'pet' && d.addon_type !== 'meal' && d.addon_type !== 'bbq'),
      addon_total: (() => {
        const all = (order.custom_addon_details as CustomAddonDetail[]) || [];
        const petFromCustom = all.filter(d => d.addon_type === 'pet').reduce((s, d) => s + d.total, 0);
        const mealFromCustom = all.filter(d => d.addon_type === 'meal').reduce((s, d) => s + d.total, 0);
        const otherCustom = all.filter(d => d.addon_type !== 'pet' && d.addon_type !== 'meal' && d.addon_type !== 'bbq').reduce((s, d) => s + d.total, 0);
        const petTotal = (order.pet_plan_price || 0) > 0 ? (order.pet_plan_price || 0) : petFromCustom;
        const mealTotal = (order.meal_plan_total || 0) > 0 ? (order.meal_plan_total || 0) : mealFromCustom;
        const extraMatch = (order.notes || "").match(/【額外現場加購金額[^】]*】\n?(\d+)\n?【額外現場加購金額END】/);
        const extra = extraMatch ? parseInt(extraMatch[1], 10) || 0 : 0;
        return petTotal + mealTotal + otherCustom + extra;
      })(),
      addon_note: extractAddonNote(order.notes),
      extra_addon_amount: extractExtraAddonAmount(order.notes),
    });
    // Initialize edit order rooms
    if (orderRooms.length > 0) {
      const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
      const shouldUseOrderTotalForSingleRoom = orderRooms.length === 1 && Number(order.total_price || 0) > 0 && savedRoomsTotal !== Number(order.total_price || 0);
      const normalizedRooms = orderRooms.map((or) => {
        const correctedRoomPrice = shouldUseOrderTotalForSingleRoom ? Number(order.total_price || 0) : Number(or.room_price || 0);
        const unitPrice = getRoomUnitPrice(correctedRoomPrice, or.quantity);
        return {
          id: or.id,
          room_type_id: or.room_type_id,
          quantity: or.quantity,
          room_price: correctedRoomPrice,
          unit_price: unitPrice,
          template_name: or.template_name,
          room_unit_id: or.room_unit_id ?? null,
        };
      });

      setEditOrderRooms(normalizedRooms);
      const roomsTotal = shouldUseOrderTotalForSingleRoom
        ? Number(order.total_price || 0)
        : normalizedRooms.reduce((sum, r) => sum + r.room_price, 0);
      setEditForm(f => ({ ...f, total_price: roomsTotal }));
    } else {
      // 保留單 / 舊單沒有 order_rooms：若有 room_type_id，從訂單合成一筆，存檔時會寫回 order_rooms，與一般新建訂單一致
      if (order.room_type_id) {
        const syntheticPrice = Number(order.total_price || 0);
        setEditOrderRooms([{
          id: `synthetic-${order.id}`,
          room_type_id: order.room_type_id,
          quantity: 1,
          room_price: syntheticPrice,
          unit_price: syntheticPrice,
          template_name: null,
          room_unit_id: null,
        }]);
      } else {
        setEditOrderRooms([]);
      }
    }
    // Store deposit ratio based on original final price
    const savedRoomsTotalForRatio = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
    const effectiveTotal = orderRooms.length === 1 && Number(order.total_price || 0) > 0 && savedRoomsTotalForRatio !== Number(order.total_price || 0)
      ? Number(order.total_price || 0)
      : (orderRooms.length > 0 ? savedRoomsTotalForRatio : (order.total_price || 0));
    // 訂金比例僅以「房費 - 折扣」為基準，加購方案不影響訂金
    const originalBase = Math.max(0, effectiveTotal - (order.discount_amount || 0));
    const existingRatio = originalBase > 0 ? (order.deposit_amount || 0) / originalBase : 0;
    // Fallback to accommodation default deposit ratio when order has no deposit yet
    depositRatioRef.current = existingRatio > 0 ? existingRatio : defaultDepositRatio;
    originalDiscountCode.current = order.discount_code || "";
    setIsEditing(true);
  };

  // Auto-sync addon_total when individual addons change
  useEffect(() => {
    if (!isEditing) return;
    const computed = editForm.pet_plan_price + editForm.meal_plan_total + editForm.custom_addon_details.reduce((sum, d) => sum + d.total, 0) + (editForm.extra_addon_amount || 0);
    if (computed !== editForm.addon_total) {
      setEditForm(f => ({ ...f, addon_total: computed }));
    }
  }, [isEditing, editForm.pet_plan_price, editForm.meal_plan_total, editForm.custom_addon_details, editForm.extra_addon_amount]);

  // Auto-sync deposit_amount when final price changes
  // Skip when order is already paid/deposit_paid — deposit must stay locked
  useEffect(() => {
    if (!isEditing || depositRatioRef.current <= 0) return;
    if (order && ["deposit_paid", "paid", "fully_paid"].includes(order.payment_status)) return;
    const newBase = Math.max(0, editForm.total_price - editForm.discount_amount);
    const newDeposit = Math.max(0, Math.round(newBase * depositRatioRef.current));
    if (newDeposit !== editForm.deposit_amount) {
      setEditForm(f => ({ ...f, deposit_amount: newDeposit }));
    }
  }, [isEditing, editForm.total_price, editForm.discount_amount, order?.payment_status]);

  // Auto-lookup discount code and apply discount amount
  useEffect(() => {
    if (!isEditing || !order) return;
    const code = editForm.discount_code.trim();
    const originalCode = (originalDiscountCode.current || "").trim();

    if (!code) {
      setDiscountCodeError("");
      // Only clear discount if the user explicitly removed an existing code.
      // If the order never had a code (manual discount), preserve the amount.
      if (originalCode) {
        setEditForm(f => ({ ...f, discount_amount: 0 }));
      }
      return;
    }

    // If the discount code hasn't changed from the original, preserve the saved discount_amount
    if (code === originalCode) {
      setDiscountCodeError("");
      return;
    }

    const timer = setTimeout(async () => {
      setDiscountCodeError("");
      const base = editForm.total_price + editForm.addon_total;
      // Use the primary room_type_id for validation
      const roomTypeId = editForm.room_type_id || (editOrderRooms.length > 0 ? editOrderRooms[0].room_type_id : null) || order.room_type_id || null;
      const checkInDate = order.check_in_date || null;

      try {
        const { data, error } = await supabase.rpc('validate_discount_code', {
          p_code: code.toUpperCase(),
          p_accommodation_id: order.accommodation_id,
          p_order_amount: base,
          p_room_type_id: roomTypeId,
          p_check_in_date: checkInDate
        });

        if (error) {
          setDiscountCodeError("驗證折扣碼失敗");
          return;
        }

        const result = data?.[0];
        if (!result || !result.is_valid) {
          let errorMsg = result?.message || "此折扣碼不存在";
          if (result?.applicable_room_names && result.applicable_room_names.length > 0) {
            errorMsg += `（僅適用：${result.applicable_room_names.join('、')}）`;
          }
          setDiscountCodeError(errorMsg);
          setEditForm(f => ({ ...f, discount_amount: 0 }));
          return;
        }

        let newDiscount = 0;
        if (result.discount_type === "percentage") {
          newDiscount = Math.round(base * result.discount_value / 100);
        } else {
          newDiscount = Math.min(result.discount_value, base);
        }
        setEditForm(f => ({ ...f, discount_amount: newDiscount }));
      } catch (err) {
        console.error("Error validating discount code:", err);
        setDiscountCodeError("驗證折扣碼失敗");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isEditing, editForm.discount_code]);

  // Auto-sync total_price when editOrderRooms change
  useEffect(() => {
    if (!isEditing || editOrderRooms.length === 0) return;
    const roomsTotal = editOrderRooms.reduce((sum, r) => sum + r.room_price, 0);
    if (roomsTotal !== editForm.total_price) {
      setEditForm(f => ({ ...f, total_price: roomsTotal }));
    }
  }, [isEditing, editOrderRooms]);

  // Re-initialize editOrderRooms when orderRooms load after editing already started
  useEffect(() => {
    if (!isEditing || orderRooms.length === 0 || editOrderRooms.length > 0) return;
    const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
    const shouldUseOrderTotalForSingleRoom = orderRooms.length === 1 && Number(order?.total_price || 0) > 0 && savedRoomsTotal !== Number(order?.total_price || 0);
    const normalizedRooms = orderRooms.map((or) => {
      const correctedRoomPrice = shouldUseOrderTotalForSingleRoom ? Number(order?.total_price || 0) : Number(or.room_price || 0);
      const unitPrice = getRoomUnitPrice(correctedRoomPrice, or.quantity);
      return {
        id: or.id,
        room_type_id: or.room_type_id,
        quantity: or.quantity,
        room_price: correctedRoomPrice,
        unit_price: unitPrice,
        template_name: or.template_name,
        room_unit_id: or.room_unit_id ?? null,
      };
    });
    setEditOrderRooms(normalizedRooms);
    const roomsTotal = normalizedRooms.reduce((sum, r) => sum + r.room_price, 0);
    setEditForm(f => ({ ...f, total_price: roomsTotal }));
  }, [isEditing, orderRooms]);

  // Legacy fallback: if editing an order that has no order_rooms but has a chosen room_type_id,
  // auto-populate a synthetic editOrderRoom so the new UI (with 棟號/房號 selector) is shown.
  useEffect(() => {
    if (!isEditing || !order) return;
    if (editOrderRooms.length > 0 || orderRooms.length > 0) return;
    if (!editForm.room_type_id) return;
    const syntheticPrice = Number(order.total_price || 0);
    setEditOrderRooms([{
      id: `synthetic-${order.id}`,
      room_type_id: editForm.room_type_id,
      quantity: 1,
      room_price: syntheticPrice,
      unit_price: syntheticPrice,
      template_name: null,
      room_unit_id: null,
    }]);
  }, [isEditing, order, editForm.room_type_id, orderRooms.length, editOrderRooms.length]);

  useEffect(() => {
    if (searchParams.get("editing") === "true" && order && !isEditing) {
      // Wait for orderRooms to be loaded before starting edit
      // orderRooms are fetched alongside order, so once order is set they should follow
      startEditing();
      const next = new URLSearchParams(searchParams);
      next.delete("editing");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, order, orderRooms]);

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!order || isSavingEdit) return;

    // KOL 互惠額度檢查（編輯時：若來源改為/維持 'kol'，依入住日歸屬月份）
    let kolOverrideStatus: KolQuotaStatus | null = null;
    const kolPermitted = await ensureKolQuotaPermit({
      accommodationId: order.accommodation_id,
      orderSource: editForm.order_source,
      checkInDate: order.check_in_date,
      excludeOrderId: order.id, // 排除本訂單自身
      isAdmin: isAdminUser,
      confirmOverride: (status) =>
        new Promise<boolean>((resolve) => {
          setKolQuotaPrompt({
            yearMonth: status.yearMonth,
            used: status.used,
            quota: status.quota!,
            resolve,
          });
        }),
      onOverride: (status) => { kolOverrideStatus = status; },
    });
    if (!kolPermitted) return;

    setIsSavingEdit(true);
    try {
      const editFinalPriceCalc = editForm.total_price + editForm.addon_total - editForm.discount_amount;

      // If any edited room is an exclusive package, regenerate one [包區/包棟房間配置] line per 包棟
      const exclusiveRows = editOrderRooms.filter(r => roomTypes.find(t => t.id === r.room_type_id)?.is_exclusive_package);
      let finalNotes = editForm.notes.trim();
      // 先移除舊的加購備註區塊（多行格式）與舊的單行格式
      finalNotes = finalNotes
        .replace(/【(?:加購備註|額外現場加購備註)[^】]*】\n?[\s\S]*?\n?【(?:加購備註|額外現場加購備註)END】\n?/g, "")
        .replace(/【額外現場加購金額[^】]*】\n?[\s\S]*?\n?【額外現場加購金額END】\n?/g, "")
        .trim();
      finalNotes = finalNotes
        .split("\n")
        .filter(line => !/^【\s*(?:包區|包棟)\s*房間配置\s*】/.test(line.trim()))
        .filter(line => !/^【(?:加購備註|額外現場加購備註)[^】]*】/.test(line.trim()))
        .join("\n")
        .trim();
      // 以區塊格式寫入最新加購備註（支援多行）
      const addonNoteTrim = editForm.addon_note.trim();
      if (addonNoteTrim) {
        const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
        const block = `【額外現場加購備註 ${ts}】\n${addonNoteTrim}\n【額外現場加購備註END】`;
        finalNotes = finalNotes ? `${finalNotes}\n${block}` : block;
      }
      // 寫入額外現場加購金額（純數字區塊）
      if ((editForm.extra_addon_amount || 0) > 0) {
        const ts2 = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
        const amtBlock = `【額外現場加購金額 ${ts2}】\n${editForm.extra_addon_amount}\n【額外現場加購金額END】`;
        finalNotes = finalNotes ? `${finalNotes}\n${amtBlock}` : amtBlock;
      }
      if (exclusiveRows.length > 0) {
        const pkgLines = exclusiveRows.map((_, i) => {
          const cfg = editExclusiveConfigs[i] || {};
          const parts = breakdownItems
            .map(b => ({ name: b.name, n: Number(cfg[b.name]) || 0 }))
            .filter(p => p.n > 0)
            .map(p => `${p.name} ${p.n} 間`);
          if (parts.length === 0) return "";
          return `【${exclusiveLabel}房間配置】${parts.join("、")}`;
        }).filter(line => line.length > 0);
        if (pkgLines.length > 0) {
          finalNotes = finalNotes ? `${pkgLines.join("\n")}\n${finalNotes}` : pkgLines.join("\n");
        }
      }

      const updateData: Record<string, any> = {
        guest_name: editForm.guest_name.trim(),
        guest_phone: editForm.guest_phone.trim(),
        guest_email: editForm.guest_email.trim() || null,
        guest_address: editForm.guest_address.trim() || null,
        guest_gender: editForm.guest_gender || null,
        guest_nationality: editForm.guest_nationality.trim() || null,
        guest_count: editForm.guest_count,
        order_source: editForm.order_source,
        owner_direct: editForm.owner_direct,
        lock_whole_building: isOlivia ? editForm.lock_whole_building : false,
        order_status: editForm.order_status,
        payment_status: editForm.payment_status,
        deposit_payment_method: editForm.deposit_payment_method === "none" ? null : editForm.deposit_payment_method,
        balance_payment_method: editForm.balance_payment_method === "none" ? null : editForm.balance_payment_method,
        meal_plan: editForm.meal_plan === "none" ? null : editForm.meal_plan,
        notes: finalNotes || null,
        room_type_id: editForm.room_type_id || null,
        discount_code: editForm.discount_code.trim() || null,
        paid_amount: editForm.paid_amount,
        pet_count: editForm.pet_count,
        pet_plan_price: editForm.pet_plan_price,
        meal_plan_details: editForm.meal_plan_details.length > 0 ? editForm.meal_plan_details : null,
        meal_plan_total: editForm.meal_plan_total,
        custom_addon_details: editForm.custom_addon_details.length > 0 ? editForm.custom_addon_details : null,
      };

      // Financial fields are immutable after payment (DB trigger).
      // Only include them if the order is not yet paid OR the value actually changed.
      const isPaidOrDeposit = ["paid", "fully_paid"].includes(order.payment_status);
      const addIfChanged = (key: string, newVal: number, oldVal: number | null | undefined) => {
        if (!isPaidOrDeposit || Number(newVal) !== Number(oldVal ?? 0)) {
          updateData[key] = newVal;
        }
      };
      addIfChanged("total_price", editForm.total_price, order.total_price);
      if (!isPaidOrDeposit || canUnlockPaidOrderDiscount) {
        addIfChanged("discount_amount", editForm.discount_amount, order.discount_amount);
        updateData.discount_code = editForm.discount_code.trim() || null;
      } else {
        updateData.discount_code = order.discount_code;
      }
      // 訂金/尾款一律允許在編輯模式調整（無論付款狀態）
      updateData.deposit_amount = editForm.deposit_amount;
      // final_price may legitimately change when addons are added/removed on a paid order.
      // Always include it so the total reflects current addons; the DB trigger allows this
      // as long as core financial fields (total_price/discount/deposit) are unchanged.
      addIfChanged("final_price", editFinalPriceCalc, order.final_price);

      // Block disallowed financial edits with friendly toast
      const blocked: string[] = [];
      if (isPaidOrDeposit && Number(editForm.total_price) !== Number(order.total_price ?? 0)) blocked.push("房費金額");
      if (isPaidOrDeposit && !canUnlockPaidOrderDiscount && Number(editForm.discount_amount) !== Number(order.discount_amount ?? 0)) blocked.push("折扣金額");
      if (blocked.length > 0) {
        toast({
          title: "已付款訂單無法修改金額",
          description: `${blocked.join("、")} 無法在此付款狀態下變更，請改用退款或新增訂單方式處理。`,
          variant: "destructive",
        });
        setIsSavingEdit(false);
        return;
      }

      // Auto-append locked audit line when a settled order has financial changes via inline edit
      if (isPaidOrDeposit) {
        const auditParts: string[] = [];
        if (canUnlockPaidOrderDiscount && Number(editForm.discount_amount) !== Number(order.discount_amount ?? 0)) {
          auditParts.push(`折扣 ${order.discount_amount}→${editForm.discount_amount}`);
        }
        if (canUnlockPaidOrderDiscount && (editForm.discount_code.trim() || "") !== (order.discount_code || "")) {
          auditParts.push(`折扣碼 ${order.discount_code || "(無)"}→${editForm.discount_code.trim() || "(無)"}`);
        }

        // Addon diffs (寵物 / 餐食 / 自訂加購) — show item-level changes that explain 實收 變動
        const oldPetTotal = (() => {
          const all = (order.custom_addon_details as CustomAddonDetail[]) || [];
          const legacyPet = all.find((a: any) => a?.addon_type === "寵物" || a?.addon_type === "pet");
          return (order.pet_plan_price || 0) > 0 ? (order.pet_plan_price || 0) : (legacyPet?.total || 0);
        })();
        const oldPetCount = (() => {
          const all = (order.custom_addon_details as CustomAddonDetail[]) || [];
          const legacyPet = all.find((a: any) => a?.addon_type === "寵物" || a?.addon_type === "pet");
          return (order.pet_count || 0) > 0 ? (order.pet_count || 0) : (legacyPet?.count || 0);
        })();
        if (Number(editForm.pet_count) !== Number(oldPetCount) || Number(editForm.pet_plan_price) !== Number(oldPetTotal)) {
          auditParts.push(`寵物 ${oldPetCount}隻/${oldPetTotal}→${editForm.pet_count}隻/${editForm.pet_plan_price}`);
        }
        if (Number(editForm.meal_plan_total) !== Number(order.meal_plan_total ?? 0)) {
          auditParts.push(`餐食 ${order.meal_plan_total ?? 0}→${editForm.meal_plan_total}`);
        }
        // Per-addon diff for custom_addon_details (excluding pet/meal which are tracked separately above)
        const oldAddons: CustomAddonDetail[] = ((order.custom_addon_details as CustomAddonDetail[]) || [])
          .filter(a => a.addon_type !== "寵物" && a.addon_type !== "pet" && a.addon_type !== "餐食" && a.addon_type !== "meal");
        const newAddons = editForm.custom_addon_details
          .filter(a => a.addon_type !== "寵物" && a.addon_type !== "pet" && a.addon_type !== "餐食" && a.addon_type !== "meal");
        const addonKeys = Array.from(new Set([...oldAddons.map(a => a.addon_type), ...newAddons.map(a => a.addon_type)]));
        for (const k of addonKeys) {
          const o = oldAddons.find(a => a.addon_type === k);
          const n = newAddons.find(a => a.addon_type === k);
          const oc = o?.count || 0, ot = o?.total || 0;
          const nc = n?.count || 0, nt = n?.total || 0;
          if (oc !== nc || ot !== nt) {
            auditParts.push(`${k} ${oc}/${ot}→${nc}/${nt}`);
          }
        }

        if (Number(editFinalPriceCalc) !== Number(order.final_price ?? 0)) {
          auditParts.push(`實收 ${order.final_price}→${editFinalPriceCalc}`);
        }
        if (Number(editForm.deposit_amount) !== Number(order.deposit_amount ?? 0)) {
          auditParts.push(`訂金 ${order.deposit_amount ?? 0}→${editForm.deposit_amount}`);
        }
        if (Number(editForm.paid_amount) !== Number(order.paid_amount ?? 0)) {
          auditParts.push(`已付 ${order.paid_amount ?? 0}→${editForm.paid_amount}`);
        }
        if (auditParts.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          let who = "unknown";
          if (user) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
            who = (prof?.name && prof.name.trim()) || user.email || user.id;
          }
          const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
          const auditLine = `🔒[金額異動 ${ts} by ${who}] ${auditParts.join("、")}`;
          finalNotes = finalNotes ? `${finalNotes}\n${auditLine}` : auditLine;
          updateData.notes = finalNotes;
        }
      }

      // Handle status timestamp updates
      if (editForm.order_status !== order.order_status) {
        if (editForm.order_status === "confirmed") {
          updateData.confirmed_at = new Date().toISOString();
        }
        if (editForm.order_status === "checked_in") {
          updateData.checked_in_at = new Date().toISOString();
        }
        if (editForm.order_status === "checked_out") {
          updateData.checked_out_at = new Date().toISOString();
        }
        if (editForm.order_status === "cancelled") {
          updateData.cancelled_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (error) throw error;

      // Save order_rooms changes if multi-room
      if (editOrderRooms.length > 0) {
        // Delete existing order_rooms first and check result
        const { error: deleteError } = await supabase
          .from("order_rooms")
          .delete()
          .eq("order_id", order.id);
        if (deleteError) throw deleteError;

        // Verify deletion succeeded (RLS may silently block deletes)
        const { data: remaining } = await supabase
          .from("order_rooms")
          .select("id")
          .eq("order_id", order.id);
        if (remaining && remaining.length > 0) {
          throw new Error("無法刪除舊的房間記錄，請確認您有足夠的權限");
        }

        // 自動安排：對於 quantity===1 且未手動指派的列，依 display_order 找出可用 unit
        const needsAuto = editOrderRooms.filter(r => r.quantity === 1 && !r.room_unit_id);
        const autoAssignMap = new Map<string, string>();
        if (needsAuto.length > 0 && order.accommodation_id) {
          const typeIds = Array.from(new Set(needsAuto.map(r => r.room_type_id)));
          const [unitsRes, occRes] = await Promise.all([
            supabase
              .from("room_units" as any)
              .select("id, room_type_id, display_order, is_active")
              .eq("accommodation_id", order.accommodation_id)
              .eq("is_active", true)
              .in("room_type_id", typeIds)
              .order("display_order", { ascending: true }),
            supabase
              .from("order_rooms")
              .select("room_unit_id, orders!inner(id, accommodation_id, order_status, check_in_date, check_out_date)")
              .not("room_unit_id", "is", null)
              .eq("orders.accommodation_id", order.accommodation_id)
              .neq("orders.order_status", "cancelled")
              .lt("orders.check_in_date", order.check_out_date)
              .gt("orders.check_out_date", order.check_in_date),
          ]);
          const reserved = new Set<string>();
          ((occRes.data as any[]) || []).forEach((row: any) => {
            if (row.room_unit_id) reserved.add(row.room_unit_id);
          });
          // 排除本次手動指派
          editOrderRooms.forEach(r => { if (r.room_unit_id) reserved.add(r.room_unit_id); });
          const units = (((unitsRes.data as any[]) || [])).sort((a: any, b: any) => a.display_order - b.display_order);
          needsAuto.forEach(r => {
            const u = units.find((x: any) => x.room_type_id === r.room_type_id && !reserved.has(x.id));
            if (u) {
              autoAssignMap.set(r.id, u.id);
              reserved.add(u.id);
            }
          });
        }

        // Insert updated rooms
        const newOrderRooms = editOrderRooms.map(r => {
          return {
            order_id: order.id,
            room_type_id: r.room_type_id,
            quantity: r.quantity,
            room_price: r.room_price,
            template_name: r.template_name,
            // quantity > 1 不指派單一棟/房；quantity===1 套用手動或自動安排
            room_unit_id: r.quantity !== 1 ? null : (r.room_unit_id || autoAssignMap.get(r.id) || null),
          };
        });
        const { error: roomsError } = await supabase.from("order_rooms").insert(newOrderRooms);
        if (roomsError) throw roomsError;
      } else {
        // If all rooms were removed in edit, also delete from DB
        const { error: deleteError } = await supabase
          .from("order_rooms")
          .delete()
          .eq("order_id", order.id);
        if (deleteError) throw deleteError;
      }

      // Audit log
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const changes = computeOrderDiff(order as any, updateData);
          // 房間配置差異
          const roomTypeNameMap: Record<string, string> = Object.fromEntries(
            (roomTypes || []).map((t: any) => [t.id, t.name])
          );
          const unitNameMap: Record<string, string> = Object.fromEntries(
            (roomUnits || []).map((u: any) => [u.id, u.nickname || u.unit_number])
          );
          const roomsAfter = editOrderRooms.map(r => ({
            room_type_id: r.room_type_id,
            quantity: r.quantity,
            room_price: r.room_price,
            room_unit_id: r.quantity !== 1 ? null : (r.room_unit_id || null),
          }));
          const roomsDiff = computeRoomsDiff(
            initialEditSnapshot.current.rooms,
            roomsAfter,
            roomTypeNameMap,
            unitNameMap,
          );
          if (roomsDiff) changes.push(roomsDiff);
          const exclusiveDiff = computeExclusiveConfigDiff(
            initialEditSnapshot.current.exclusiveConfigs,
            editExclusiveConfigs,
          );
          if (exclusiveDiff) changes.push(exclusiveDiff);
          const notesDiff = computeVisibleNotesDiff(order.notes, updateData.notes);
          if (notesDiff) changes.push(notesDiff);
          const addonNoteBefore = extractAddonNote(order.notes);
          const addonNoteAfter = extractAddonNote(updateData.notes);
          if (addonNoteBefore !== addonNoteAfter) {
            changes.push({ field: "addon_note", label: "額外現場加購備註", before: addonNoteBefore || "(空)", after: addonNoteAfter || "(空)" });
          }
          const extraAddonBefore = extractExtraAddonAmount(order.notes);
          if (Number(extraAddonBefore) !== Number(editForm.extra_addon_amount || 0)) {
            changes.push({ field: "extra_addon_amount", label: "額外現場加購金額", before: extraAddonBefore, after: editForm.extra_addon_amount || 0 });
          }
          if (changes.length > 0) {
            const { error: auditError } = await supabase.from("audit_logs").insert([{
              user_id: user.id,
              user_email: user.email,
              action_type: "update",
              action_category: "order",
              entity_type: "order",
              entity_id: order.id,
              entity_name: order.order_number,
              accommodation_id: order.accommodation_id,
              details: { type: "inline_edit", changes } as any,
            }]);
            if (auditError) throw auditError;
          }
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      if (kolOverrideStatus && order.accommodation_id) {
        await logKolQuotaOverride({
          orderId: order.id,
          orderNumber: order.order_number,
          accommodationId: order.accommodation_id,
          status: kolOverrideStatus,
          context: "edit",
        });
      }

      toast({ title: "儲存成功", description: "訂單已更新" });
      setIsEditing(false);

      // Notify kol-webhook of potential discount-code change
      try {
        await supabase.functions.invoke('kol-webhook', {
          body: {
            order_id: order.id,
            trigger_type: "update",
            previous_discount_code: originalDiscountCode.current ?? null,
          },
        });
      } catch (e) {
        console.error("kol-webhook invoke (update) error:", e);
      }

      fetchOrder();
    } catch (error: any) {
      console.error("儲存失敗:", error);
      const msg = error?.message || error?.error_description || "請稍後再試";
      toast({ title: "儲存失敗", description: msg, variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ order_status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: auditError } = await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: "cancel", changes: [{ field: "order_status", label: "訂單狀態", before: order.order_status, after: "cancelled" }] } as any,
          }]);
          if (auditError) throw auditError;
        }
      } catch (e) { console.error("Audit log error:", e); }
      toast({ title: "訂單已取消", description: `訂單 ${order.order_number} 已成功取消` });
      navigate(backTo);
    } catch (error) {
      console.error("取消訂單失敗:", error);
      toast({ title: "取消失敗", description: "無法取消訂單，請稍後再試", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCheckinAction = async (action: "checkin" | "undo_checkin" | "checkout" | "undo_checkout") => {
    if (!order) return;
    try {
      const patch: Record<string, string | null> = {};
      if (action === "checkin") patch.checked_in_at = new Date().toISOString();
      if (action === "undo_checkin") patch.checked_in_at = null;
      if (action === "checkout") {
        patch.checked_out_at = new Date().toISOString();
        if (!order.checked_in_at) patch.checked_in_at = new Date().toISOString();
      }
      if (action === "undo_checkout") patch.checked_out_at = null;
      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw error;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: auditError } = await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: action, changes: Object.keys(patch).map(k => ({ field: k, label: k, before: (order as any)[k] ?? null, after: patch[k] })) } as any,
          }]);
          if (auditError) throw auditError;
        }
      } catch (e) { console.error("Audit log error:", e); }
      toast({
        title:
          action === "checkin" ? "已辦理入住"
            : action === "checkout" ? "已辦理退房"
              : action === "undo_checkin" ? "已取消入住記錄"
                : "已取消退房記錄",
      });
      fetchOrder();
    } catch (err: any) {
      toast({ title: "操作失敗", description: err.message, variant: "destructive" });
    }
  };

  const openPriceEditDialog = () => {
    if (!order) return;
    setEditTotalPrice(order.total_price);
    setEditDiscountAmount(order.discount_amount);
    setEditDepositAmount(order.deposit_amount);
    setEditPaidAmount(order.paid_amount);
    setEditReason("");
    setShowPriceEditDialog(true);
  };

  const editFinalPrice = editTotalPrice - editDiscountAmount;

  const handleSavePriceEdit = async () => {
    if (!order) return;
    if (editFinalPrice < 0) {
      toast({ title: "實收金額不可為負數", variant: "destructive" });
      return;
    }
    setIsSavingPrice(true);
    try {
      const oldValues = {
        total_price: order.total_price,
        discount_amount: order.discount_amount,
        final_price: order.final_price,
        deposit_amount: order.deposit_amount,
        paid_amount: order.paid_amount,
      };
      const newValues = {
        total_price: editTotalPrice,
        discount_amount: editDiscountAmount,
        final_price: editFinalPrice,
        deposit_amount: editDepositAmount,
        paid_amount: editPaidAmount,
      };

      let newPaymentStatus = order.payment_status;
      if (editPaidAmount <= 0) {
        newPaymentStatus = "unpaid";
      } else if (editPaidAmount >= editFinalPrice) {
        newPaymentStatus = "paid";
      } else if (editPaidAmount > 0 && editPaidAmount < editFinalPrice) {
        newPaymentStatus = "deposit_paid";
      }

      // Build locked audit-line when this is a paid/deposit-paid order with amount changes
      const wasPaidOrDeposit = ["paid", "fully_paid"].includes(order.payment_status);
      const amountChanged =
        Number(editTotalPrice) !== Number(order.total_price ?? 0) ||
        Number(editDiscountAmount) !== Number(order.discount_amount ?? 0) ||
        Number(editDepositAmount) !== Number(order.deposit_amount ?? 0) ||
        Number(editPaidAmount) !== Number(order.paid_amount ?? 0) ||
        Number(editFinalPrice) !== Number(order.final_price ?? 0);

      let nextNotes: string | null = order.notes ?? null;
      if (wasPaidOrDeposit && amountChanged) {
        const { data: { user } } = await supabase.auth.getUser();
        let who = "unknown";
        if (user) {
          const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
          who = (prof?.name && prof.name.trim()) || user.email || user.id;
        }
        const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
        const parts: string[] = [];
        if (Number(editTotalPrice) !== Number(order.total_price ?? 0)) parts.push(`房費 ${order.total_price}→${editTotalPrice}`);
        if (Number(editDiscountAmount) !== Number(order.discount_amount ?? 0)) parts.push(`折扣 ${order.discount_amount}→${editDiscountAmount}`);
        if (Number(editDepositAmount) !== Number(order.deposit_amount ?? 0)) parts.push(`訂金 ${order.deposit_amount ?? 0}→${editDepositAmount}`);
        if (Number(editPaidAmount) !== Number(order.paid_amount ?? 0)) parts.push(`已付 ${order.paid_amount ?? 0}→${editPaidAmount}`);
        if (Number(editFinalPrice) !== Number(order.final_price ?? 0)) parts.push(`實收 ${order.final_price}→${editFinalPrice}`);
        const reasonStr = editReason.trim() ? `｜原因：${editReason.trim()}` : "";
        const auditLine = `🔒[金額異動 ${ts} by ${who}] ${parts.join("、")}${reasonStr}`;
        nextNotes = nextNotes ? `${nextNotes}\n${auditLine}` : auditLine;
      } else if (editReason.trim()) {
        nextNotes = order.notes
          ? `${order.notes}\n\n【金額修改】${editReason.trim()}`
          : `【金額修改】${editReason.trim()}`;
      }

      const { error } = await supabase
        .from("orders")
        .update({
          total_price: editTotalPrice,
          discount_amount: editDiscountAmount,
          final_price: editFinalPrice,
          deposit_amount: editDepositAmount,
          paid_amount: editPaidAmount,
          payment_status: newPaymentStatus,
          notes: nextNotes,
        })
        .eq("id", order.id);
      if (error) throw error;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: auditError } = await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: "price_edit", reason: editReason.trim(), old: oldValues, new: newValues, changes: Object.keys(newValues).filter(k => (oldValues as any)[k] !== (newValues as any)[k]).map(k => ({ field: k, label: k, before: (oldValues as any)[k], after: (newValues as any)[k] })) } as any,
          }]);
          if (auditError) throw auditError;
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "金額修改成功", description: "訂單金額已更新" });
      setShowPriceEditDialog(false);
      fetchOrder();
    } catch (error) {
      console.error("修改金額失敗:", error);
      toast({ title: "修改失敗", description: "無法修改訂單金額，請稍後再試", variant: "destructive" });
    } finally {
      setIsSavingPrice(false);
    }
  };

  const fetchOrder = async () => {
    if (!orderId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          room_types (
            name,
            name_en
          )
        `)
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const orderData = data as any;
        const orderObj = {
          ...orderData,
          pet_count: orderData.pet_count || 0,
          pet_plan_price: orderData.pet_plan_price || 0,
          meal_plan_details: (orderData.meal_plan_details || []).filter((d: any) => d && d.date),
          meal_plan_total: orderData.meal_plan_total || 0,
        } as OrderDetail;
        setOrder(orderObj);

        // Fetch order_rooms (multi-room details)
        const { data: orderRoomsData } = await supabase
          .from("order_rooms")
          .select("id, room_type_id, quantity, room_price, template_name, room_unit_id, room_types(name), room_units(unit_number, nickname)")
          .eq("order_id", orderId);
        if (orderRoomsData && orderRoomsData.length > 0) {
          setOrderRooms(orderRoomsData as unknown as OrderRoom[]);
        } else {
          setOrderRooms([]);
        }

        // Fetch room types for edit mode
        if (orderData.accommodation_id) {
          const { data: rtData } = await supabase
            .from("room_types")
            .select("id, name, base_price, is_exclusive_package")
            .eq("accommodation_id", orderData.accommodation_id)
            .order("display_order", { ascending: true });
          if (rtData) setRoomTypes(rtData);

          // Fetch room units for assignment dropdown (active only)
          const { data: unitsData } = await supabase
            .from("room_units" as any)
            .select("id, room_type_id, unit_number, nickname, is_active")
            .eq("accommodation_id", orderData.accommodation_id)
            .eq("is_active", true)
            .order("display_order", { ascending: true });
          if (unitsData) {
            // 查詢同期間已被佔用的 unit
            const { data: occupiedData } = await supabase
              .from("order_rooms")
              .select("room_unit_id, orders!inner(id, order_number, order_status, check_in_date, check_out_date)")
              .not("room_unit_id", "is", null)
              .neq("order_id", orderId);
            const occupiedMap = new Map<string, { id: string; order_number: string }>();
            ((occupiedData as any) || []).forEach((row: any) => {
              const o = row.orders;
              if (!o || o.order_status === "cancelled") return;
              if (
                o.check_in_date < orderData.check_out_date &&
                o.check_out_date > orderData.check_in_date
              ) {
                occupiedMap.set(row.room_unit_id, { id: o.id, order_number: o.order_number });
              }
            });
            setRoomUnits(
              (unitsData as any[]).map((u) => ({
                ...u,
                occupied_by_order_id: occupiedMap.get(u.id)?.id || null,
                occupied_by_order_number: occupiedMap.get(u.id)?.order_number || null,
              })),
            );
          }

          // Fetch all pricing templates for this accommodation so edited room rows can
          // resolve the correct room-type-specific inventory price, including holidays.
          const { data: templatesData } = await supabase
            .from("pricing_templates")
            .select("id, template_name, meal_plans, room_type_id, room_type_ids, price, weekday_price, peak_price, weekend_price, display_order")
            .eq("accommodation_id", orderData.accommodation_id)
            .order("display_order", { ascending: true, nullsFirst: false })
            .order("template_name", { ascending: true });

          if (templatesData && templatesData.length > 0) {
            const roomTypeId = orderData.room_type_id;
            const roomTypeTemplates = roomTypeId
              ? templatesData.filter((t: any) =>
                  (Array.isArray(t.room_type_ids) && t.room_type_ids.includes(roomTypeId)) ||
                  t.room_type_id === roomTypeId)
              : templatesData;
            setRoomTemplates(roomTypeTemplates as any);
            setAllRoomTemplates(templatesData as any);
            // Derive meal plan options from template names
            const derivedPlans: CustomMealPlan[] = [];
            const defaultTemplate = roomTypeTemplates.find(t => (t as any).meal_plans && Array.isArray((t as any).meal_plans) && ((t as any).meal_plans as any[]).length > 0);
            if (defaultTemplate) {
              const plans = (defaultTemplate as any).meal_plans as CustomMealPlan[];
              derivedPlans.push(...plans);
            }
            for (const t of roomTypeTemplates) {
              const name = t.template_name || "";
              if (name.includes("二食") || name.includes("2食")) {
                if (!derivedPlans.some(p => p.id === "2_meals")) {
                  derivedPlans.push({ id: "2_meals", name: "一泊二食", description: "" });
                }
              }
              if (name.includes("三食") || name.includes("3食")) {
                if (!derivedPlans.some(p => p.id === "3_meals")) {
                  derivedPlans.push({ id: "3_meals", name: "一泊三食", description: "" });
                }
              }
            }
            setCustomMealPlans(derivedPlans);
          } else {
            setRoomTemplates([]);
            setAllRoomTemplates([]);
            setCustomMealPlans([]);
          }

          if (templatesData) setAllTemplates(templatesData as any);

          // Fetch public holidays covering the order date range (with margin)
          if (orderData.check_in_date && orderData.check_out_date) {
            const { data: holidayData } = await supabase
              .from("public_holidays")
              .select("holiday_date, holiday_type")
              .eq("accommodation_id", orderData.accommodation_id)
              .gte("holiday_date", orderData.check_in_date)
              .lte("holiday_date", orderData.check_out_date);
            if (holidayData) {
              setPublicHolidays(
                holidayData
                  .filter((h: any) => h.holiday_type !== "work_on_weekend")
                  .map((h: any) => h.holiday_date),
              );
            }
          }

          // Fetch addon settings for edit mode
          const { data: addonData } = await supabase
            .from("addon_settings")
            .select("id, addon_type, description, unit_label, price_per_unit, max_quantity, enabled")
            .eq("accommodation_id", orderData.accommodation_id)
            .eq("enabled", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
          if (addonData) setAddonSettings(addonData as AddonSetting[]);
        }
      }
    } catch (error) {
      console.error("Error fetching order:", error);
      toast({
        title: "載入失敗",
        description: "無法載入訂單資料",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const getPaymentStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      unpaid: { label: "未付款", className: "bg-error-light text-error border-error/20" },
      deposit_paid: { label: "已付訂金", className: "bg-warning-light text-warning border-warning/20" },
      paid: { label: "已付清", className: "bg-success-light text-success border-success/20" },
      overdue: { label: "已逾期", className: "bg-error-light text-error border-error/20" },
      refunded: { label: "已退款", className: "bg-muted text-muted-foreground border-border" },
      partial_refunded: { label: "部分退款", className: "bg-amber-100 text-amber-700 border-amber-200" },
    };
    const config = statusMap[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getOrderStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      pending: { label: "待確認", className: "bg-warning-light text-warning border-warning/20" },
      confirmed: { label: "已確認", className: "bg-primary/10 text-primary border-primary/20" },
      checked_in: { label: "已入住", className: "bg-info-light text-info border-info/20" },
      checked_out: { label: "已退房", className: "bg-muted text-muted-foreground border-border" },
      cancelled: { label: "已取消", className: "bg-error-light text-error border-error/20" },
      hold: { label: "保留中", className: "bg-muted text-muted-foreground border-border" },
    };
    const config = statusMap[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getOrderSourceBadge = (source: string) => {
    const sourceMap: Record<string, { label: string; className: string; icon: typeof Globe }> = {
      website: { label: "官網訂房", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Globe },
      manual: { label: "現場訂房", className: "bg-purple-100 text-purple-700 border-purple-200", icon: UserPlus },
      line: { label: "Line@", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Globe },
      agoda: { label: "Agoda", className: "bg-green-100 text-green-700 border-green-200", icon: Globe },
      booking: { label: "Booking", className: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: Globe },
      trip: { label: "Trip", className: "bg-orange-100 text-orange-700 border-orange-200", icon: Globe },
      travel_agency: { label: "旅行社", className: "bg-teal-100 text-teal-700 border-teal-200", icon: Globe },
      kol: { label: "KOL互惠", className: "bg-pink-100 text-pink-700 border-pink-200", icon: Globe },
      points_starchain: { label: "星鏈會員", className: "bg-amber-100 text-amber-700 border-amber-200", icon: Globe },
      official_use: { label: "公務使用", className: "bg-slate-100 text-slate-700 border-slate-200", icon: Globe },
      franchise_diff: { label: "加盟價差", className: "bg-rose-100 text-rose-700 border-rose-200", icon: Globe },
      owner_provided: { label: "業主自帶", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Globe },
    };
    const config = sourceMap[source] || { label: source || "官網訂房", className: "bg-muted text-muted-foreground border-border", icon: Globe };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const getPaymentMethodDisplayName = (method: string | null) => {
    if (!method) return "-";
    const methodMap: Record<string, string> = {
      credit_card: "信用卡",
      credit_card_3ds: "信用卡",
      atm: "ATM 虛擬帳號",
      line_pay: "LINE Pay",
      bank_transfer: "轉帳匯款",
      cash: "現金",
      monthly: "月結",
    };
    return methodMap[method] || method;
  };

  const getMealPlanDisplayName = (planId: string | null) => {
    if (!planId) return "-";
    const customPlan = customMealPlans.find(p => p.id === planId);
    if (customPlan) {
      return customPlan.name;
    }
    return planId === "2_meals" ? "一泊二食" : planId === "3_meals" ? "一泊三食" : planId;
  };

  const getTemplateDisplayName = (planId: string | null) => {
    if (!planId) return "-";
    // Prefer match by template_name (CreateOrderDialog / hold-edit store the name)
    const byName = roomTemplates.find(t => t.template_name === planId) || allRoomTemplates.find(t => t.template_name === planId);
    if (byName) return byName.template_name;
    // Legacy: meal_plan was stored as template id (UUID)
    const byId = roomTemplates.find(t => t.id === planId) || allRoomTemplates.find(t => t.id === planId);
    if (byId) return byId.template_name;
    return getMealPlanDisplayName(planId);
  };

  // 確認目前使用者是否為該訂單民宿之管理員（用於顯示「同步 TapPay 退款狀態」按鈕）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order?.accommodation_id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setIsAdminUser(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("accommodation_id", order.accommodation_id);
      const roles = (data ?? []).map((r: any) => r.role);
      if (!cancelled) {
        setIsAdminUser(roles.includes("hotel_admin") || roles.includes("super_admin"));
      }
    })();
    return () => { cancelled = true; };
  }, [order?.accommodation_id]);

  const handleSyncTapPayRefund = async () => {
    if (!order) return;
    setIsSyncingRefund(true);
    try {
      const { data, error } = await supabase.functions.invoke("tappay-sync-refund", {
        body: { orderId: order.id },
      });
      if (error) {
        const msg = (error as any)?.context?.error ?? error.message ?? "同步失敗";
        throw new Error(msg);
      }
      if (!data?.success) {
        throw new Error(data?.error || "同步失敗");
      }
      if (data.changed) {
        toast({
          title: "已同步 TapPay 退款狀態",
          description: `本次新增退款 NT$${Number(data.delta).toLocaleString()}，付款狀態：${data.new_payment_status}`,
        });
        // 重新載入訂單資料
        window.location.reload();
      } else {
        toast({
          title: "已是最新狀態",
          description: data.message || "TapPay 無新退款記錄",
        });
      }
    } catch (e: any) {
      toast({
        title: "同步失敗",
        description: e?.message || "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSyncingRefund(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!order || !order.guest_email) {
      toast({
        title: "無法發送郵件",
        description: "此訂單沒有電子郵件地址",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const mealPlanDetailsForEmail = (order.meal_plan_details || []).map(detail => ({
        date: format(new Date(detail.date), "MM/dd"),
        count: detail.count,
        price: detail.price
      }));

      const { error: emailError } = await supabase.functions.invoke(
        "send-booking-confirmation",
        {
          body: {
            guestName: order.guest_name,
            guestEmail: order.guest_email,
            orderNumber: order.order_number,
            roomName: order.room_types?.name || "房型資訊不完整",
            checkInDate: order.check_in_date,
            checkOutDate: order.check_out_date,
            guestCount: order.guest_count,
            mealPlan: order.meal_plan || "2_meals",
            mealPlanDisplayName: getMealPlanDisplayName(order.meal_plan),
            finalPrice: order.final_price,
            depositAmount: order.deposit_amount,
            paymentMethod: order.payment_method || "未指定",
            petCount: order.pet_count > 0 ? order.pet_count : undefined,
            petPlanPrice: order.pet_plan_price > 0 ? order.pet_plan_price : undefined,
            mealPlanDetails: mealPlanDetailsForEmail.length > 0 ? mealPlanDetailsForEmail : undefined,
            mealPlanTotal: order.meal_plan_total > 0 ? order.meal_plan_total : undefined,
          },
        }
      );

      if (emailError) {
        throw emailError;
      }

      toast({
        title: "郵件發送成功",
        description: `確認信已重新發送至 ${order.guest_email}`,
      });
    } catch (error) {
      console.error("重發確認郵件失敗:", error);
      toast({
        title: "郵件發送失敗",
        description: "無法發送確認郵件，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl md:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">找不到訂單資料</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const nights = Math.ceil(
    (new Date(order.check_out_date).getTime() - new Date(order.check_in_date).getTime()) / 
    (1000 * 60 * 60 * 24)
  );

  const orderSourceOptions = [
    { value: "website", label: "官網訂房" },
    { value: "manual", label: "現場訂房" },
    { value: "line", label: "Line@" },
    { value: "agoda", label: "Agoda" },
    { value: "booking", label: "Booking" },
    { value: "trip", label: "Trip" },
    { value: "travel_agency", label: "旅行社" },
    { value: "kol", label: "KOL互惠" },
    { value: "points_starchain", label: "星鏈會員" },
    { value: "official_use", label: "公務使用" },
    { value: "franchise_diff", label: "加盟價差" },
    { value: "owner_provided", label: "業主自帶" },
  ];

  const orderStatusOptions = [
    { value: "pending", label: "待確認" },
    { value: "confirmed", label: "已確認" },
    { value: "checked_in", label: "已入住" },
    { value: "checked_out", label: "已退房" },
    { value: "cancelled", label: "已取消" },
    { value: "hold", label: "保留中" },
  ];

  const paymentStatusOptions = [
    { value: "unpaid", label: "未付款" },
    { value: "paid", label: "已付清" },
    { value: "refunded", label: "已退款" },
    { value: "partial_refunded", label: "部分退款" },
  ];

  const paymentMethodOptions = [
    { value: "none", label: "無" },
    { value: "credit_card", label: "信用卡" },
    { value: "line_pay", label: "LINE Pay" },
    { value: "atm", label: "ATM 虛擬帳號" },
    { value: "cash", label: "現金" },
    { value: "monthly", label: "月結" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink className="text-muted-foreground">訂單資訊</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/orders">訂單列表</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>訂單詳情</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backTo)} className="h-9 w-9 md:h-10 md:w-10">
            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <h1 className="text-3xl md:text-2xl lg:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isEditing ? (
            <>
              <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="w-full sm:w-auto text-sm">
                <Save className="h-4 w-4 mr-2" />
                {isSavingEdit ? "儲存中..." : "儲存"}
              </Button>
              <Button variant="outline" onClick={cancelEditing} disabled={isSavingEdit} className="w-full sm:w-auto text-sm">
                <X className="h-4 w-4 mr-2" />
                取消編輯
              </Button>
            </>
          ) : (
            <>
              {order.payment_status !== 'paid' && order.order_status !== 'cancelled' && (
                <Button 
                  onClick={() => setShowPaymentDialog(true)}
                  className="w-full sm:w-auto text-sm"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">線上收款</span>
                  <span className="sm:hidden">收款</span>
                </Button>
              )}
              <Button variant="outline" onClick={startEditing} className="w-full sm:w-auto text-sm">
                <Pencil className="h-4 w-4 mr-2" />
                編輯
              </Button>
              {order.guest_email && (
                <Button 
                  variant="outline" 
                  onClick={handleResendConfirmation}
                  disabled={isSendingEmail}
                  className="w-full sm:w-auto text-sm"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{isSendingEmail ? "發送中..." : "重發確認信"}</span>
                  <span className="sm:hidden">{isSendingEmail ? "發送中..." : "重發信件"}</span>
                </Button>
              )}
              {isAdminUser && order.notes && /rec_trade_id/i.test(order.notes) && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto text-sm"
                  disabled={isSyncingRefund}
                  onClick={handleSyncTapPayRefund}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {isSyncingRefund ? "同步中..." : "同步 TapPay 退款狀態"}
                </Button>
              )}
              {order.order_status !== 'cancelled' && (
                <Button
                  variant="ghost-destructive"
                  className="w-full sm:w-auto text-sm"
                  disabled={isCancelling}
                  onClick={() => setShowCancelDialog(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  取消訂單
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* 訂單基本資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg md:text-lg">訂單資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂單編號</span>
              <span className="font-medium text-base md:text-base text-right break-all">{order.order_number}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂購日期</span>
              <span className="font-medium text-base md:text-base text-right">{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂單來源</span>
              {isEditing ? (
                <Select value={editForm.order_source} onValueChange={(v) => setEditForm(f => ({ ...f, order_source: v, owner_direct: v === "owner_provided" ? true : f.owner_direct }))}>
                  <SelectTrigger className="w-[160px] h-10 text-sm md:w-[140px] md:h-8 md:text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderSourceOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : getOrderSourceBadge(order.order_source)}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">業主自帶客</span>
              {isEditing ? (
                <Switch
                  checked={editForm.owner_direct}
                  onCheckedChange={(v) => setEditForm(f => ({ ...f, owner_direct: v }))}
                />
              ) : (
                <Badge variant={order.owner_direct ? "default" : "outline"}>
                  {order.owner_direct ? "是 (不抽成)" : "否"}
                </Badge>
              )}
            </div>
            {isOlivia && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">
                    標記為包棟
                    <span className="block text-xs text-muted-foreground/70 mt-0.5">勾選後整棟其他房型自動鎖定</span>
                  </span>
                  {isEditing ? (
                    <Switch
                      checked={editForm.lock_whole_building}
                      onCheckedChange={(v) => setEditForm(f => ({ ...f, lock_whole_building: v }))}
                    />
                  ) : (
                    <Badge variant={order.lock_whole_building ? "default" : "outline"}>
                      {order.lock_whole_building ? "是（整棟鎖定）" : "否"}
                    </Badge>
                  )}
                </div>
              </>
            )}
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂單狀態</span>
              {isEditing ? (
                <Select value={editForm.order_status} onValueChange={(v) => setEditForm(f => ({ ...f, order_status: v }))}>
                  <SelectTrigger className="w-[160px] h-10 text-sm md:w-[140px] md:h-8 md:text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderStatusOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : getOrderStatusBadge(order.order_status)}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">付款狀態</span>
              {isEditing ? (
                <Select value={editForm.payment_status} onValueChange={(v) => setEditForm(f => ({ ...f, payment_status: v }))}>
                  <SelectTrigger className="w-[160px] h-10 text-sm md:w-[140px] md:h-8 md:text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentStatusOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : getPaymentStatusBadge(
                (() => {
                  const o = order as any;
                  const unpaidStatuses = ['unpaid', 'deposit_paid', 'partial'];
                  if (unpaidStatuses.includes(order.payment_status) && o.payment_link_created_at) {
                    const created = new Date(o.payment_link_created_at);
                    if (Date.now() > created.getTime() + 3 * 24 * 60 * 60 * 1000) return 'overdue';
                  }
                  return order.payment_status;
                })()
              )}
            </div>
            {order.order_status !== 'cancelled' && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">入住/退房</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {order.checked_out_at ? (
                      <>
                        <Badge variant="outline" className="text-muted-foreground">
                          已退房 {format(new Date(order.checked_out_at), "MM-dd HH:mm")}
                        </Badge>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleCheckinAction("undo_checkout")}>
                          取消退房
                        </Button>
                      </>
                    ) : order.checked_in_at ? (
                      <>
                        <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400" variant="outline">
                          已入住 {format(new Date(order.checked_in_at), "MM-dd HH:mm")}
                        </Badge>
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => handleCheckinAction("checkout")}>
                          <LogOut className="h-3.5 w-3.5" /> 辦理退房
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleCheckinAction("undo_checkin")}>
                          取消入住
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-primary border-primary/30">尚未入住</Badge>
                        <Button size="sm" className="h-8 gap-1" onClick={() => handleCheckinAction("checkin")}>
                          <LogIn className="h-3.5 w-3.5" /> 辦理入住
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
            {(order.balance_payment_method || order.deposit_payment_method || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">付款方式</span>
                  {isEditing ? (
                    <Select 
                      value={editForm.balance_payment_method || editForm.deposit_payment_method} 
                      onValueChange={(v) => setEditForm(f => ({ 
                        ...f, 
                        balance_payment_method: v,
                        deposit_payment_method: v,
                      }))}
                    >
                      <SelectTrigger className="w-[160px] h-10 text-sm md:w-[140px] md:h-8 md:text-xs">
                        <SelectValue placeholder="選擇" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethodOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-base md:text-base">{getPaymentMethodDisplayName(order.balance_payment_method || order.deposit_payment_method)}</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 訂購人資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg md:text-lg">訂購人資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">姓名</span>
              {isEditing ? (
                <Input className="w-[200px] h-10 text-base md:h-8 md:text-sm" value={editForm.guest_name} onChange={(e) => setEditForm(f => ({ ...f, guest_name: e.target.value }))} />
              ) : (
                <span className="font-medium text-base md:text-base">{order.guest_name}</span>
              )}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">電話</span>
              {isEditing ? (
                <Input className="w-[200px] h-10 text-base md:h-8 md:text-sm" value={editForm.guest_phone} onChange={(e) => setEditForm(f => ({ ...f, guest_phone: e.target.value }))} />
              ) : (
                <span className="font-medium text-base md:text-base">{order.guest_phone}</span>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">Email</span>
              {isEditing ? (
                <Input className="w-[200px] h-10 text-base md:h-8 md:text-sm" type="email" value={editForm.guest_email} onChange={(e) => setEditForm(f => ({ ...f, guest_email: e.target.value }))} placeholder="選填" />
              ) : (
                <span className="font-medium text-sm md:text-sm break-all sm:text-right">{order.guest_email || "-"}</span>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">地址</span>
              {isEditing ? (
                <Input className="w-[200px] h-10 text-base md:h-8 md:text-sm" value={editForm.guest_address} onChange={(e) => setEditForm(f => ({ ...f, guest_address: e.target.value }))} placeholder="選填" />
              ) : (
                <span className="font-medium text-sm md:text-sm break-words sm:text-right sm:max-w-[60%]">{order.guest_address || "-"}</span>
              )}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">性別</span>
              {isEditing ? (
                <Select value={editForm.guest_gender || "none"} onValueChange={(v) => setEditForm(f => ({ ...f, guest_gender: v === "none" ? "" : v }))}>
                  <SelectTrigger className="w-[200px] h-10 text-sm md:h-8 md:text-xs">
                    <SelectValue placeholder="選填" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未填寫</SelectItem>
                    <SelectItem value="male">男</SelectItem>
                    <SelectItem value="female">女</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-medium text-base md:text-base">
                  {order.guest_gender === "male" ? "男" : order.guest_gender === "female" ? "女" : order.guest_gender === "other" ? "其他" : "-"}
                </span>
              )}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">國籍</span>
              {isEditing ? (
                <Input className="w-[200px] h-10 text-base md:h-8 md:text-sm" value={editForm.guest_nationality} onChange={(e) => setEditForm(f => ({ ...f, guest_nationality: e.target.value }))} placeholder="選填" />
              ) : (
                <span className="font-medium text-base md:text-base">{order.guest_nationality || "-"}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 住宿資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg md:text-lg">住宿資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Multi-room details */}
            {(isEditing ? editOrderRooms.length > 0 : orderRooms.length > 0) ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm md:text-sm text-muted-foreground">預訂房間</span>
                    {isEditing && (
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge variant="outline" className="text-xs">
                          共 {editOrderRooms.reduce((sum, r) => sum + r.quantity, 0)} 間
                        </Badge>
                        {roomTypes.some(r => !r.is_exclusive_package) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={async () => {
                            const rt = roomTypes.filter(r => !r.is_exclusive_package)[0];
                            if (!rt) return;
                            // 同一張訂單共用主方案
                            const primaryTpl = editOrderRooms[0]?.template_name || null;
                            const candidates = allTemplates.filter(t => !t.room_type_id || t.room_type_id === rt.id);
                            const sharedTpl = primaryTpl && candidates.some(t => t.template_name === primaryTpl) ? primaryTpl : null;
                            const dateBasedTotal = await computeRoomTotalByDates(rt.id, sharedTpl);
                            const suggestedUnitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(rt.id) || rt.base_price;
                            setEditOrderRooms(prev => [...prev, {
                              id: crypto.randomUUID(),
                              room_type_id: rt.id,
                              quantity: 1,
                              room_price: suggestedUnitPrice,
                              unit_price: suggestedUnitPrice,
                              template_name: sharedTpl,
                            }]);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          新增散客房
                        </Button>
                        )}
                        {roomTypes.some(r => r.is_exclusive_package) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={async () => {
                              const rt = roomTypes.filter(r => r.is_exclusive_package)[0];
                              if (!rt) return;
                              const primaryTpl = editOrderRooms[0]?.template_name || null;
                              const candidates = allTemplates.filter(t => !t.room_type_id || t.room_type_id === rt.id);
                              const sharedTpl = primaryTpl && candidates.some(t => t.template_name === primaryTpl) ? primaryTpl : null;
                              const dateBasedTotal = await computeRoomTotalByDates(rt.id, sharedTpl);
                              const suggestedUnitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(rt.id) || rt.base_price;
                              setEditOrderRooms(prev => [...prev, {
                                id: crypto.randomUUID(),
                                room_type_id: rt.id,
                                quantity: 1,
                                room_price: suggestedUnitPrice,
                                unit_price: suggestedUnitPrice,
                                template_name: sharedTpl,
                              }]);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            新增{exclusiveLabel}
                          </Button>
                        )}

                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      {(() => {
                        const exclusiveIds = editOrderRooms
                          .filter(r => roomTypes.find(t => t.id === r.room_type_id)?.is_exclusive_package)
                          .map(r => r.id);
                        return editOrderRooms.map((or, idx) => {
                          const totalOther = editOrderRooms.reduce((sum, r) => r.id === or.id ? sum : sum + r.quantity, 0);
                          const isThisExclusive = !!roomTypes.find(t => t.id === or.room_type_id)?.is_exclusive_package;
                          const exclusiveIdx = isThisExclusive ? exclusiveIds.indexOf(or.id) : -1;
                          const showExclusiveConfig = isThisExclusive;
                          const cfg: Record<string, number> = exclusiveIdx >= 0 ? (editExclusiveConfigs[exclusiveIdx] || {}) : {};
                          return (
                          <div key={or.id} className="space-y-2">
                          <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">房間 {idx + 1}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditOrderRooms(prev => prev.filter(r => r.id !== or.id))}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className={isYunxiu ? "" : "grid grid-cols-2 gap-2"}>
                              <div className="space-y-1">
                                <Label className="text-xs">房型</Label>
                                <Select
                                  value={or.room_type_id}
                                  onValueChange={async (v) => {
                                    const selectedRoomType = roomTypes.find(rt => rt.id === v);
                                    if (!selectedRoomType) {
                                      setEditOrderRooms(prev => prev.map(r => r.id === or.id ? { ...r, room_type_id: v } : r));
                                      return;
                                    }
                                    // 1) 先依「日期 + 方案」算單間總額
                                    const dateBasedTotal = await computeRoomTotalByDates(v, or.template_name);
                                    let unitPrice = 0;
                                    let roomTotal = 0;
                                    if (dateBasedTotal > 0) {
                                      // dateBasedTotal 是「單間 × 所有晚數」，再乘以間數得到此 room row 總額
                                      roomTotal = dateBasedTotal * or.quantity;
                                      unitPrice = or.quantity > 0 ? Math.round(roomTotal / or.quantity) : roomTotal;
                                    } else {
                                      // fallback：舊邏輯（同房型既有單價或 base_price）
                                      unitPrice = getSuggestedRoomUnitPrice(v, or.id) || selectedRoomType.base_price;
                                      roomTotal = unitPrice * or.quantity;
                                    }
                                    setEditOrderRooms(prev => prev.map(r => r.id === or.id ? {
                                      ...r,
                                      room_type_id: v,
                                      unit_price: unitPrice,
                                      room_price: roomTotal,
                                    } : r));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {roomTypes.map(rt => (
                                      <SelectItem key={rt.id} value={rt.id}>
                                        {rt.is_exclusive_package ? `【${exclusiveLabel}】` : ""}{rt.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {!isYunxiu && (
                                <div className="space-y-1">
                                  <Label className="text-xs">間數</Label>
                                  <div className="flex items-center gap-1">
                                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0"
                                      disabled={or.quantity <= 1 || !!roomTypes.find(rt => rt.id === or.room_type_id)?.is_exclusive_package}
                                      onClick={() => setEditOrderRooms(prev => prev.map(r => {
                                        if (r.id !== or.id) return r;
                                        const newQty = r.quantity - 1;
                                        return { ...r, quantity: newQty, room_price: Math.round(r.unit_price * newQty) };
                                      }))}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-6 text-center text-sm font-medium">{or.quantity}</span>
                                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0"
                                      disabled={!!roomTypes.find(rt => rt.id === or.room_type_id)?.is_exclusive_package}
                                      onClick={() => setEditOrderRooms(prev => prev.map(r => {
                                        if (r.id !== or.id) return r;
                                        const newQty = r.quantity + 1;
                                        return { ...r, quantity: newQty, room_price: Math.round(r.unit_price * newQty) };
                                      }))}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                            {idx === 0 ? (
                              <div className="space-y-1">
                                <Label className="text-xs">專案</Label>
                                <Select
                                  value={or.template_name || "none"}
                                  onValueChange={async (v) => {
                                    const newTemplate = v === "none" ? "" : v;
                                    // 主方案變更 → 同步套用到所有 room rows（若該房型有對應方案）
                                    const updates = await Promise.all(editOrderRooms.map(async (r) => {
                                      const candidates = allTemplates.filter(t => !t.room_type_id || t.room_type_id === r.room_type_id);
                                      const applyTpl = newTemplate && candidates.some(t => t.template_name === newTemplate)
                                        ? newTemplate
                                        : (r.id === or.id ? newTemplate : r.template_name);
                                      const dateBasedTotal = await computeRoomTotalByDates(r.room_type_id, applyTpl);
                                      if (dateBasedTotal > 0) {
                                        const roomTotal = dateBasedTotal * r.quantity;
                                        const unitPrice = r.quantity > 0 ? Math.round(roomTotal / r.quantity) : roomTotal;
                                        return { ...r, template_name: applyTpl, unit_price: unitPrice, room_price: roomTotal };
                                      }
                                      return { ...r, template_name: applyTpl };
                                    }));
                                    setEditOrderRooms(updates);
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="選擇專案" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">無</SelectItem>
                                    {allTemplates
                                      .filter(t => !t.room_type_id || t.room_type_id === or.room_type_id)
                                      .map(t => (
                                      <SelectItem key={t.id} value={t.template_name || ""}>{t.template_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (() => {
                              const primaryTpl = editOrderRooms[0]?.template_name || null;
                              const candidates = allTemplates.filter(t => !t.room_type_id || t.room_type_id === or.room_type_id);
                              const matched = primaryTpl && candidates.some(t => t.template_name === primaryTpl);
                              return (
                                <div className="space-y-1">
                                  <Label className="text-xs">專案</Label>
                                  <div className={`h-8 px-3 flex items-center rounded-md border bg-muted/50 text-xs ${matched ? "text-muted-foreground" : "text-destructive"}`}>
                                    {matched ? `共用主方案：${primaryTpl}` : (primaryTpl ? "此房型無對應主方案" : "未選擇主方案")}
                                  </div>
                                </div>
                              );
                            })()}

                            {(() => {
                              const isPackage = !!roomTypes.find(rt => rt.id === or.room_type_id)?.is_exclusive_package;
                              const unitNoun = isPackage ? exclusiveLabel : "間";

                              // 同型可用單元統計
                              const allUnitsOfType = roomUnits.filter(u => u.room_type_id === or.room_type_id);
                              const totalUnits = allUnitsOfType.length;
                              const occupiedList = allUnitsOfType.filter(u => u.occupied_by_order_id);
                              const occupiedByOthers = occupiedList.length;
                              // 其他列已手動指派（同訂單內）
                              const siblingPicked = new Set(
                                editOrderRooms
                                  .filter(r => r.id !== or.id && r.room_unit_id && r.room_type_id === or.room_type_id)
                                  .map(r => r.room_unit_id as string)
                              );
                              const freeUnits = allUnitsOfType.filter(u => !u.occupied_by_order_id && !siblingPicked.has(u.id));

                              // quantity > 1 → 無法套用自動安排
                              if (or.quantity !== 1) {
                                return (
                                  <div className="space-y-1">
                                    <Label className="text-xs">指派{unitNoun}</Label>
                                    <div className="h-8 px-2 rounded-md border border-dashed bg-amber-50 text-amber-700 text-[11px] flex items-center">
                                      多{unitNoun}訂單請拆為多列以使用自動安排
                                    </div>
                                  </div>
                                );
                              }

                              if (totalUnits === 0) {
                                return (
                                  <div className="space-y-1">
                                    <Label className="text-xs">指派{unitNoun}</Label>
                                    <div className="h-8 px-2 rounded-md border border-dashed bg-muted text-muted-foreground text-[11px] flex items-center">
                                      此房型尚未建立{unitNoun}號單位
                                    </div>
                                  </div>
                                );
                              }

                              const remaining = freeUnits.length;
                              const isAuto = !or.room_unit_id;

                              return (
                                <div className="space-y-1">
                                  <Label className="text-xs">指派{unitNoun}</Label>
                                  <Select
                                    value={or.room_unit_id || "none"}
                                    onValueChange={(v) => setEditOrderRooms(prev => prev.map(r => r.id === or.id ? { ...r, room_unit_id: v === "none" ? null : v } : r))}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="自動安排" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">自動安排</SelectItem>
                                      {allUnitsOfType.map(u => {
                                        const occupied = u.occupied_by_order_id && u.id !== or.room_unit_id;
                                        return (
                                          <SelectItem key={u.id} value={u.id} disabled={!!occupied}>
                                            {u.unit_number}{u.nickname ? ` · ${u.nickname}` : ""}
                                            {occupied ? ` (已被 ${u.occupied_by_order_number} 佔用)` : ""}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  {isAuto && (
                                    <div className={`text-[11px] leading-tight ${remaining === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                      {remaining === 0 ? (
                                        <>
                                          ⚠️ 自動安排無可用{unitNoun}（總 {totalUnits}／被占用 {occupiedByOthers}／本單已用 {siblingPicked.size}）
                                          {occupiedList.length > 0 && (
                                            <div className="mt-0.5">
                                              占用明細：{occupiedList.slice(0, 4).map(u => `${u.unit_number}→#${u.occupied_by_order_number}`).join("、")}
                                              {occupiedList.length > 4 ? ` …+${occupiedList.length - 4}` : ""}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <>剩餘可用 {remaining}／{totalUnits} {unitNoun}　將自動指派：{freeUnits[0]?.unit_number}{freeUnits[0]?.nickname ? ` · ${freeUnits[0].nickname}` : ""}</>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="space-y-1">
                              <Label className="text-xs">金額</Label>
                              <DualCurrencyInput
                                config={secondaryCurrencyConfig}
                                storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange}
                                className="w-full"
                                inputClassName="h-8 text-xs"
                                value={or.room_price}
                                onChange={(newPrice) => {
                                  setEditOrderRooms(prev => prev.map(r => r.id === or.id ? { ...r, room_price: newPrice, unit_price: r.quantity > 0 ? Math.round(newPrice / r.quantity) : newPrice } : r));
                                }}
                              />
                            </div>
                          </div>
                          {showExclusiveConfig && (
                            <div className="p-3 rounded-lg border border-dashed bg-muted/20 space-y-2">
                              <div className="text-xs font-medium">{exclusiveLabel}房間配置</div>
                              <div className={`grid gap-2 ${breakdownItems.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                                {breakdownItems.map(b => {
                                  const val = Number(cfg[b.name]) || 0;
                                  const opts = Array.from({ length: b.max + 1 }, (_, i) => i);
                                  return (
                                    <div key={b.name} className="space-y-1">
                                      <Label className="text-xs">{b.name}間數</Label>
                                      <Select value={String(val)} onValueChange={(v) => setExclusiveConfigAt(exclusiveIdx, b.name, Number(v))}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {opts.map(n => (
                                            <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                將以備註形式儲存：{breakdownItems.map(b => `${b.name} ${Number(cfg[b.name]) || 0} 間`).join("、")}
                              </p>
                            </div>
                          )}
                          </div>
                          );
                        });
                      })()}
                    </>
                  ) : (
                    <>
                      {orderRooms.map((or) => {
                        const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
                        const displayRoomPrice = orderRooms.length === 1 && order.total_price > 0 && savedRoomsTotal !== order.total_price
                          ? order.total_price
                          : or.room_price;
                        return (
                          <div key={or.id} className="p-2.5 rounded-lg border bg-muted/30 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">
                                {or.room_types?.name || "未知房型"}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {or.quantity} 間
                              </Badge>
                            </div>
                            {or.template_name && (
                              <div className="text-xs text-muted-foreground">
                                專案：{or.template_name}
                              </div>
                            )}
                            {or.room_units && (
                              <div className="text-xs text-primary">
                                指派房間：{or.room_units.unit_number}
                                {or.room_units.nickname ? ` · ${or.room_units.nickname}` : ""}
                              </div>
                            )}
                            {displayRoomPrice > 0 && (
                              <div className="text-xs text-muted-foreground text-right">
                                NT$ {displayRoomPrice.toLocaleString()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="text-xs text-right text-muted-foreground">
                        共 {orderRooms.reduce((sum, r) => sum + r.quantity, 0)} 間房
                      </div>
                    </>
                  )}
                </div>
                <Separator />
              </>
            ) : (
              <>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">房型</span>
                  {isEditing ? (
                    <Select
                      value={editForm.room_type_id}
                      onValueChange={async (v) => {
                        setEditForm(f => ({ ...f, room_type_id: v }));
                        // 同步建立一筆 editOrderRooms，切換到新版 UI（含棟號/房號選擇）
                        const selectedRoomType = roomTypes.find(rt => rt.id === v);
                        const dateBasedTotal = await computeRoomTotalByDates(v, null);
                        const unitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(v) || (selectedRoomType?.base_price ?? 0);
                        setEditOrderRooms([{
                          id: `synthetic-${order.id}`,
                          room_type_id: v,
                          quantity: 1,
                          room_price: unitPrice,
                          unit_price: unitPrice,
                          template_name: null,
                          room_unit_id: null,
                        }]);
                      }}
                    >
                      <SelectTrigger className="w-[200px] h-10 text-sm md:h-8 md:text-xs">
                        <SelectValue placeholder="選擇房型" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.map(rt => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.is_exclusive_package ? `【${exclusiveLabel}】` : ""}{rt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-base md:text-base text-right">{order.room_types?.name || "-"}</span>
                  )}
                </div>
                {isEditing && roomTypes.find(rt => rt.id === editForm.room_type_id)?.is_exclusive_package && (
                  <>
                    <Separator />
                    <div className="p-3 rounded-lg border border-dashed bg-muted/20 space-y-2">
                      <div className="text-sm font-medium">{exclusiveLabel}房間配置</div>
                      <div className={`grid gap-2 ${breakdownItems.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                        {breakdownItems.map(b => {
                          const cfg0 = editExclusiveConfigs[0] || {};
                          const val = Number(cfg0[b.name]) || 0;
                          const opts = Array.from({ length: b.max + 1 }, (_, i) => i);
                          return (
                            <div key={b.name} className="space-y-1">
                              <Label className="text-xs">{b.name}間數</Label>
                              <Select value={String(val)} onValueChange={(v) => setExclusiveConfigAt(0, b.name, Number(v))}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {opts.map(n => (
                                    <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        將以備註形式儲存：{breakdownItems.map(b => `${b.name} ${Number((editExclusiveConfigs[0] || {})[b.name]) || 0} 間`).join("、")}
                      </p>
                    </div>
                  </>
                )}
                <Separator />
              </>
            )}
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">入住日期</span>
              <span className="font-medium text-base md:text-base">{order.check_in_date}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">退房日期</span>
              <span className="font-medium text-base md:text-base">{order.check_out_date}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">住宿天數</span>
              <span className="font-medium text-base md:text-base">{nights} 晚</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">入住人數</span>
              {isEditing ? (
                <Input className="w-[100px] h-8 text-sm text-right" type="text" inputMode="numeric" value={editForm.guest_count} onChange={(e) => setEditForm(f => ({ ...f, guest_count: Math.max(1, parseInt(e.target.value) || 1) }))} />
              ) : (
                <span className="font-medium text-base md:text-base">{order.guest_count} 人</span>
              )}
            </div>
            {orderRooms.length === 0 && editOrderRooms.length === 0 && (order.meal_plan || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">專案</span>
                  {isEditing ? (
                    <Select value={editForm.meal_plan} onValueChange={(v) => setEditForm(f => ({ ...f, meal_plan: v }))}>
                      <SelectTrigger className="w-[200px] h-10 text-sm md:h-8 md:text-xs">
                        <SelectValue placeholder="選擇專案" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTemplates.map(t => (
                          <SelectItem key={t.id} value={t.template_name}>{t.template_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-base md:text-base text-right">{getTemplateDisplayName(order.meal_plan)}</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 價格資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg md:text-lg">價格明細</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Multi-room price breakdown */}
            {orderRooms.length > 0 && !isEditing && (
              <>
                {orderRooms.map((or) => {
                  const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
                  const displayRoomPrice = orderRooms.length === 1 && order.total_price > 0 && savedRoomsTotal !== order.total_price
                    ? order.total_price
                    : or.room_price;
                  return (
                    <div key={or.id} className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">
                        {or.room_types?.name || "房型"} × {or.quantity} 間
                      </span>
                      <span className="font-medium text-base md:text-base">NT$ {displayRoomPrice.toLocaleString()}</span>
                    </div>
                  );
                })}
              </>
            )}
            {(() => {
              const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
              const displayTotal = orderRooms.length === 1 && order.total_price > 0 && savedRoomsTotal !== order.total_price
                ? order.total_price
                : (orderRooms.length > 0 ? savedRoomsTotal : order.total_price);
              // 編輯模式始終顯示；檢視模式下僅在無 orderRooms 或多房型時顯示原始金額
              const showInViewMode = orderRooms.length !== 1;
              if (!isEditing && !showInViewMode) return null;
              return (
                <>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">原始金額</span>
                    {isEditing ? (
                      <DualCurrencyInput config={secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" disabled={["paid", "fully_paid"].includes(order.payment_status)} value={editForm.total_price} onChange={(v) => setEditForm(f => ({ ...f, total_price: v }))} />
                    ) : (
                      <span className="font-medium text-base md:text-base">NT$ {displayTotal.toLocaleString()}</span>
                    )}
                  </div>
                </>
              );
            })()}
            {/* 折扣金額與折扣碼 */}
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">折扣金額</span>
              {isEditing ? (
                <DualCurrencyInput config={secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" disabled={["paid", "fully_paid"].includes(order.payment_status) && !canUnlockPaidOrderDiscount} value={editForm.discount_amount} onChange={(v) => setEditForm(f => ({ ...f, discount_amount: v }))} />
              ) : (
                order.discount_amount > 0 ? (
                  <span className="font-medium text-base md:text-base text-destructive">- NT$ {order.discount_amount.toLocaleString()}</span>
                ) : (
                  <span className="font-medium text-base md:text-base">NT$ 0</span>
                )
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">折扣碼</span>
                {isEditing ? (
                  <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right uppercase" type="text" placeholder="選填" disabled={["paid", "fully_paid"].includes(order.payment_status) && !canUnlockPaidOrderDiscount} value={editForm.discount_code} onChange={(e) => { setEditForm(f => ({ ...f, discount_code: e.target.value.toUpperCase() })); setDiscountCodeError(""); }} />
                ) : (
                  order.discount_code ? (
                    <Badge variant="outline" className="text-xs">{order.discount_code}</Badge>
                  ) : (
                    <span className="font-medium text-base md:text-base text-muted-foreground">—</span>
                  )
                )}
              </div>
              {isEditing && discountCodeError && (
                <p className="text-xs text-destructive text-right">{discountCodeError}</p>
              )}
            </div>
            {/* 加購方案金額 - 編輯模式顯示匯總輸入框 */}
            {isEditing && (() => {
              return (
                <>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">加購小計</span>
                    <DualCurrencyInput config={secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" value={editForm.addon_total} onChange={(v) => setEditForm(f => ({ ...f, addon_total: v }))} />
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">額外現場加購金額</span>
                    <DualCurrencyInput
                      config={secondaryCurrencyConfig}
                      storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange}
                      className="w-[150px]"
                      inputClassName="h-10 text-base md:h-8 md:text-sm"
                      placeholder="0"
                      value={editForm.extra_addon_amount || 0}
                      onChange={(v) => setEditForm(f => ({ ...f, extra_addon_amount: v }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm md:text-sm text-muted-foreground">額外現場加購備註</span>
                    <Textarea
                      className="min-h-[60px] text-base md:text-sm"
                      placeholder="例如：加購早餐2份500元、額外床墊1張800元"
                      value={editForm.addon_note}
                      onChange={(e) => setEditForm(f => ({ ...f, addon_note: e.target.value }))}
                    />
                  </div>
                </>
              );
            })()}
            {/* 加購明細 - 檢視模式逐項顯示 */}
            {!isEditing && (() => {
              const customAddons = (order.custom_addon_details as CustomAddonDetail[]) || [];
              const items: { label: string; amount: number }[] = [];
              if (order.pet_plan_price > 0) {
                items.push({ label: `寵物加購 (${order.pet_count || 1}隻)`, amount: order.pet_plan_price });
              }
              if (order.meal_plan_total > 0) {
                items.push({ label: '餐食加購', amount: order.meal_plan_total });
              }
              customAddons.forEach(d => {
                if (d.total > 0) {
                  items.push({ label: `${d.addon_type} (${d.count} × ${d.unit_label || '份'})`, amount: d.total });
                }
              });
              const _notesRaw = order.notes || "";
              const _extraMatch = _notesRaw.match(/【額外現場加購金額[^】]*】\n?(\d+)\n?【額外現場加購金額END】/);
              const extraAmount = _extraMatch ? (parseInt(_extraMatch[1], 10) || 0) : 0;
              if (extraAmount > 0) {
                items.push({ label: '額外現場加購金額', amount: extraAmount });
              }
              const _blocks = [..._notesRaw.matchAll(/【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】/g)];
              const _lineMatch = _notesRaw.match(/^【(?:加購備註|額外現場加購備註)[^】]*】(.*)$/m);
              const addonNote = _blocks.length > 0 ? _blocks[_blocks.length - 1][1].trim() : (_lineMatch ? _lineMatch[1].trim() : "");
              if (items.length === 0 && !addonNote) return null;
              const addonTotal = items.reduce((sum, i) => sum + i.amount, 0);
              return (
                <>
                  <Separator />
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">{item.label}</span>
                      <span className="font-medium text-base md:text-base">NT$ {item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {addonNote && (
                    <div className="flex justify-between items-start gap-2 pt-1">
                      <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">額外現場加購備註</span>
                      <span className="text-sm md:text-sm text-right whitespace-pre-wrap break-words">{addonNote}</span>
                    </div>
                  )}
                  {items.length > 1 && (
                    <div className="flex justify-between items-center gap-2 pt-1">
                      <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">加購小計</span>
                      <span className="font-medium text-base md:text-base">NT$ {addonTotal.toLocaleString()}</span>
                    </div>
                  )}
                </>
              );
            })()}
            <Separator />
            {/* 實收金額 — 與訂單列表一致，直接讀取 orders.final_price */}
            {(() => {
              const effectiveFinalPrice = order.final_price;
              return (
                <>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-sm md:text-sm font-semibold">實收金額</span>
                    <div className="flex flex-col items-end leading-tight">
                      <span className={`font-bold text-lg md:text-lg ${isEditing && (editForm.total_price + editForm.addon_total - editForm.discount_amount) < 0 ? 'text-destructive' : ''}`}>
                        NT$ {isEditing ? (editForm.total_price + editForm.addon_total - editForm.discount_amount).toLocaleString() : effectiveFinalPrice.toLocaleString()}
                      </span>
                      {secondaryCurrencyConfig && (
                        <span className="text-[11px] text-muted-foreground">
                          ≈ {formatSecondary(
                            isEditing
                              ? (editForm.total_price + editForm.addon_total - editForm.discount_amount)
                              : effectiveFinalPrice,
                            secondaryCurrencyConfig
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                   <Separator />
                  {/* 匯款（含舊訂單）：顯示訂金/尾款拆分與各自付款狀態 */}
                  {(() => {
                    const method = (order as any).balance_payment_method || (order as any).deposit_payment_method || (order as any).payment_method;
                    const dep = isEditing ? (editForm.deposit_amount ?? 0) : (order.deposit_amount ?? 0);
                    const finalDisplay = isEditing
                      ? (editForm.total_price + editForm.addon_total - editForm.discount_amount)
                      : (order.final_price ?? 0);
                    const isBankTransfer = method === 'bank_transfer';
                    const isLegacySplit = (order.deposit_amount ?? 0) > 0 && (order.deposit_amount ?? 0) < (order.final_price ?? 0);
                    if (!isBankTransfer && !isLegacySplit) return null;
                    const paid = isEditing ? editForm.paid_amount : (order.paid_amount ?? 0);
                    const depositPaid = order.payment_status === 'deposit_paid' || order.payment_status === 'paid' || (paid >= dep && dep > 0);
                    const balancePaid = order.payment_status === 'paid' || paid >= finalDisplay;
                    const canEditSplit = isEditing;
                    const balance = Math.max(0, finalDisplay - dep);
                    return (
                      <>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂金</span>
                          {canEditSplit ? (
                            <div className="flex items-center gap-2">
                              <Input
                                className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right"
                                type="text"
                                inputMode="numeric"
                                value={dep}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(finalDisplay, parseInt(e.target.value) || 0));
                                  depositRatioRef.current = finalDisplay > 0 ? v / finalDisplay : 0;
                                  setEditForm(f => ({ ...f, deposit_amount: v }));
                                }}
                              />
                              <span className={`text-xs ${depositPaid ? 'text-primary' : 'text-destructive'}`}>
                                {depositPaid ? '已付' : '未付'}
                              </span>
                            </div>
                          ) : (
                            <span className="font-medium text-base md:text-base">
                              NT$ {dep.toLocaleString()}
                              <span className={`ml-2 text-xs ${depositPaid ? 'text-primary' : 'text-destructive'}`}>
                                {depositPaid ? '已付' : '未付'}
                              </span>
                            </span>
                          )}
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">尾款</span>
                          {canEditSplit ? (
                            <div className="flex items-center gap-2">
                              <Input
                                className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right"
                                type="text"
                                inputMode="numeric"
                                value={balance}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(finalDisplay, parseInt(e.target.value) || 0));
                                  const newDep = Math.max(0, finalDisplay - v);
                                  depositRatioRef.current = finalDisplay > 0 ? newDep / finalDisplay : 0;
                                  setEditForm(f => ({ ...f, deposit_amount: newDep }));
                                }}
                              />
                              <span className={`text-xs ${balancePaid ? 'text-primary' : 'text-destructive'}`}>
                                {balancePaid ? '已付' : '未付'}
                              </span>
                            </div>
                          ) : (
                            <span className="font-medium text-base md:text-base">
                              NT$ {balance.toLocaleString()}
                              <span className={`ml-2 text-xs ${balancePaid ? 'text-primary' : 'text-destructive'}`}>
                                {balancePaid ? '已付' : '未付'}
                              </span>
                            </span>
                          )}
                        </div>
                        <Separator />
                      </>
                    );
                  })()}
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">已付金額</span>
                    {isEditing ? (
                      <DualCurrencyInput config={secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" value={editForm.paid_amount} onChange={(v) => setEditForm(f => ({ ...f, paid_amount: v }))} />
                    ) : (
                      <span className="font-medium text-base md:text-base text-primary">NT$ {order.paid_amount.toLocaleString()}</span>
                    )}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">待付金額</span>
                    <span className="font-medium text-base md:text-base text-destructive">
                      NT$ {isEditing
                        ? ((editForm.total_price + editForm.addon_total - editForm.discount_amount) - editForm.paid_amount).toLocaleString()
                        : (effectiveFinalPrice - order.paid_amount).toLocaleString()
                      }
                    </span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ATM 虛擬帳號資訊 */}
      {(() => {
        const o = order as any;
        if (!o?.atm_vacc_no) return null;
        const expireAt = o.atm_expire_at ? new Date(o.atm_expire_at) : null;
        const isExpired = expireAt ? expireAt.getTime() <= Date.now() : false;
        const copyToClipboard = async (text: string, label: string) => {
          try {
            await navigator.clipboard.writeText(text);
            toast({ title: "已複製", description: `${label}已複製到剪貼簿` });
          } catch {
            toast({ title: "複製失敗", variant: "destructive" });
          }
        };
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg md:text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                ATM 虛擬帳號
                {isExpired ? (
                  <Badge variant="outline" className="text-destructive border-destructive/30">已逾期</Badge>
                ) : (
                  <Badge variant="outline" className="text-primary border-primary/30">有效</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-muted-foreground flex-shrink-0">銀行代碼</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-base">{o.atm_vacc_bank_code || "—"}</span>
                  {o.atm_vacc_bank_code && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(o.atm_vacc_bank_code, "銀行代碼")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <Separator />
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-muted-foreground flex-shrink-0">虛擬帳號</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-base tracking-wider">{o.atm_vacc_no}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(o.atm_vacc_no, "虛擬帳號")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-muted-foreground flex-shrink-0">應繳金額</span>
                <span className="font-semibold text-base text-primary">
                  NT$ {Math.max(0, (order.final_price || 0) - (order.paid_amount || 0)).toLocaleString()}
                </span>
              </div>
              {expireAt && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm text-muted-foreground flex-shrink-0">繳費期限</span>
                    <span className={`font-medium text-sm ${isExpired ? "text-destructive" : ""}`}>
                      {format(expireAt, "yyyy-MM-dd HH:mm")}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* 押金管理 */}
      {order && <DepositManagementSection orderId={order.id} />}

      {/* 加購方案 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg md:text-lg">加購方案</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isEditing ? (
            <>
              {/* 寵物方案 - 編輯模式 */}
              {(() => {
                const petAddon = addonSettings.find(a => a.addon_type === 'pet');
                return petAddon ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm font-medium">🐾 {petAddon.description || '寵物方案'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-sm md:text-sm text-muted-foreground">數量（{petAddon.unit_label}）</span>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={editForm.pet_count <= 0}
                          onClick={() => {
                            const count = Math.max(0, editForm.pet_count - 1);
                            setEditForm(f => ({ ...f, pet_count: count, pet_plan_price: count * petAddon.price_per_unit * nights }));
                          }}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{editForm.pet_count}</span>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={editForm.pet_count >= petAddon.max_quantity}
                          onClick={() => {
                            const count = Math.min(petAddon.max_quantity, editForm.pet_count + 1);
                            setEditForm(f => ({ ...f, pet_count: count, pet_plan_price: count * petAddon.price_per_unit * nights }));
                          }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-sm md:text-sm text-muted-foreground">單價</span>
                      <span className="text-base md:text-sm">NT$ {petAddon.price_per_unit.toLocaleString()} / {petAddon.unit_label} / 晚</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                      <span className="font-medium text-sm">NT$ {editForm.pet_plan_price.toLocaleString()}</span>
                    </div>
                    <Separator />
                  </div>
                ) : editForm.pet_count > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm font-medium">🐾 寵物方案</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-sm md:text-sm text-muted-foreground">數量</span>
                      <Input className="w-[100px] h-8 text-sm text-right" type="text" inputMode="numeric" value={editForm.pet_count} onChange={(e) => setEditForm(f => ({ ...f, pet_count: Math.max(0, parseInt(e.target.value) || 0) }))} />
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-sm md:text-sm text-muted-foreground">金額</span>
                      <Input className="w-[120px] h-8 text-sm text-right" type="text" inputMode="numeric" value={editForm.pet_plan_price} onChange={(e) => setEditForm(f => ({ ...f, pet_plan_price: Math.max(0, parseInt(e.target.value) || 0) }))} />
                    </div>
                    <Separator />
                  </div>
                ) : null;
              })()}

              {/* 餐食方案 - 編輯模式 */}
              {(() => {
                const mealAddon = addonSettings.find(a => a.addon_type === 'meal' || a.addon_type === 'bbq');
                return mealAddon ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm font-medium">🍖 {mealAddon.description || '餐食方案'}</span>
                    </div>
                    <div className="pl-2 md:pl-4 space-y-2">
                      {editForm.meal_plan_details.map((detail, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm md:text-sm">
                          <span className="text-muted-foreground flex-shrink-0 w-[90px]">
                            {format(new Date(detail.date), "yyyy/MM/dd")}
                          </span>
                          <Input
                            className="w-[70px] h-7 text-xs text-center"
                            type="text" inputMode="numeric"
                            value={detail.count}
                            onChange={(e) => {
                              const count = Math.max(0, parseInt(e.target.value) || 0);
                              const newDetails = [...editForm.meal_plan_details];
                              newDetails[index] = { ...detail, count, price: count * detail.pricePerUnit };
                              const newTotal = newDetails.reduce((sum, d) => sum + d.price, 0);
                              setEditForm(f => ({ ...f, meal_plan_details: newDetails, meal_plan_total: newTotal }));
                            }}
                          />
                          <span className="text-muted-foreground">份</span>
                          <span className="font-medium ml-auto">NT$ {detail.price.toLocaleString()}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => {
                              const newDetails = editForm.meal_plan_details.filter((_, i) => i !== index);
                              const newTotal = newDetails.reduce((sum, d) => sum + d.price, 0);
                              setEditForm(f => ({ ...f, meal_plan_details: newDetails, meal_plan_total: newTotal }));
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {/* 新增餐食日期按鈕 */}
                      {(() => {
                        // 計算訂單入住期間的日期列表（不含退房日）
                        const checkIn = new Date(order.check_in_date);
                        const checkOut = new Date(order.check_out_date);
                        const existingDates = new Set(editForm.meal_plan_details.map(d => d.date));
                        const availableDates: string[] = [];
                        const current = new Date(checkIn);
                        while (current < checkOut) {
                          const dateStr = format(current, "yyyy-MM-dd");
                          if (!existingDates.has(dateStr)) {
                            availableDates.push(dateStr);
                          }
                          current.setDate(current.getDate() + 1);
                        }
                        return availableDates.length > 0 ? (
                          <Select onValueChange={(dateStr) => {
                            const newDetail: MealPlanDetail = {
                              date: dateStr,
                              count: 1,
                              pricePerUnit: mealAddon.price_per_unit,
                              price: mealAddon.price_per_unit,
                            };
                            const newDetails = [...editForm.meal_plan_details, newDetail].sort((a, b) => a.date.localeCompare(b.date));
                            const newTotal = newDetails.reduce((sum, d) => sum + d.price, 0);
                            setEditForm(f => ({ ...f, meal_plan_details: newDetails, meal_plan_total: newTotal }));
                          }}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="+ 新增日期" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDates.map(d => (
                                <SelectItem key={d} value={d}>{format(new Date(d), "yyyy/MM/dd")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null;
                      })()}
                      {editForm.meal_plan_details.length > 0 && (
                        <>
                          <Separator className="my-2" />
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                            <span className="font-medium text-sm">NT$ {editForm.meal_plan_total.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : editForm.meal_plan_details.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm font-medium">🍖 餐食方案</span>
                    </div>
                    <div className="pl-2 md:pl-4 space-y-2">
                      {editForm.meal_plan_details.map((detail, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm md:text-sm">
                          <span className="text-muted-foreground">{format(new Date(detail.date), "yyyy/MM/dd")} - {detail.count} 份</span>
                          <span className="font-medium ml-auto">NT$ {detail.price.toLocaleString()}</span>
                        </div>
                      ))}
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                        <span className="font-medium text-sm">NT$ {editForm.meal_plan_total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* 其他自訂加購方案 - 編輯模式 */}
              {(() => {
                const genericAddons = addonSettings.filter(a => a.addon_type !== 'pet' && a.addon_type !== 'meal' && a.addon_type !== 'bbq');
                return genericAddons.map((addon, idx) => {
                  const existing = editForm.custom_addon_details.find(d => d.addon_type === addon.addon_type);
                  const count = existing?.count || 0;
                  const total = existing?.total || 0;
                  return (
                    <React.Fragment key={addon.addon_type}>
                      {idx > 0 && <Separator />}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-sm md:text-sm font-medium">📦 {addon.addon_type}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                          <span className="text-sm md:text-sm text-muted-foreground">數量（{addon.unit_label}）</span>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={count <= 0}
                              onClick={() => {
                                const newCount = Math.max(0, count - 1);
                                const newTotal = newCount * addon.price_per_unit * nights;
                                const newDetails = editForm.custom_addon_details.filter(d => d.addon_type !== addon.addon_type);
                                if (newCount > 0) {
                                  newDetails.push({ addon_type: addon.addon_type, count: newCount, price_per_unit: addon.price_per_unit, total: newTotal, unit_label: addon.unit_label });
                                }
                                setEditForm(f => ({ ...f, custom_addon_details: newDetails }));
                              }}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{count}</span>
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={count >= addon.max_quantity}
                              onClick={() => {
                                const newCount = Math.min(addon.max_quantity, count + 1);
                                const newTotal = newCount * addon.price_per_unit * nights;
                                const newDetails = editForm.custom_addon_details.filter(d => d.addon_type !== addon.addon_type);
                                if (newCount > 0) {
                                  newDetails.push({ addon_type: addon.addon_type, count: newCount, price_per_unit: addon.price_per_unit, total: newTotal, unit_label: addon.unit_label });
                                }
                                setEditForm(f => ({ ...f, custom_addon_details: newDetails }));
                              }}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                          <span className="text-sm md:text-sm text-muted-foreground">單價</span>
                          <span className="text-base md:text-sm">NT$ {addon.price_per_unit.toLocaleString()} / {addon.unit_label} / 晚</span>
                        </div>
                        <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                          <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                          <span className="font-medium text-sm">NT$ {total.toLocaleString()}</span>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                });
              })()}

              {(() => {
                const customTotal = editForm.custom_addon_details.reduce((sum, d) => sum + d.total, 0);
                const grandTotal = editForm.pet_plan_price + editForm.meal_plan_total + customTotal;
                return grandTotal > 0 ? (
                  <>
                    <Separator />
                    <div className="flex justify-between items-center gap-2 pt-2">
                      <span className="text-sm md:text-sm font-semibold">加購總計</span>
                      <span className="font-bold text-lg md:text-lg text-primary">
                        NT$ {grandTotal.toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : null;
              })()}

              {editForm.pet_count === 0 && editForm.meal_plan_details.length === 0 && editForm.custom_addon_details.length === 0 && addonSettings.filter(a => a.addon_type !== 'pet' && a.addon_type !== 'meal' && a.addon_type !== 'bbq').length === 0 && addonSettings.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm md:text-sm text-muted-foreground">無可用的加購方案</p>
                </div>
              )}
            </>
          ) : (
            <>
              {(() => {
                const customAddons = (order.custom_addon_details as CustomAddonDetail[]) || [];
                const hasAnyAddon = order.pet_count > 0 || order.meal_plan_total > 0 || customAddons.length > 0;
                if (!hasAnyAddon) {
                  return (
                    <div className="text-center py-4 md:py-6">
                      <p className="text-sm md:text-sm text-muted-foreground">此訂單無加購方案</p>
                    </div>
                  );
                }
                const customTotal = customAddons.reduce((sum, d) => sum + d.total, 0);
                const grandTotal = order.pet_plan_price + order.meal_plan_total + customTotal;
                return (
                  <>
                    {order.pet_count > 0 && (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm md:text-sm font-medium">🐾 寵物方案</span>
                            <Badge variant="outline" className="text-xs">{order.pet_count} 隻 × {nights} 晚</Badge>
                          </div>
                          <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                            <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                            <span className="font-medium text-base md:text-base">NT$ {order.pet_plan_price.toLocaleString()}</span>
                          </div>
                        </div>
                      </>
                    )}

                    {order.meal_plan_total > 0 && order.meal_plan_details && order.meal_plan_details.length > 0 && (
                      <>
                        {order.pet_count > 0 && <Separator />}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm md:text-sm font-medium">🍖 烤肉餐食方案</span>
                          </div>
                          <div className="pl-2 md:pl-4 space-y-2">
                            {order.meal_plan_details.map((detail, index) => (
                              <div key={index} className="flex justify-between items-center gap-2 text-sm md:text-sm">
                                <span className="text-muted-foreground flex-shrink-0">
                                  {format(new Date(detail.date), "yyyy/MM/dd")} - {detail.count} 份
                                </span>
                                <span className="font-medium">NT$ {detail.price.toLocaleString()}</span>
                              </div>
                            ))}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                              <span className="font-medium text-base md:text-base">NT$ {order.meal_plan_total.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {customAddons.map((addon, idx) => (
                      <React.Fragment key={addon.addon_type}>
                        {(idx > 0 || order.pet_count > 0 || order.meal_plan_total > 0) && <Separator />}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm md:text-sm font-medium">📦 {addon.addon_type}</span>
                            <Badge variant="outline" className="text-xs">{addon.count} {addon.unit_label} × {nights} 晚</Badge>
                          </div>
                          <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                            <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                            <span className="font-medium text-base md:text-base">NT$ {addon.total.toLocaleString()}</span>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}

                    <Separator />
                    <div className="flex justify-between items-center gap-2 pt-2">
                      <span className="text-sm md:text-sm font-semibold">加購總計</span>
                      <span className="font-bold text-lg md:text-lg text-primary">
                        NT$ {grandTotal.toLocaleString()}
                      </span>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* 備註 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg md:text-lg">訂單備註</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
              rows={4}
              placeholder="輸入備註..."
              className="text-base md:text-sm"
            />
          ) : (
            (() => {
              // 顯示時：保留加購備註內容（含標題），僅移除技術用 END 標記
              const cleaned = (order.notes || "")
                .replace(/【額外現場加購金額[^】]*】\n?[\s\S]*?\n?【額外現場加購金額END】\n?/g, "")
                .replace(/\n?【(?:加購備註|額外現場加購備註)END】\n?/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
              return cleaned ? (
                <p className="text-sm md:text-sm whitespace-pre-wrap break-words">{cleaned}</p>
              ) : (
                <p className="text-sm md:text-sm text-muted-foreground text-center py-2">無備註</p>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* 變更紀錄 */}
      {order && <OrderAuditLogCard orderId={order.id} refreshKey={(order as any).updated_at || ""} />}


      {/* 線上付款對話框 */}
      <OnlinePaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        order={order ? {
          id: order.id,
          order_number: order.order_number,
          guest_name: order.guest_name,
          guest_phone: order.guest_phone,
          guest_email: order.guest_email,
          final_price: order.final_price,
          payment_status: order.payment_status,
          deposit_amount: order.deposit_amount,
          paid_amount: order.paid_amount,
          accommodation_id: order.accommodation_id,
          payment_method: (order as any).payment_method,
          balance_payment_method: (order as any).balance_payment_method,
        } : null}
        onPaymentSuccess={fetchOrder}
      />

      {/* 取消訂單對話框（含退款選項） */}
      {order && (
        <CancelOrderDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          order={{
            id: order.id,
            order_number: order.order_number,
            paid_amount: order.paid_amount,
            payment_method: (order as any).payment_method,
            deposit_payment_method: (order as any).deposit_payment_method,
            balance_payment_method: (order as any).balance_payment_method,
          }}
          onCancelled={() => navigate(backTo)}
        />
      )}



      {/* 修改金額對話框 */}
      <Dialog open={showPriceEditDialog} onOpenChange={setShowPriceEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改訂單金額</DialogTitle>
            <DialogDescription>修改訂單 {order?.order_number} 的價格明細</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-total-price">原始金額</Label>
              <Input
                id="edit-total-price"
                type="text" inputMode="numeric"
               
                value={editTotalPrice}
                onChange={(e) => setEditTotalPrice(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-discount">折扣金額</Label>
              <Input
                id="edit-discount"
                type="text" inputMode="numeric"
               
                value={editDiscountAmount}
                onChange={(e) => setEditDiscountAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">實收金額</span>
              <span className={`font-bold text-lg ${editFinalPrice < 0 ? 'text-destructive' : ''}`}>
                NT$ {editFinalPrice.toLocaleString()}
              </span>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="edit-deposit">訂金金額</Label>
              <Input
                id="edit-deposit"
                type="text" inputMode="numeric"
               
                value={editDepositAmount}
                onChange={(e) => setEditDepositAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-paid">已付金額</Label>
              <Input
                id="edit-paid"
                type="text" inputMode="numeric"
               
                value={editPaidAmount}
                onChange={(e) => setEditPaidAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="edit-reason">備註</Label>
              <Textarea
                id="edit-reason"
                placeholder="請填寫修改金額的原因..."
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPriceEditDialog(false)}>取消</Button>
            <Button onClick={handleSavePriceEdit} disabled={isSavingPrice}>
              {isSavingPrice ? "儲存中..." : "確認修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {kolQuotaPrompt && (
        <KolQuotaConfirmDialog
          open
          yearMonth={kolQuotaPrompt.yearMonth}
          used={kolQuotaPrompt.used}
          quota={kolQuotaPrompt.quota}
          onCancel={() => { kolQuotaPrompt.resolve(false); setKolQuotaPrompt(null); }}
          onConfirm={() => { kolQuotaPrompt.resolve(true); setKolQuotaPrompt(null); }}
        />
      )}
    </div>
  );
};

export default OrderDetailPage;
