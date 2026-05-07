import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link, useSearchParams as useSearchParamsHook } from "react-router-dom";
import { ArrowLeft, Mail, Home, ShoppingBag, Globe, UserPlus, CreditCard, XCircle, Pencil, Save, X, Minus, Plus, Trash2 } from "lucide-react";
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
import { OnlinePaymentDialog } from "@/components/orders/OnlinePaymentDialog";
import { DepositManagementSection } from "@/components/orders/DepositManagementSection";
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
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  const [roomTemplates, setRoomTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [allTemplates, setAllTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
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
  const [editExclusiveConfigs, setEditExclusiveConfigs] = useState<Array<{ double: number; quad: number }>>([]);
  const setExclusiveConfigAt = useCallback((idx: number, patch: Partial<{ double: number; quad: number }>) => {
    setEditExclusiveConfigs(prev => {
      const next = [...prev];
      while (next.length <= idx) next.push({ double: 0, quad: 0 });
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);
  // 只有森山寫照保留「包區」用語，其餘民宿一律使用「包棟」
  const SENSAN_ACC_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
  // 哈庫納馬塔塔：最多 2 雙人房 + 4 四人房 = 6 間
  const HAKUNA_ACC_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
  // 雲岫海景度假會館：唯一啟用「指派房間（散客單元）」功能的民宿
  const YUNXIU_ACC_ID = "7690a606-6bac-4cd5-a3e7-2fa754b318e8";
  const isSensan = order?.accommodation_id === SENSAN_ACC_ID;
  const isHakuna = order?.accommodation_id === HAKUNA_ACC_ID;
  const isYunxiu = order?.accommodation_id === YUNXIU_ACC_ID;
  const exclusiveLabel = isSensan ? "包區" : "包棟";
  const [roomUnits, setRoomUnits] = useState<RoomUnitOption[]>([]);
  const MAX_TOTAL_ROOMS = isHakuna ? 7 : 6;
  const MAX_DOUBLE_ROOMS = isHakuna ? 2 : 3;
  const MAX_QUAD_ROOMS = isHakuna ? 4 : 3;
  const doubleRoomOptions = Array.from({ length: MAX_DOUBLE_ROOMS + 1 }, (_, i) => i);
  const quadRoomOptions = Array.from({ length: MAX_QUAD_ROOMS + 1 }, (_, i) => i);
  const [depositRatioRef] = useState<{ current: number }>({ current: 0 });
  const [originalDiscountCode] = useState<{ current: string }>({ current: "" });
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

    // 只在「該新房型」的 templates 內找對應方案，避免拿到其他房型的同名/相近 template 而算錯價
    const candidates = allTemplates.filter(t => t.room_type_id === roomTypeId);
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
  });
  const [discountCodeError, setDiscountCodeError] = useState("");
  const [canUnlockPaidOrderDiscount, setCanUnlockPaidOrderDiscount] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkPaidOrderDiscountUnlock = async () => {
      if (!order || !["paid", "fully_paid"].includes(order.payment_status)) {
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
    // 逐行擷取「【包區/包棟房間配置】...」，雙人房/四人房數量分別獨立解析，
    // 容忍分隔符 (、,，/) 與空白差異，缺一邊則視為 0。
    const pkgLineRegex = /【\s*(?:包區|包棟)\s*房間配置\s*】\s*(.+)/;
    const parsedConfigs: Array<{ double: number; quad: number }> = [];
    notesStr.split(/\r?\n/).forEach(line => {
      const lm = line.match(pkgLineRegex);
      if (!lm) return;
      const body = lm[1];
      const dm = body.match(/雙人房\s*(\d+)\s*間?/);
      const qm = body.match(/四人房\s*(\d+)\s*間?/);
      if (!dm && !qm) return;
      parsedConfigs.push({
        double: dm ? parseInt(dm[1]) || 0 : 0,
        quad: qm ? parseInt(qm[1]) || 0 : 0,
      });
    });
    setEditExclusiveConfigs(parsedConfigs);
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
      order_status: order.order_status || "pending",
      payment_status: order.payment_status || "unpaid",
      deposit_payment_method: order.deposit_payment_method || "none",
      balance_payment_method: order.balance_payment_method || "none",
      meal_plan: order.meal_plan || "none",
      notes: order.notes || "",
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
        return petTotal + mealTotal + otherCustom;
      })(),
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
      setEditOrderRooms([]);
    }
    // Store deposit ratio based on original final price
    const savedRoomsTotalForRatio = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
    const effectiveTotal = orderRooms.length === 1 && Number(order.total_price || 0) > 0 && savedRoomsTotalForRatio !== Number(order.total_price || 0)
      ? Number(order.total_price || 0)
      : (orderRooms.length > 0 ? savedRoomsTotalForRatio : (order.total_price || 0));
    const originalFinal = effectiveTotal + ((order.pet_plan_price || 0) + (order.meal_plan_total || 0) + ((order.custom_addon_details as CustomAddonDetail[]) || []).reduce((sum, d) => sum + d.total, 0)) - (order.discount_amount || 0);
    depositRatioRef.current = originalFinal > 0 ? (order.deposit_amount || 0) / originalFinal : 0;
    originalDiscountCode.current = order.discount_code || "";
    setIsEditing(true);
  };

  // Auto-sync addon_total when individual addons change
  useEffect(() => {
    if (!isEditing) return;
    const computed = editForm.pet_plan_price + editForm.meal_plan_total + editForm.custom_addon_details.reduce((sum, d) => sum + d.total, 0);
    if (computed !== editForm.addon_total) {
      setEditForm(f => ({ ...f, addon_total: computed }));
    }
  }, [isEditing, editForm.pet_plan_price, editForm.meal_plan_total, editForm.custom_addon_details]);

  // Auto-sync deposit_amount when final price changes
  // Skip when order is already paid/deposit_paid — deposit must stay locked
  useEffect(() => {
    if (!isEditing || depositRatioRef.current <= 0) return;
    if (order && ["deposit_paid", "paid", "fully_paid"].includes(order.payment_status)) return;
    const newFinal = editForm.total_price + editForm.addon_total - editForm.discount_amount;
    const newDeposit = Math.max(0, Math.round(newFinal * depositRatioRef.current));
    if (newDeposit !== editForm.deposit_amount) {
      setEditForm(f => ({ ...f, deposit_amount: newDeposit }));
    }
  }, [isEditing, editForm.total_price, editForm.addon_total, editForm.discount_amount, order?.payment_status]);

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
    setIsSavingEdit(true);
    try {
      const editFinalPriceCalc = editForm.total_price + editForm.addon_total - editForm.discount_amount;

      // If any edited room is an exclusive package, regenerate one [包區/包棟房間配置] line per 包棟
      const exclusiveRows = editOrderRooms.filter(r => roomTypes.find(t => t.id === r.room_type_id)?.is_exclusive_package);
      let finalNotes = editForm.notes.trim();
      // Strip any existing 包區/包棟房間配置 lines first
      finalNotes = finalNotes
        .split("\n")
        .filter(line => !/^【\s*(?:包區|包棟)\s*房間配置\s*】/.test(line.trim()))
        .join("\n")
        .trim();
      if (exclusiveRows.length > 0) {
        const pkgLines = exclusiveRows.map((_, i) => {
          const cfg = editExclusiveConfigs[i] || { double: 0, quad: 0 };
          return `【${exclusiveLabel}房間配置】雙人房 ${cfg.double} 間、四人房 ${cfg.quad} 間`;
        }).filter(line => /雙人房 [1-9]|四人房 [1-9]/.test(line));
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
      const isDepositLocked = ["deposit_paid", "paid", "fully_paid"].includes(order.payment_status);
      if (!isDepositLocked) updateData.deposit_amount = editForm.deposit_amount;
      // final_price may legitimately change when addons are added/removed on a paid order.
      // Always include it so the total reflects current addons; the DB trigger allows this
      // as long as core financial fields (total_price/discount/deposit) are unchanged.
      addIfChanged("final_price", editFinalPriceCalc, order.final_price);

      // Block disallowed financial edits with friendly toast
      const blocked: string[] = [];
      if (isPaidOrDeposit && Number(editForm.total_price) !== Number(order.total_price ?? 0)) blocked.push("房費金額");
      if (isPaidOrDeposit && !canUnlockPaidOrderDiscount && Number(editForm.discount_amount) !== Number(order.discount_amount ?? 0)) blocked.push("折扣金額");
      if (isDepositLocked && Number(editForm.deposit_amount) !== Number(order.deposit_amount ?? 0)) blocked.push("訂金");
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

        // Insert updated rooms
        const newOrderRooms = editOrderRooms.map(r => {
          const isPackage = !!roomTypes.find(rt => rt.id === r.room_type_id)?.is_exclusive_package;
          return {
            order_id: order.id,
            room_type_id: r.room_type_id,
            quantity: r.quantity,
            room_price: r.room_price,
            template_name: r.template_name,
            // 包棟不需指派單一房間;quantity > 1 也不指派(只指派單間)
            room_unit_id: isPackage || r.quantity !== 1 ? null : (r.room_unit_id || null),
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
          await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: "inline_edit" } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
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
      toast({ title: "訂單已取消", description: `訂單 ${order.order_number} 已成功取消` });
      navigate(backTo);
    } catch (error) {
      console.error("取消訂單失敗:", error);
      toast({ title: "取消失敗", description: "無法取消訂單，請稍後再試", variant: "destructive" });
    } finally {
      setIsCancelling(false);
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
          await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: "price_edit", reason: editReason.trim(), old: oldValues, new: newValues } as any,
          }]);
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
            .select("id, template_name, meal_plans, room_type_id, price, weekday_price, peak_price, weekend_price")
            .eq("accommodation_id", orderData.accommodation_id);

          if (templatesData && templatesData.length > 0) {
            const roomTypeId = orderData.room_type_id;
            const roomTypeTemplates = roomTypeId
              ? templatesData.filter((t: any) => t.room_type_id === roomTypeId)
              : templatesData;
            setRoomTemplates(roomTypeTemplates as any);
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
    const template = roomTemplates.find(t => t.id === planId);
    if (template) return template.template_name;
    // Fallback to meal plan display
    return getMealPlanDisplayName(planId);
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
    { value: "deposit_paid", label: "已付訂金" },
    { value: "paid", label: "已付清" },
    { value: "refunded", label: "已退款" },
    { value: "partial_refunded", label: "部分退款" },
  ];

  const paymentMethodOptions = [
    { value: "none", label: "無" },
    { value: "credit_card", label: "信用卡" },
    { value: "line_pay", label: "LINE Pay" },
    { value: "bank_transfer", label: "轉帳匯款" },
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
              {order.order_status !== 'cancelled' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost-destructive"
                      className="w-full sm:w-auto text-sm"
                      disabled={isCancelling}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      取消訂單
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>確認取消訂單</AlertDialogTitle>
                      <AlertDialogDescription>
                        確定要取消訂單 <span className="font-semibold text-foreground">{order.order_number}</span> 嗎？此操作無法復原。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>返回</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelOrder}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isCancelling ? "取消中..." : "確認取消"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
                <Select value={editForm.order_source} onValueChange={(v) => setEditForm(f => ({ ...f, order_source: v }))}>
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
            {(order.deposit_payment_method || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂金付款方式</span>
                  {isEditing ? (
                    <Select value={editForm.deposit_payment_method} onValueChange={(v) => setEditForm(f => ({ ...f, deposit_payment_method: v }))}>
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
                    <span className="font-medium text-base md:text-base">{getPaymentMethodDisplayName(order.deposit_payment_method)}</span>
                  )}
                </div>
              </>
            )}
            {(order.balance_payment_method || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">尾款付款方式</span>
                  {isEditing ? (
                    <Select value={editForm.balance_payment_method} onValueChange={(v) => setEditForm(f => ({ ...f, balance_payment_method: v }))}>
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
                    <span className="font-medium text-base md:text-base">{getPaymentMethodDisplayName(order.balance_payment_method)}</span>
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
                        {isYunxiu && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={roomTypes.filter(r => !r.is_exclusive_package).length === 0}
                          onClick={async () => {
                            const rt = roomTypes.filter(r => !r.is_exclusive_package)[0];
                            if (!rt) return;
                            const dateBasedTotal = await computeRoomTotalByDates(rt.id, null);
                            const suggestedUnitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(rt.id) || rt.base_price;
                            setEditOrderRooms(prev => [...prev, {
                              id: crypto.randomUUID(),
                              room_type_id: rt.id,
                              quantity: 1,
                              room_price: suggestedUnitPrice,
                              unit_price: suggestedUnitPrice,
                              template_name: null,
                            }]);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          新增散客房
                        </Button>
                        )}
                        {isYunxiu && roomTypes.some(r => r.is_exclusive_package) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={async () => {
                              const rt = roomTypes.filter(r => r.is_exclusive_package)[0];
                              if (!rt) return;
                              const dateBasedTotal = await computeRoomTotalByDates(rt.id, null);
                              const suggestedUnitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(rt.id) || rt.base_price;
                              setEditOrderRooms(prev => [...prev, {
                                id: crypto.randomUUID(),
                                room_type_id: rt.id,
                                quantity: 1,
                                room_price: suggestedUnitPrice,
                                unit_price: suggestedUnitPrice,
                                template_name: null,
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
                          const cfg = exclusiveIdx >= 0 ? (editExclusiveConfigs[exclusiveIdx] || { double: 0, quad: 0 }) : { double: 0, quad: 0 };
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
                            <div className="space-y-1">
                              <Label className="text-xs">專案</Label>
                              <Select
                                value={or.template_name || "none"}
                                onValueChange={async (v) => {
                                  const newTemplate = v === "none" ? "" : v;
                                  // 重新依新方案計算單間總額
                                  const dateBasedTotal = await computeRoomTotalByDates(or.room_type_id, newTemplate);
                                  setEditOrderRooms(prev => prev.map(r => {
                                    if (r.id !== or.id) return r;
                                    if (dateBasedTotal > 0) {
                                      const roomTotal = dateBasedTotal * r.quantity;
                                      const unitPrice = r.quantity > 0 ? Math.round(roomTotal / r.quantity) : roomTotal;
                                      return { ...r, template_name: newTemplate, unit_price: unitPrice, room_price: roomTotal };
                                    }
                                    return { ...r, template_name: newTemplate };
                                  }));
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
                            {(() => {
                              if (!isYunxiu) return null;
                              const isPackage = !!roomTypes.find(rt => rt.id === or.room_type_id)?.is_exclusive_package;
                              if (isPackage || or.quantity !== 1) return null;
                              const availableUnits = roomUnits.filter(u => u.room_type_id === or.room_type_id);
                              if (availableUnits.length === 0) return null;
                              return (
                                <div className="space-y-1">
                                  <Label className="text-xs">指派房間</Label>
                                  <Select
                                    value={or.room_unit_id || "none"}
                                    onValueChange={(v) => setEditOrderRooms(prev => prev.map(r => r.id === or.id ? { ...r, room_unit_id: v === "none" ? null : v } : r))}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="尚未指派" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">尚未指派</SelectItem>
                                      {availableUnits.map(u => {
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
                                </div>
                              );
                            })()}
                            <div className="space-y-1">
                              <Label className="text-xs">金額</Label>
                              <Input
                                className="h-8 text-xs text-right"
                                type="text"
                                inputMode="numeric"
                                value={or.room_price}
                                onChange={(e) => {
                                  const newPrice = Math.max(0, parseInt(e.target.value) || 0);
                                  setEditOrderRooms(prev => prev.map(r => r.id === or.id ? { ...r, room_price: newPrice, unit_price: r.quantity > 0 ? Math.round(newPrice / r.quantity) : newPrice } : r));
                                }}
                              />
                            </div>
                          </div>
                          {showExclusiveConfig && (
                            <div className="p-3 rounded-lg border border-dashed bg-muted/20 space-y-2">
                              <div className="text-xs font-medium">{exclusiveLabel}房間配置</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">雙人房間數</Label>
                                  <Select value={String(cfg.double)} onValueChange={(v) => setExclusiveConfigAt(exclusiveIdx, { double: Number(v) })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {doubleRoomOptions.map(n => (
                                        <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">四人房間數</Label>
                                  <Select value={String(cfg.quad)} onValueChange={(v) => setExclusiveConfigAt(exclusiveIdx, { quad: Number(v) })}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {quadRoomOptions.map(n => (
                                        <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">將以備註形式儲存：雙人房 {cfg.double} 間、四人房 {cfg.quad} 間</p>
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
                    <Select value={editForm.room_type_id} onValueChange={(v) => setEditForm(f => ({ ...f, room_type_id: v }))}>
                      <SelectTrigger className="w-[200px] h-10 text-sm md:h-8 md:text-xs">
                        <SelectValue placeholder="選擇房型" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.map(rt => (
                          <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
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
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">雙人房間數</Label>
                          <Select value={String(editExclusiveConfigs[0]?.double || 0)} onValueChange={(v) => setExclusiveConfigAt(0, { double: Number(v) })}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {doubleRoomOptions.map(n => (
                                <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">四人房間數</Label>
                          <Select value={String(editExclusiveConfigs[0]?.quad || 0)} onValueChange={(v) => setExclusiveConfigAt(0, { quad: Number(v) })}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {quadRoomOptions.map(n => (
                                <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">將以備註形式儲存：雙人房 {editExclusiveConfigs[0]?.double || 0} 間、四人房 {editExclusiveConfigs[0]?.quad || 0} 間</p>
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
            {orderRooms.length === 0 && (order.meal_plan || isEditing) && (
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
                          <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
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
                      <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right" type="text" inputMode="numeric" disabled={["paid", "fully_paid"].includes(order.payment_status)} value={editForm.total_price} onChange={(e) => setEditForm(f => ({ ...f, total_price: Math.max(0, parseInt(e.target.value) || 0) }))} />
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
                <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right" type="text" inputMode="numeric" disabled={["paid", "fully_paid"].includes(order.payment_status) && !canUnlockPaidOrderDiscount} value={editForm.discount_amount} onChange={(e) => setEditForm(f => ({ ...f, discount_amount: Math.max(0, parseInt(e.target.value) || 0) }))} />
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
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">加購方案金額</span>
                    <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right" type="text" inputMode="numeric" value={editForm.addon_total} onChange={(e) => setEditForm(f => ({ ...f, addon_total: Math.max(0, parseInt(e.target.value) || 0) }))} />
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
                  items.push({ label: `${d.addon_type} (${d.count}${d.unit_label || '份'})`, amount: d.total });
                }
              });
              if (items.length === 0) return null;
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
            {/* 實收金額 = total_price - discount + addon（若 addon 未含在 total_price 內） */}
            {(() => {
              const customAddons = (order.custom_addon_details as CustomAddonDetail[]) || [];
              const addonTotal = order.pet_plan_price + order.meal_plan_total + customAddons.reduce((sum, d) => sum + d.total, 0);
              const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
              const effectiveTotalPrice = orderRooms.length === 1 && order.total_price > 0 && savedRoomsTotal !== order.total_price
                ? order.total_price
                : (orderRooms.length > 0 ? savedRoomsTotal : order.total_price);
              // 判斷 total_price 是否已包含加購
              const storedFinalWithoutAddon = effectiveTotalPrice - order.discount_amount;
              const addonAlreadyIncluded = addonTotal > 0 && Math.abs(order.final_price - (storedFinalWithoutAddon + addonTotal)) < 10;
              const effectiveFinalPrice = orderRooms.length > 0
                ? effectiveTotalPrice + addonTotal - order.discount_amount
                : (addonAlreadyIncluded ? order.final_price : order.final_price + addonTotal);
              return (
                <>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm font-semibold">實收金額</span>
                    <span className={`font-bold text-lg md:text-lg ${isEditing && (editForm.total_price + editForm.addon_total - editForm.discount_amount) < 0 ? 'text-destructive' : ''}`}>
                      NT$ {isEditing ? (editForm.total_price + editForm.addon_total - editForm.discount_amount).toLocaleString() : effectiveFinalPrice.toLocaleString()}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂金金額</span>
                    {isEditing ? (
                      <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right" type="text" inputMode="numeric" disabled={["deposit_paid", "paid", "fully_paid"].includes(order.payment_status)} value={editForm.deposit_amount} onChange={(e) => setEditForm(f => ({ ...f, deposit_amount: Math.max(0, parseInt(e.target.value) || 0) }))} />
                    ) : (
                      <span className="font-medium text-base md:text-base">NT$ {order.deposit_amount.toLocaleString()}</span>
                    )}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">已付金額</span>
                    {isEditing ? (
                      <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right" type="text" inputMode="numeric" value={editForm.paid_amount} onChange={(e) => setEditForm(f => ({ ...f, paid_amount: Math.max(0, parseInt(e.target.value) || 0) }))} />
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
            order.notes ? (
              <p className="text-sm md:text-sm whitespace-pre-wrap break-words">{order.notes}</p>
            ) : (
              <p className="text-sm md:text-sm text-muted-foreground text-center py-2">無備註</p>
            )
          )}
        </CardContent>
      </Card>

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
        } : null}
        onPaymentSuccess={fetchOrder}
      />

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
    </div>
  );
};

export default OrderDetailPage;
