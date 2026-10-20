import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation, Link, useSearchParams as useSearchParamsHook } from "react-router-dom";
import { ArrowLeft, Mail, Home, ShoppingBag, Globe, UserPlus, CreditCard, XCircle, Pencil, Save, X, Minus, Plus, Trash2, LogIn, LogOut, Copy, Building2, MoreHorizontal, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@lakeze/shared/components/ui/dropdown-menu";
import { Megaphone } from "lucide-react";
import { CommissionEligibilityExceptionDialog } from "@/components/orders/CommissionEligibilityExceptionDialog";
import { DealDateEditDialog } from "@/components/orders/DealDateEditDialog";
import { isHoldOrder } from "@/lib/holdOrder";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Separator } from "@lakeze/shared/components/ui/separator";
import { Input } from "@lakeze/shared/components/ui/input";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Label } from "@lakeze/shared/components/ui/label";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@lakeze/shared/components/ui/tooltip";
import { getOrderSourceDisplayName, getHotelnabeOtaDisplayName } from "@lakeze/shared/utils/orderHelpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lakeze/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lakeze/shared/components/ui/dialog";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { addonNightsMultiplier, addonPricingSuffix, addonStepUp, addonStepDown } from "@lakeze/shared/lib/addonLabels";
import { savedAddonTotalOf, pureRoomFeeOf } from "@/lib/orderAddonTotal";
import { format, eachDayOfInterval, addDays } from "date-fns";
import { resolveTemplatePricesForDates, type PricingTemplateLite } from "@lakeze/shared/utils/templatePriceResolver";
import { templateMatchesRoomType } from "@/utils/templateRoomMatch";
import { resolveTemplateId } from "@/lib/resolveTemplateId";
import { usePackageChannel } from "@/hooks/use-package-channel";
import { evaluateDiscountCode, notApplicableMessage } from "@lakeze/shared/utils/discountEvaluation";
import { selectTemplatesForRoomType, resolveOrderPackage, roomTemplateKey, roomsChangedSinceOpen, buildInlinePackageSync, type PackageLite, type RoomSnapshotRow } from "@/lib/orderPackageResolution";
import { OrderPackageField, TemplateFallbackWarning, useResetOnRoomTemplateChange } from "@/components/orders/OrderPackageField";
import { resolveOrderProjectDisplayName } from "@lakeze/shared/utils/orderProjectLabel";
import { getOrderPricingTemplateId } from "@/lib/discountScope";
import { useToast } from "@lakeze/shared/hooks/use-toast";
import { useSecondaryCurrency } from "@/hooks/use-secondary-currency";
import { usePackageBreakdown, defaultCountsByNameFromBreakdown, normalizePackageContents } from "@/hooks/use-package-breakdown";
import { formatSecondary } from "@/lib/currency";
import { DualCurrencyInput } from "@/components/ui/dual-currency-input";
import { OnlinePaymentDialog } from "@/components/orders/OnlinePaymentDialog";
import { DepositManagementSection } from "@/components/orders/DepositManagementSection";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import { PayuniRefundStatus } from "@/components/payuni/PayuniRefundStatus";
import OrderTimelineCard from "@/components/orders/OrderTimelineCard";
import OrderManualReviewCard from "@/components/orders/OrderManualReviewCard";


import { OrderAddonSalesCard } from "@/components/orders/OrderAddonSalesCard";
import { OrderAmenityCard } from "@/components/amenities/OrderAmenityCard";


import { computeOrderDiff, computeRoomsDiff, computeExclusiveConfigDiff, computeVisibleNotesDiff, extractAddonNote, extractExtraAddonAmount } from "@/utils/orderAuditDiff";
import { ensureKolQuotaPermit, logKolQuotaOverride, type KolQuotaStatus } from "@/lib/kolReciprocalQuota";
import { KolQuotaConfirmDialog } from "@/components/orders/KolQuotaConfirmDialog";
import { ChangeOrderDatesDialog } from "@/components/orders/ChangeOrderDatesDialog";
import { useStaffPermissions } from "@lakeze/shared/hooks/use-staff-permissions";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { PaidAmountEditDialog, type PaidAmountEditMode } from "@/components/orders/PaidAmountEditDialog";
import { canEditPaidAddon, isPaidAddonFlowOrder } from "@/lib/paidAddonEdit";
import { canShowPaidDiscountEntry, canShowReferralCodeEntry, paidDialogBlockReason, isEditFormDirty, isSettledPaymentStatus } from "@/lib/paidDiscountEdit";
import { getAtmTransferAmount, getAtmDepositPercent, isAtmExpired } from "@lakeze/shared/lib/atmPayment";
import { resolveAddonSetting } from "@/lib/addonAliases";
import {
  buildAdminPriceEditPatch,
  buildCheckinActionPatch,
  buildInlineEditPatch,
} from "@/lib/orderFieldPatches";
import { decideOrderRoomsSave, type SyntheticDecision } from "@/lib/orderRoomsSaveGuard";
import { buildCancelBlockHint, isCancelBlockedError, isCancelBlockedOrder } from "@/lib/cancelEntryGuard";
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
} from "@lakeze/shared/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@lakeze/shared/components/ui/breadcrumb";
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
  refunded_amount?: number | null;
  refund_status?: string | null;
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
  addon_id?: string | null;
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
  template_id: string | null;
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
  template_id: string | null;
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
  pricing_mode?: string | null;
  min_quantity?: number | null;
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

interface OrderDetailPageProps {
  orderId?: string;
  embedded?: boolean;
  onClose?: () => void;
}

const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;

/** 訂金（建立日 +3 天）與尾款（入住日 +3 天，可提前付清）期限判斷，供徽章與說明區共用 */
function getPaymentDeadlineInfo(order: any, isNonPayableCurrency: boolean) {
  const base = order?.payment_link_created_at || order?.created_at;
  const depositDue = base ? new Date(new Date(base).getTime() + 3 * PAYMENT_DAY_MS) : null;
  const balanceDue = order?.check_in_date
    ? new Date(new Date(`${order.check_in_date}T00:00:00+08:00`).getTime() + 3 * PAYMENT_DAY_MS)
    : null;
  const now = Date.now();
  const status = order?.payment_status;

  let effectiveStatus = status;
  let stage: "deposit" | "balance" | "none" = "none";
  let reason = "";

  if (isNonPayableCurrency) {
    reason = "此訂單使用非線上金流幣別，不套用逾期判斷。";
  } else if (["unpaid", "partial"].includes(status)) {
    stage = "deposit";
    if (depositDue && now > depositDue.getTime()) {
      effectiveStatus = "overdue";
      reason = "已超過訂金繳款期限（建立訂單起 3 天）且尚未收到訂金，故顯示已逾期。";
    } else {
      reason = "尚在訂金繳款期限內（建立訂單起 3 天），故維持原付款狀態。";
    }
  } else if (status === "deposit_paid") {
    stage = "balance";
    if (balanceDue && now > balanceDue.getTime()) {
      effectiveStatus = "overdue";
      reason = "訂金已收，但已超過尾款繳款期限（入住日後 3 天），故顯示已逾期。";
    } else {
      reason = "訂金已收，尾款期限為入住日後 3 天（可提前付清），尚未到期，故顯示已付訂金。";
    }
  } else if (status === "paid") {
    reason = "款項已全額付清，不再判斷期限。";
  } else {
    reason = "此付款狀態不套用期限判斷。";
  }

  return { effectiveStatus, stage, reason, depositDue, balanceDue };
}

// savedAddonTotalOf / pureRoomFeeOf 已抽到 @/lib/orderAddonTotal（與 DB calc_order_addon_total 同口徑）


const OrderDetailPage = ({ orderId: orderIdProp, embedded = false, onClose }: OrderDetailPageProps = {}) => {
  const params = useParams<{ orderId: string }>();
  const orderId = orderIdProp ?? params.orderId;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParamsHook();
  const backTo = (location.state as any)?.from || "/admin/orders";
  const goBack = () => {
    if (embedded && onClose) onClose();
    else navigate(backTo);
  };
  const { toast } = useToast();
  const { canEdit: canEditModule, isStaff } = useStaffPermissions();
  const { getLevel: getModuleLevel } = useStaffPermissions();
  const { currentAccommodationId } = useAccommodation();
  // v5.5：已結清訂單的折扣／加購一律走專用 RPC 對話框（不進 inline 儲存流程）
  const [paidAmountDialogMode, setPaidAmountDialogMode] = useState<PaidAmountEditMode | null>(null);
  // 一般訂單改期只允許：admin，或明確為此民宿 staff 且 orders 模組 editable。
  // 其他角色（closer/scout/無角色）不顯示按鈕，避免點下去被後端擋。
  const canEditOrders = isStaff && canEditModule("orders");
  // 訂單（含 order_rooms structural write）唯一 write gate：
  // canEditModule 已包含 hotel_admin / super_admin bypass，不會誤傷 Admin。
  const canManageOrders = canEditModule("orders");
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isSyncingRefund, setIsSyncingRefund] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isRepushingOwlting, setIsRepushingOwlting] = useState(false);
  const [showRepushDialog, setShowRepushDialog] = useState(false);
  const [showMetaDrawer, setShowMetaDrawer] = useState(false);
  const [dealDateOpen, setDealDateOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [kolQuotaPrompt, setKolQuotaPrompt] = useState<{ yearMonth: string; used: number; quota: number; packageName?: string | null; resolve: (v: boolean) => void } | null>(null);
  // V5.5C.1：改為「已付清」但已付金額不足時的三選一提示
  const [paidSyncPrompt, setPaidSyncPrompt] = useState<{ expected: number; current: number } | null>(null);
  const paidSyncOverrideRef = useRef<{ paid_amount?: number; payment_status?: string } | null>(null);
  // 房間明細安全：讀取狀態、合成列確認、刪房確認、進入編輯時的 updated_at
  const [orderRoomsLoaded, setOrderRoomsLoaded] = useState(false);
  const [orderRoomsLoadError, setOrderRoomsLoadError] = useState<string | null>(null);
  const [syntheticRoomPrompt, setSyntheticRoomPrompt] = useState(false);
  const syntheticDecisionRef = useRef<SyntheticDecision>(null);
  const [pendingRemoveRoomId, setPendingRemoveRoomId] = useState<string | null>(null);
  const openedUpdatedAtRef = useRef<string | null>(null);
  const [changeDatesOpen, setChangeDatesOpen] = useState(false);
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  const [roomTemplates, setRoomTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [allRoomTemplates, setAllRoomTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [allTemplates, setAllTemplates] = useState<(PricingTemplateLite & { room_type_id?: string | null })[]>([]);
  // D2 顯示用：orders.package_id 對應的方案名稱（僅顯示，不影響任何寫入）
  const [orderPackageName, setOrderPackageName] = useState<string | null>(null);
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
  // 同步鎖：state 為非同步，連點兩下會在 await 期間同時通過檢查而寫入重複 order_rooms
  const savingEditRef = useRef(false);
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
  const editFormAmountsRef = useRef<{ total_price: number; discount_amount: number; addon_total: number; paid_amount: number; isEditing: boolean }>({ total_price: 0, discount_amount: 0, addon_total: 0, paid_amount: 0, isEditing: false });
  const clearEditAmountsRef = useRef<() => void>(() => {});
  const handleCurrencyModeChange = useCallback(async (m: "TWD" | "SEC") => {
    if (!order?.id) return;
    const code = (await import("@/lib/orderDisplayCurrency")).modeToCurrencyCode(m, secondaryCurrencyConfig?.code);
    const currentUpper = (orderDisplayCurrency || "TWD").toUpperCase();
    if (currentUpper === code.toUpperCase()) return;
    const { total_price, discount_amount, addon_total, paid_amount, isEditing: editing } = editFormAmountsRef.current;
    const hasAmounts = editing && [total_price, discount_amount, addon_total, paid_amount].some(v => Number(v) > 0);
    if (hasAmounts) {
      const ok = window.confirm(`切換幣別會清空目前的金額 / 折扣 / 加購 / 已收金額（避免 NT$ 與 ${secondaryCurrencyConfig?.symbol || "外幣"} 混算錯誤）。確定切換嗎？`);
      if (!ok) return;
      clearEditAmountsRef.current();
    }
    setOrderDisplayCurrency(code);
    try {
      await (await import("@/lib/orderDisplayCurrency")).setOrderDisplayCurrency(order.id, code);
    } catch (e: any) {
      console.error("[displayCurrency] failed", e);
      toast({
        variant: "destructive",
        title: "幣別切換失敗",
        description: e?.message || "幣別標記未能寫入，請稍後再試。",
      });
    }
  }, [order?.id, secondaryCurrencyConfig?.code, secondaryCurrencyConfig?.symbol, orderDisplayCurrency, toast]);

  // 訂單顯示貨幣前綴（旅行日 JPY 時原幣顯示，其他 TWD）
  const orderCurrencyPrefix = useMemo(() => {
    if (!secondaryCurrencyConfig) return "NT$";
    const cur = (orderDisplayCurrency || "TWD").toUpperCase();
    return cur === secondaryCurrencyConfig.code.toUpperCase() ? secondaryCurrencyConfig.symbol : "NT$";
  }, [orderDisplayCurrency, secondaryCurrencyConfig]);
  const isRawCurrency = !!secondaryCurrencyConfig;
  // 旅行日 JPY 訂單：純內部記帳，不走任何第三方金流
  const isNonPayableCurrency = useMemo(() => {
    const cur = (orderDisplayCurrency || "").toUpperCase();
    return cur !== "" && cur !== "TWD";
  }, [orderDisplayCurrency]);
  const exclusiveLabel = isSensan ? "包區" : "包棟";
  const [roomUnits, setRoomUnits] = useState<RoomUnitOption[]>([]);
  // DB-driven 包棟組成（HQ 房型與包棟設定）。沒設定 → fallback 舊三家 hardcoded。
  // 每一筆包棟房間各自依自己的 room_type_id 取組成，不再整頁共用第一筆。
  const fallbackBreakdownItems = useMemo<Array<{ name: string; max: number }>>(() => {
    const maxDouble = isHakuna ? 2 : isOlivia ? 8 : 3;
    const maxQuad = isHakuna ? 4 : isOlivia ? 1 : 3;
    return [
      { name: "雙人房", max: maxDouble },
      { name: "四人房", max: maxQuad },
    ];
  }, [isHakuna, isOlivia]);
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
    const candidates = allTemplates.filter(t => templateMatchesRoomType(t as any, roomTypeId));
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

  // 對應方案同步：改了房型／專案才依第一間房專案重算 package_id 與 pricing_template_id
  const packageChannel = usePackageChannel(order?.accommodation_id);
  const [accommodationPackages, setAccommodationPackages] = useState<PackageLite[]>([]);
  const [editPackagePick, setEditPackagePick] = useState("");
  const [fallbackConfirmed, setFallbackConfirmed] = useState(false);
  const openedRoomsRef = useRef<RoomSnapshotRow[]>([]);
  useEffect(() => {
    if (!order?.accommodation_id) return;
    supabase
      .from("accommodation_packages")
      .select("id, name, guest_count, primary_room_type_id, room_type_ids")
      .eq("accommodation_id", order.accommodation_id)
      .eq("enabled", true)
      .order("display_order", { ascending: true })
      .then(({ data }) => setAccommodationPackages((data as PackageLite[]) || []));
  }, [order?.accommodation_id]);
  const editRoomPicks = useMemo(
    () => editOrderRooms.map(r => ({
      room_type_id: r.room_type_id,
      template_id: resolveTemplateId(allTemplates as any, r.room_type_id, r.template_name, r.template_id) || "",
    })),
    [editOrderRooms, allTemplates],
  );
  const editRoomsChanged = isEditing && roomsChangedSinceOpen(openedRoomsRef.current, editOrderRooms);
  // 進入編輯、初始同步完成後的表單快照，用來判斷是否有未儲存修改
  const editBaselineRef = useRef<string | null>(null);
  const editFormLatestRef = useRef(editForm);
  editFormLatestRef.current = editForm;
  useEffect(() => {
    if (!isEditing) { editBaselineRef.current = null; return; }
    const t = setTimeout(() => { editBaselineRef.current = JSON.stringify(editFormLatestRef.current); }, 400);
    return () => clearTimeout(t);
  }, [isEditing]);
  const editPackageResolution = useMemo(
    () => resolveOrderPackage({ rooms: editRoomPicks, templates: allTemplates as any, packages: accommodationPackages, hasChannel: packageChannel.showPackageField }),
    [editRoomPicks, allTemplates, accommodationPackages, packageChannel.showPackageField],
  );
  const editRoomTplKey = roomTemplateKey(editRoomPicks);
  useResetOnRoomTemplateChange(editRoomTplKey.key, editRoomTplKey.complete, () => { if (editRoomsChanged) setEditPackagePick(""); });
  const editStayDates = useMemo(() => {
    if (!order?.check_in_date || !order?.check_out_date) return [] as string[];
    const start = new Date(order.check_in_date);
    const end = new Date(order.check_out_date);
    if (!(start < end)) return [];
    return eachDayOfInterval({ start, end: addDays(end, -1) }).map(d => format(d, "yyyy-MM-dd"));
  }, [order?.check_in_date, order?.check_out_date]);
  const editFallbackRoomTypeIds = useMemo(() => {
    if (!editRoomsChanged) return [] as string[];
    return Array.from(new Set(editOrderRooms.map(r => r.room_type_id))).filter(id => {
      const src = selectTemplatesForRoomType(allTemplates as any, id, editStayDates).source;
      return !!id && (src === "fallback_all" || src === "empty");
    });
  }, [editRoomsChanged, editOrderRooms, allTemplates, editStayDates]);
  const editFallbackKey = editFallbackRoomTypeIds.join(",");
  useEffect(() => { setFallbackConfirmed(false); }, [editFallbackKey]);

  // Load 包棟方案的內含房間清單（room_types.package_contents）
  // 每一筆編輯中的包棟房間各自查自己的房型；另含訂單原本／編輯中的 room_type_id（單房型畫面用）。
  const breakdownRoomTypeIds = useMemo(() => {
    const ids = editOrderRooms
      .filter(r => roomTypes.find(t => t.id === r.room_type_id)?.is_exclusive_package)
      .map(r => r.room_type_id);
    if (order?.room_type_id) ids.push(order.room_type_id);
    if (editForm.room_type_id) ids.push(editForm.room_type_id);
    return ids;
  }, [editOrderRooms, roomTypes, order?.room_type_id, editForm.room_type_id]);

  const { getBreakdown } = usePackageBreakdown(breakdownRoomTypeIds);

  /** 取得「某一筆房間」該顯示的組成欄位（有 DB 設定用 DB，否則 fallback 舊三家 hardcoded） */
  const getBreakdownItemsFor = useCallback(
    (roomTypeId?: string | null): Array<{ name: string; max: number }> => {
      const items = getBreakdown(roomTypeId);
      if (items && items.length > 0) return items.map(b => ({ name: b.name, max: b.count }));
      return fallbackBreakdownItems;
    },
    [getBreakdown, fallbackBreakdownItems],
  );
  /** 訂單標題區（單一房型畫面）的組成欄位：依編輯中的 room_type_id */
  const headerBreakdownItems = useMemo(
    () => getBreakdownItemsFor(editForm.room_type_id),
    [getBreakdownItemsFor, editForm.room_type_id],
  );

  /**
   * 「換成新包棟房型」當下帶入該房型 package_contents 的預設間數。
   * 只在切換房型這一次動作呼叫；初次開啟訂單沿用備註既有數值，之後渲染也不會覆蓋手動值。
   */
  const applyExclusiveDefaultsOnRoomTypeChange = useCallback(
    async (roomsAfterChange: Array<{ id: string; room_type_id: string }>, rowId: string, newRoomTypeId: string) => {
      const rt = roomTypes.find(t => t.id === newRoomTypeId);
      if (!rt?.is_exclusive_package) return;
      const exclusiveIds = roomsAfterChange
        .filter(r => roomTypes.find(t => t.id === r.room_type_id)?.is_exclusive_package)
        .map(r => r.id);
      const idx = exclusiveIds.indexOf(rowId);
      if (idx < 0) return;
      let items = getBreakdown(newRoomTypeId);
      if (!items) {
        const { data } = await supabase
          .from("room_types")
          .select("package_contents")
          .eq("id", newRoomTypeId)
          .maybeSingle();
        const normalized = normalizePackageContents((data as any)?.package_contents);
        items = normalized.length > 0 ? normalized : null;
      }
      const defaults = items ? defaultCountsByNameFromBreakdown(items) : {};
      setEditExclusiveConfigs(prev => {
        const next = [...prev];
        while (next.length <= idx) next.push({});
        next[idx] = defaults;
        return next;
      });
    },
    [roomTypes, getBreakdown],
  );
  // Sync amount refs for the currency-toggle guard defined above
  useEffect(() => {
    editFormAmountsRef.current = {
      total_price: Number(editForm.total_price) || 0,
      discount_amount: Number(editForm.discount_amount) || 0,
      addon_total: Number(editForm.addon_total) || 0,
      paid_amount: Number(editForm.paid_amount) || 0,
      isEditing,
    };
    clearEditAmountsRef.current = () => setEditForm(f => ({ ...f, total_price: 0, discount_amount: 0, addon_total: 0, paid_amount: 0 }));
  }, [editForm.total_price, editForm.discount_amount, editForm.addon_total, editForm.paid_amount, isEditing]);
  const [discountCodeError, setDiscountCodeError] = useState("");
  const [discountCodeNote, setDiscountCodeNote] = useState("");
  // 已結清訂單的折扣一律改由「修改金額」對話框處理（權限：/admin 同館訂單模組 editable），
  // inline 編輯不再提供已付款折扣修改入口，避免與房型重建流程耦合。
  const INLINE_PAID_DISCOUNT_EDITABLE = false;

  const startEditing = () => {
    if (!order) return;
    // readonly / 無權限：不得進入編輯模式（房間新增、移除、rebuild 皆在編輯模式內）
    if (!canManageOrders) {
      toast({
        title: "權限不足",
        description: "您目前對「訂單」模組僅有檢視權限，無法編輯訂單。",
        variant: "destructive",
      });
      return;
    }
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
    const savedCustomAddons = (order.custom_addon_details as CustomAddonDetail[]) || [];
    const savedPetFromCustom = savedCustomAddons
      .filter(d => d.addon_type === 'pet')
      .reduce((sum, d) => sum + d.total, 0);
    const savedMealFromCustom = savedCustomAddons
      .filter(d => d.addon_type === 'meal')
      .reduce((sum, d) => sum + d.total, 0);
    const savedOtherCustom = savedCustomAddons
      .filter(d => d.addon_type !== 'pet' && d.addon_type !== 'meal' && d.addon_type !== 'bbq')
      .reduce((sum, d) => sum + d.total, 0);
    const savedExtraMatch = (order.notes || "").match(/【額外現場加購金額[^】]*】\n?(\d+)\n?【額外現場加購金額END】/);
    const savedExtraAddon = savedExtraMatch ? parseInt(savedExtraMatch[1], 10) || 0 : 0;
    const savedAddonTotal =
      ((order.pet_plan_price || 0) > 0 ? order.pet_plan_price : savedPetFromCustom) +
      ((order.meal_plan_total || 0) > 0 ? order.meal_plan_total : savedMealFromCustom) +
      savedOtherCustom +
      savedExtraAddon;
    // 新訂單的 total_price 已含加購；舊訂單則可能未含。以已存 final_price 判斷，
    // 編輯欄位一律轉成「純房費」，避免畫面再次把同一筆加購加上去。
    const totalAlreadyIncludesAddons = Math.abs(
      Number(order.final_price || 0) - (Number(order.total_price || 0) - Number(order.discount_amount || 0)),
    ) <= 1;
    const editableRoomPrice = Math.max(
      0,
      Number(order.total_price || 0) - (totalAlreadyIncludesAddons ? savedAddonTotal : 0),
    );

    setEditForm({
      guest_name: order.guest_name || "",
      guest_phone: order.guest_phone || "",
      guest_email: order.guest_email || "",
      guest_address: order.guest_address || "",
      guest_gender: order.guest_gender || "",
      guest_nationality: order.guest_nationality || "",
      guest_count: order.guest_count || 1,
      order_source: order.order_source || "website",
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
      total_price: editableRoomPrice,
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
      // 同時把改名前的舊快照（例如「加床服務」）對應回現行設定並合併數量，避免出現兩筆重複加購。
      custom_addon_details: (() => {
        const raw = ((order.custom_addon_details as CustomAddonDetail[]) || [])
          .filter(d => d.addon_type !== 'pet' && d.addon_type !== 'meal' && d.addon_type !== 'bbq');
        const merged: CustomAddonDetail[] = [];
        for (const d of raw) {
          const matched = resolveAddonSetting(d, addonSettings);
          const canonical: CustomAddonDetail = matched
            ? { ...d, addon_id: matched.id, addon_type: matched.addon_type }
            : d;
          const hit = merged.find(m =>
            (canonical.addon_id && m.addon_id === canonical.addon_id) || m.addon_type === canonical.addon_type,
          );
          if (hit) {
            hit.count += canonical.count;
            hit.total += canonical.total;
          } else {
            merged.push({ ...canonical });
          }
        }
        return merged;
      })(),

      addon_total: savedAddonTotal,
      addon_note: extractAddonNote(order.notes),
      extra_addon_amount: extractExtraAddonAmount(order.notes),
    });
    // 進入編輯時的房間快照：之後只有房型／專案／房間數真的改變才同步對應方案
    openedRoomsRef.current = orderRooms.map(or => ({ room_type_id: or.room_type_id, template_id: or.template_id ?? null, template_name: or.template_name }));
    setEditPackagePick((order as any).package_id || "");
    setFallbackConfirmed(false);
    // Initialize edit order rooms
    if (orderRooms.length > 0) {
      const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
      const shouldUseOrderTotalForSingleRoom = orderRooms.length === 1 && editableRoomPrice > 0 && savedRoomsTotal !== editableRoomPrice;
      const normalizedRooms = orderRooms.map((or) => {
        const correctedRoomPrice = shouldUseOrderTotalForSingleRoom ? editableRoomPrice : Number(or.room_price || 0);
        const unitPrice = getRoomUnitPrice(correctedRoomPrice, or.quantity);
        return {
          id: or.id,
          room_type_id: or.room_type_id,
          quantity: or.quantity,
          room_price: correctedRoomPrice,
          unit_price: unitPrice,
          template_id: or.template_id ?? null,
          template_name: or.template_name,
          room_unit_id: or.room_unit_id ?? null,
        };
      });

      setEditOrderRooms(normalizedRooms);
      const roomsTotal = shouldUseOrderTotalForSingleRoom
        ? editableRoomPrice
        : normalizedRooms.reduce((sum, r) => sum + r.room_price, 0);
      setEditForm(f => ({ ...f, total_price: roomsTotal }));
    } else {
      // 保留單 / 舊單沒有 order_rooms：若有 room_type_id，從訂單合成一筆，存檔時會寫回 order_rooms，與一般新建訂單一致
      if (order.room_type_id && orderRoomsLoaded) {
        const syntheticPrice = Number(order.total_price || 0);
        setEditOrderRooms([{
          id: `synthetic-${order.id}`,
          room_type_id: order.room_type_id,
          quantity: 1,
          room_price: syntheticPrice,
          unit_price: syntheticPrice,
          template_id: null,
          template_name: null,
          room_unit_id: null,
        }]);
      } else {
        setEditOrderRooms([]);
      }
    }
    // Store deposit ratio based on original final price
    const savedRoomsTotalForRatio = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
    const effectiveTotal = orderRooms.length === 1 && editableRoomPrice > 0 && savedRoomsTotalForRatio !== editableRoomPrice
      ? editableRoomPrice
      : (orderRooms.length > 0 ? savedRoomsTotalForRatio : editableRoomPrice);
    // 訂金比例僅以「房費 - 折扣」為基準，加購方案不影響訂金
    const originalBase = Math.max(0, effectiveTotal - (order.discount_amount || 0));
    const existingRatio = originalBase > 0 ? (order.deposit_amount || 0) / originalBase : 0;
    // Fallback to accommodation default deposit ratio when order has no deposit yet
    depositRatioRef.current = existingRatio > 0 ? existingRatio : defaultDepositRatio;
    originalDiscountCode.current = order.discount_code || "";
    openedUpdatedAtRef.current = (order as any).updated_at ?? null;
    syntheticDecisionRef.current = null;
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
      setDiscountCodeError(""); setDiscountCodeNote("");
      // Only clear discount if the user explicitly removed an existing code.
      // If the order never had a code (manual discount), preserve the amount.
      if (originalCode) {
        setEditForm(f => ({ ...f, discount_amount: 0 }));
      }
      return;
    }

    // If the discount code hasn't changed from the original, preserve the saved discount_amount
    if (code === originalCode) {
      setDiscountCodeError(""); setDiscountCodeNote("");
      return;
    }

    const timer = setTimeout(async () => {
      setDiscountCodeError("");
      setDiscountCodeNote("");
      const base = editForm.total_price + editForm.addon_total;
      // Use the primary room_type_id for validation
      const roomTypeId = editForm.room_type_id || (editOrderRooms.length > 0 ? editOrderRooms[0].room_type_id : null) || order.room_type_id || null;
      const checkInDate = order.check_in_date || null;
      const pricingTemplateId = await getOrderPricingTemplateId(order.id);

      try {
        const result = await evaluateDiscountCode((fn, args) => supabase.rpc(fn as any, args as any) as any, {
          code: code.toUpperCase(),
          accommodationId: order.accommodation_id,
          orderAmount: base,
          roomTypeId,
          checkInDate,
          pricingTemplateId,
        });

        if (!result) {
          setDiscountCodeError("驗證折扣碼失敗");
          return;
        }

        if (result.status === "not_applicable") {
          // 碼有效但此方案不適用：記錄推薦碼、折扣 0（可存檔）
          setDiscountCodeNote(notApplicableMessage(result));
          setEditForm(f => ({ ...f, discount_amount: 0 }));
          return;
        }
        if (result.status === "invalid") {
          setDiscountCodeError(result.message || "此折扣碼不存在");
          setEditForm(f => ({ ...f, discount_amount: 0 }));
          return;
        }

        let newDiscount = 0;
        if (result.discountType === "percentage") {
          newDiscount = Math.round(base * (result.discountValue ?? 0) / 100);
        } else {
          newDiscount = Math.min(result.discountValue ?? 0, base);
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
    // 以「純房費」為準（total_price 含加購，直接拿來當房費會重複計入加購而誤觸金額鎖）
    const savedRoomFee = pureRoomFeeOf(order);
    const shouldUseOrderTotalForSingleRoom = orderRooms.length === 1 && savedRoomFee > 0 && savedRoomsTotal !== savedRoomFee;
    const normalizedRooms = orderRooms.map((or) => {
      const correctedRoomPrice = shouldUseOrderTotalForSingleRoom ? savedRoomFee : Number(or.room_price || 0);
      const unitPrice = getRoomUnitPrice(correctedRoomPrice, or.quantity);
      return {
        id: or.id,
        room_type_id: or.room_type_id,
        quantity: or.quantity,
        room_price: correctedRoomPrice,
        unit_price: unitPrice,
        template_id: or.template_id ?? null,
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
    if (!isEditing || !order || !orderRoomsLoaded) return;
    if (editOrderRooms.length > 0 || orderRooms.length > 0) return;
    if (!editForm.room_type_id) return;
    const syntheticPrice = Number(order.total_price || 0);
    setEditOrderRooms([{
      id: `synthetic-${order.id}`,
      room_type_id: editForm.room_type_id,
      quantity: 1,
      room_price: syntheticPrice,
      unit_price: syntheticPrice,
      template_id: null,
      template_name: null,
      room_unit_id: null,
    }]);
  }, [isEditing, order, editForm.room_type_id, orderRooms.length, editOrderRooms.length, orderRoomsLoaded]);

  useEffect(() => {
    if (embedded) return; // Ignore URL editing flag in embedded (tab) mode
    if (searchParams.get("editing") === "true" && order && !isEditing && (orderRoomsLoaded || orderRoomsLoadError)) {
      // 等 order_rooms 讀取完成（或確定失敗）才進入編輯，避免以 0 筆合成假房間
      startEditing();
      const next = new URLSearchParams(searchParams);
      next.delete("editing");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, order, orderRooms, embedded, orderRoomsLoaded, orderRoomsLoadError]);

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    // 合成列的選擇只用於這一次存檔：先取出再清空，任何結束路徑（成功、失敗、中途返回）都不會沿用
    const syntheticDecision = syntheticDecisionRef.current;
    syntheticDecisionRef.current = null;
    if (!order || isSavingEdit || savingEditRef.current) return;
    // 硬守門：任何 orders / order_rooms 寫入前先擋掉無編輯權限者
    if (!canManageOrders) {
      toast({
        title: "權限不足",
        description: "您目前對「訂單」模組僅有檢視權限，無法儲存變更。",
        variant: "destructive",
      });
      return;
    }
    // 團購／信用卡訂單不得由內嵌編輯直接改成「已取消」，必須走專屬取消流程
    if (
      editForm.order_status === "cancelled" &&
      order.order_status !== "cancelled" &&
      isCancelBlockedOrder(order as any)
    ) {
      toast({
        title: "此訂單不能在這裡取消",
        description: buildCancelBlockHint(order as any),
        variant: "destructive",
      });
      return;
    }
    const roomsAction = decideOrderRoomsSave({
      roomsLoaded: orderRoomsLoaded,
      savedRoomCount: orderRooms.length,
      editRoomIds: editOrderRooms.map(r => r.id),
      syntheticDecision,
    });
    if (roomsAction.kind === "block") {
      toast({
        title: "房間明細不可為 0 間",
        description: "此訂單原本有房間明細，請至少保留一間房再儲存；若要取消訂單請改用取消流程。",
        variant: "destructive",
      });
      return;
    }
    if (roomsAction.kind === "confirm_synthetic") {
      setSyntheticRoomPrompt(true);
      return;
    }
    // V5.5C.1：本次存檔正要把付款狀態改成「已付清」，但已付金額低於應收 → 先問清楚
    if (!paidSyncOverrideRef.current) {
      const FULLY_PAID = ["paid", "fully_paid"];
      const savedTotalForCheck = editForm.total_price + editForm.addon_total;
      const calcFinalForCheck = savedTotalForCheck - editForm.discount_amount;
      const pricingUnchangedForCheck =
        Number(savedTotalForCheck) === Number(order.total_price ?? 0) &&
        Number(editForm.discount_amount) === Number(order.discount_amount ?? 0) &&
        Number(editForm.addon_total) === Number(savedAddonTotalOf(order));
      const expectedFinal = pricingUnchangedForCheck ? Number(order.final_price ?? 0) : calcFinalForCheck;
      const willBeFullyPaid = FULLY_PAID.includes(editForm.payment_status);
      const wasFullyPaid = FULLY_PAID.includes(order.payment_status);
      if (willBeFullyPaid && !wasFullyPaid && Number(editForm.paid_amount) < expectedFinal) {
        setPaidSyncPrompt({ expected: expectedFinal, current: Number(editForm.paid_amount) });
        return;
      }
    }
    if (discountCodeError && editForm.discount_code.trim() && editForm.discount_code.trim() !== (originalDiscountCode.current || "").trim()) {
      toast({ title: "折扣碼無效", description: discountCodeError, variant: "destructive" });
      return;
    }
    if (roomsAction.kind === "sync" && editFallbackRoomTypeIds.length > 0 && !fallbackConfirmed) {
      toast({ title: "請確認專案", description: "此房型在入住日沒有對應專案，請勾選確認所選專案正確後再儲存", variant: "destructive" });
      return;
    }
    // 房型／專案沒變 → null，存檔完全不碰 package_id／pricing_template_id
    const packageSync = roomsAction.kind === "sync"
      ? buildInlinePackageSync({
          opened: openedRoomsRef.current,
          current: editOrderRooms,
          firstRoomTemplateId: editRoomPicks[0]?.template_id || null,
          resolution: editPackageResolution,
          manualPick: editPackagePick,
        })
      : null;
    savingEditRef.current = true;
    try {

    // KOL 互惠額度檢查（編輯時：若來源改為/維持 'kol'，依入住日歸屬月份）
    let kolOverrideStatus: KolQuotaStatus | null = null;
    const kolPermitted = await ensureKolQuotaPermit({
      accommodationId: order.accommodation_id,
      orderSource: editForm.order_source,
      checkInDate: order.check_in_date,
      packageId: packageSync ? packageSync.package_id : (order as any).package_id ?? null,
      packageIds: [
        packageSync ? packageSync.package_id : (order as any).package_id ?? null,
        order?.room_type_id ?? null,
        ...editOrderRooms
          .filter((r) => roomTypes.find((t) => t.id === r.room_type_id)?.is_exclusive_package)
          .map((r) => r.room_type_id),
      ],
      excludeOrderId: order.id,
      isAdmin: isAdminUser,
      confirmOverride: (status) =>
        new Promise<boolean>((resolve) => {
          setKolQuotaPrompt({
            yearMonth: status.yearMonth,
            used: status.used,
            quota: status.quota!,
            packageName: status.packageName,
            resolve,
          });
        }),
      onOverride: (status) => { kolOverrideStatus = status; },
    });
    if (!kolPermitted) { savingEditRef.current = false; return; }

    setIsSavingEdit(true);
    try {
      const savedTotalPrice = editForm.total_price + editForm.addon_total;
      const editFinalPriceCalc = savedTotalPrice - editForm.discount_amount;
      // V5.5C.1：使用者在提示框做出的選擇（補足已付金額 / 改回已付訂金）優先於表單值
      const effPaymentStatus = paidSyncOverrideRef.current?.payment_status ?? editForm.payment_status;
      const effPaidAmount = paidSyncOverrideRef.current?.paid_amount ?? editForm.paid_amount;

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
          const parts = getBreakdownItemsFor(exclusiveRows[i]?.room_type_id)
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

      const isPaidOrDeposit = ["paid", "fully_paid"].includes(order.payment_status);
      const originalAddonTotal = savedAddonTotalOf(order);

      // Block disallowed financial edits with friendly toast
      // 注意：total_price 內含加購金額，因此只比對「純房費」部分，
      // 讓已結清訂單仍可調整加購項目（DB trigger 亦採相同判斷）。
      // 舊訂單的 total_price 可能未含加購，改用與編輯欄位相同的「純房費」口徑，避免誤擋。
      const originalRoomFee = pureRoomFeeOf(order);
      const blocked: string[] = [];
      // super_admin 可修改已結清訂單的房費（DB trigger 亦放行）
      if (isPaidOrDeposit && !isSuperAdmin && Number(editForm.total_price) !== Number(originalRoomFee)) blocked.push("房費金額");
      if (isPaidOrDeposit && Number(editForm.discount_amount) !== Number(order.discount_amount ?? 0)) blocked.push("折扣金額");
      if (isPaidOrDeposit && (editForm.discount_code.trim() || "") !== (order.discount_code || "")) blocked.push("折扣碼");
      // v5.5：已結清訂單的加購一律走 update_paid_order_addons_v2，一般 Save 不得夾帶加購值
      if (isPaidOrDeposit) {
        const savedExtra = extractExtraAddonAmount(order.notes || "");
        const savedNote = extractAddonNote(order.notes || "");
        if (Number(editForm.addon_total) !== Number(savedAddonTotalOf(order))) blocked.push("加購金額");
        if (Number(editForm.extra_addon_amount || 0) !== Number(savedExtra || 0)) blocked.push("額外現場加購金額");
        if ((editForm.addon_note || "").trim() !== (savedNote || "").trim()) blocked.push("額外現場加購備註");
      }
      if (blocked.length > 0) {
        toast({
          title: "已付款訂單無法修改金額",
          description: `${blocked.join("、")} 無法在此處變更。折扣請改用「修改已結清折扣」，加購請改用「修改額外加購」，其餘請以退款或新增訂單方式處理。`,
          variant: "destructive",
        });
        setIsSavingEdit(false);
        return;
      }

      // Auto-append locked audit line when a settled order has financial changes via inline edit
      let auditNoteLine: string | null = null;
      if (isPaidOrDeposit) {
        const auditParts: string[] = [];

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
        if (Number(effPaidAmount) !== Number(order.paid_amount ?? 0)) {
          auditParts.push(`已付 ${order.paid_amount ?? 0}→${effPaidAmount}`);
        }
        if (auditParts.length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          let who = "unknown";
          if (user) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
            who = (prof?.name && prof.name.trim()) || user.email || user.id;
          }
          const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
          auditNoteLine = `🔒[金額異動 ${ts} by ${who}] ${auditParts.join("、")}`;
        }
      }

      const updateData: Record<string, any> = buildInlineEditPatch({
        order: {
          payment_status: order.payment_status,
          total_price: order.total_price,
          discount_amount: order.discount_amount,
          discount_code: order.discount_code,
          final_price: order.final_price,
        },
        form: editForm as any,
        isOlivia,
        isHoldOrder: isHoldOrder(order),
        effPaymentStatus,
        effPaidAmount,
        savedTotalPrice,
        editFinalPriceCalc,
        originalAddonTotal,
        finalNotes,
        auditNoteLine,
        nowIso: new Date().toISOString(),
        originalOrderStatus: order.order_status,
      });

      // 進入編輯後若訂單已被其他人或系統更新，停止存檔（此時尚未寫入任何資料）
      const { data: freshOrder, error: freshError } = await supabase
        .from("orders")
        .select("updated_at")
        .eq("id", order.id)
        .maybeSingle();
      if (freshError) throw freshError;
      if (!freshOrder) throw new Error("找不到訂單，請重新整理");
      if (openedUpdatedAtRef.current && (freshOrder as any).updated_at !== openedUpdatedAtRef.current) {
        toast({
          title: "訂單已被更新，未儲存",
          description: "您進入編輯後，這張訂單已被其他人或系統更新。請重新整理頁面後再編輯。",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.rpc("update_order_fields_v1", {
        p_order_id: order.id,
        p_patch: updateData as any,
        p_source: "admin_order_inline_edit",
        p_reason: null,
      });

      if (error) throw error;

      // 第二步失敗時，第一步的欄位已存檔，不可再顯示「儲存失敗」
      let roomsSynced = false;
      let roomsSyncFailure: string | null = null;
      // V5.5A.9: order_rooms 改由 sync_order_rooms_v1 以 diff 方式在單一交易內同步
      if (roomsAction.kind === "sync") try {
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

        const existingIds = new Set((orderRooms || []).map((o: any) => o.id));
        const payloadRooms = editOrderRooms.map(r => ({
          // synthetic / 新增列不帶 id，讓 RPC 走 INSERT
          id: existingIds.has(r.id) ? r.id : null,
          room_type_id: r.room_type_id,
          quantity: r.quantity,
          room_price: r.room_price,
          // template_id 是折扣碼適用範圍的唯一依據；沒帶就會被 RPC 寫成 NULL
          template_id: resolveTemplateId(allTemplates as any, r.room_type_id, r.template_name, r.template_id),
          template_name: r.template_name,
          room_unit_id: r.quantity !== 1 ? null : (r.room_unit_id || autoAssignMap.get(r.id) || null),
        }));

        // 以第一步存檔後的 updated_at 作為樂觀鎖；中間若被更新，RPC 會回 STALE_ORDER
        const { data: afterFields, error: afterFieldsError } = await supabase
          .from("orders")
          .select("updated_at")
          .eq("id", order.id)
          .maybeSingle();
        if (afterFieldsError) throw afterFieldsError;
        if (!(afterFields as any)?.updated_at) throw new Error("讀不到訂單更新時間");

        const { data: syncResult, error: syncError } = await supabase.rpc("sync_order_rooms_v1" as any, {
          p_order_id: order.id,
          p_expected_updated_at: (afterFields as any).updated_at,
          p_rooms: payloadRooms as any,
        });
        if (syncError) throw syncError;
        roomsSynced = true;

        // 房間明細存好後才同步訂單的對應方案與專案（房間存檔失敗就不動）
        if (packageSync) {
          const { error: pkgError } = await supabase.rpc("update_order_fields_v1", {
            p_order_id: order.id,
            p_patch: packageSync as any,
            p_source: "admin_order_inline_edit",
            p_reason: null,
          });
          if (pkgError) {
            toast({
              title: "對應方案未更新",
              description: `房間明細已儲存，但訂單的對應方案／專案未更新：${pkgError.message}`,
              variant: "destructive",
            });
          }
        }

        const conflicts = ((syncResult as any)?.conflicts ?? []) as any[];
        if (conflicts.length > 0) {
          toast({
            title: "部分房號未指派",
            description: `有 ${conflicts.length} 間房的房號已被其他訂單佔用（${conflicts
              .map((c: any) => c.conflict_order_number)
              .filter(Boolean)
              .join("、")}），已改為未指派，其餘資料已儲存。`,
            variant: "destructive",
          });
        }
      } catch (syncErr: any) {
        console.error("房間明細儲存失敗:", syncErr);
        const raw = String(syncErr?.message || syncErr?.error_description || "");
        roomsSyncFailure = raw.includes("STALE_ORDER")
          ? "儲存過程中，這張訂單被其他人或系統更新。"
          : (raw || "請稍後再試。");
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
          if (roomsDiff && roomsSynced) changes.push(roomsDiff);
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
          // trigger 已涵蓋 orders 欄位；此處只補記 order_rooms／包區設定／
          // 額外加購等不在 orders 資料表的內容（V5.5C.2）
          const NON_ORDER_FIELDS = ["rooms", "exclusive_configs", "addon_note", "extra_addon_amount"];
          const residual = changes.filter((c: any) => NON_ORDER_FIELDS.includes(c.field));
          if (residual.length > 0) {
            const { error: auditError } = await supabase.from("audit_logs").insert([{
              user_id: user.id,
              user_email: user.email,
              action_type: "update",
              action_category: "order",
              entity_type: "order",
              entity_id: order.id,
              entity_name: order.order_number,
              accommodation_id: order.accommodation_id,
              details: { type: "inline_edit", changes: residual } as any,
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

      if (roomsSyncFailure) {
        toast({
          title: "訂單欄位已儲存，房間明細未儲存",
          description: `${roomsSyncFailure}請重新整理頁面確認後，再修改房間明細。`,
          variant: "destructive",
        });
      } else if (roomsAction.kind === "skip" && roomsAction.reason === "synthetic_skipped") {
        toast({ title: "儲存成功", description: "訂單已更新（未寫入房間明細）" });
      } else {
        toast({ title: "儲存成功", description: "訂單已更新" });
      }
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
      if (isCancelBlockedError(error)) {
        toast({
          title: "此訂單不能在這裡取消",
          description: buildCancelBlockHint(order as any),
          variant: "destructive",
        });
      } else {
        const msg = error?.message || error?.error_description || "請稍後再試";
        toast({ title: "儲存失敗", description: msg, variant: "destructive" });
      }
    } finally {
      setIsSavingEdit(false);
    }
    } finally {
      savingEditRef.current = false;
      paidSyncOverrideRef.current = null;
    }
  };


  const handleCheckinAction = async (action: "checkin" | "undo_checkin" | "checkout" | "undo_checkout") => {
    if (!order) return;
    try {
      const patch = buildCheckinActionPatch({
        action,
        nowIso: new Date().toISOString(),
        hasCheckedInAt: !!order.checked_in_at,
      });
      const { error } = await supabase.rpc("update_order_fields_v1", {
        p_order_id: order.id,
        p_patch: patch as any,
        p_source: `admin_${action}`,
        p_reason: null,
      });
      if (error) throw error;
      // 變更紀錄由 zzz_order_change_log trigger 統一寫入（V5.5C.2）
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

      const { error } = await supabase.rpc("update_order_fields_v1", {
        p_order_id: order.id,
        p_patch: buildAdminPriceEditPatch({
          totalPrice: editTotalPrice,
          discountAmount: editDiscountAmount,
          finalPrice: editFinalPrice,
          depositAmount: editDepositAmount,
          paidAmount: editPaidAmount,
          paymentStatus: newPaymentStatus,
          notes: nextNotes,
        }) as any,
        p_source: "admin_price_edit",
        p_reason: editReason.trim() || null,
      });
      if (error) throw error;

      // 變更紀錄由 trigger 統一寫入；修改原因已寫入 notes 的稽核行（V5.5C.2）

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

        // Fire all dependent lookups in parallel — they only need orderData.
        const accId = orderData.accommodation_id;
        const [
          orderRoomsRes,
          rtRes,
          unitsRes,
          occupiedRes,
          templatesRes,
          holidayRes,
          addonRes,
        ] = await Promise.all([
          supabase
            .from("order_rooms")
            .select("id, room_type_id, quantity, room_price, template_id, template_name, room_unit_id, room_types(name), room_units(unit_number, nickname)")
            .eq("order_id", orderId),
          accId
            ? supabase
                .from("room_types")
                .select("id, name, base_price, is_exclusive_package")
                .eq("accommodation_id", accId)
                .order("display_order", { ascending: true })
            : Promise.resolve({ data: null } as any),
          accId
            ? supabase
                .from("room_units" as any)
                .select("id, room_type_id, unit_number, nickname, is_active")
                .eq("accommodation_id", accId)
                .eq("is_active", true)
                .order("display_order", { ascending: true })
            : Promise.resolve({ data: null } as any),
          accId && orderData.check_in_date && orderData.check_out_date
            ? supabase
                .from("order_rooms")
                .select("room_unit_id, orders!inner(id, order_number, order_status, check_in_date, check_out_date)")
                .not("room_unit_id", "is", null)
                .neq("order_id", orderId)
                .eq("orders.accommodation_id", accId)
                .neq("orders.order_status", "cancelled")
                .lt("orders.check_in_date", orderData.check_out_date)
                .gt("orders.check_out_date", orderData.check_in_date)
            : Promise.resolve({ data: null } as any),
          accId
            ? supabase
                .from("pricing_templates")
                .select("id, template_name, meal_plans, room_type_id, room_type_ids, price, weekday_price, peak_price, weekend_price, display_order, default_package_id, valid_from, valid_until")
                .eq("accommodation_id", accId)
                .order("display_order", { ascending: true, nullsFirst: false })
                .order("template_name", { ascending: true })
            : Promise.resolve({ data: null } as any),
          accId && orderData.check_in_date && orderData.check_out_date
            ? supabase
                .from("public_holidays")
                .select("holiday_date, holiday_type")
                .eq("accommodation_id", accId)
                .gte("holiday_date", orderData.check_in_date)
                .lte("holiday_date", orderData.check_out_date)
            : Promise.resolve({ data: null } as any),
          accId
            ? supabase
                .from("addon_settings")
                .select("id, addon_type, description, unit_label, price_per_unit, pricing_mode, min_quantity, max_quantity, enabled")
                .eq("accommodation_id", accId)
                .eq("enabled", true)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: null } as any),
        ]);

        // 讀取失敗不可當成 0 筆：鎖住房間明細的編輯與儲存
        if (orderRoomsRes.error) {
          console.error("order_rooms 讀取失敗:", orderRoomsRes.error);
          setOrderRooms([]);
          setOrderRoomsLoaded(false);
          setOrderRoomsLoadError(orderRoomsRes.error.message || "未知錯誤");
        } else {
          const orderRoomsData = orderRoomsRes.data;
          setOrderRooms(orderRoomsData && orderRoomsData.length > 0 ? (orderRoomsData as unknown as OrderRoom[]) : []);
          setOrderRoomsLoadError(null);
          setOrderRoomsLoaded(true);
        }

        if (accId) {
          const rtData = rtRes.data as any[] | null;
          if (rtData) setRoomTypes(rtData as any);

          const unitsData = unitsRes.data as any[] | null;
          if (unitsData) {
            const occupiedMap = new Map<string, { id: string; order_number: string }>();
            (((occupiedRes as any).data as any[]) || []).forEach((row: any) => {
              const o = row.orders;
              if (!o) return;
              occupiedMap.set(row.room_unit_id, { id: o.id, order_number: o.order_number });
            });
            setRoomUnits(
              (unitsData as any[]).map((u) => ({
                ...u,
                occupied_by_order_id: occupiedMap.get(u.id)?.id || null,
                occupied_by_order_number: occupiedMap.get(u.id)?.order_number || null,
              })),
            );
          }

          const templatesData = templatesRes.data as any[] | null;
          if (templatesData && templatesData.length > 0) {
            const roomTypeId = orderData.room_type_id;
            const roomTypeTemplates = roomTypeId
              ? templatesData.filter((t: any) => templateMatchesRoomType(t, roomTypeId))
              : templatesData;
            setRoomTemplates(roomTypeTemplates as any);
            setAllRoomTemplates(templatesData as any);
            const derivedPlans: CustomMealPlan[] = [];
            const defaultTemplate = roomTypeTemplates.find((t: any) => (t as any).meal_plans && Array.isArray((t as any).meal_plans) && ((t as any).meal_plans as any[]).length > 0);
            if (defaultTemplate) {
              const plans = (defaultTemplate as any).meal_plans as CustomMealPlan[];
              derivedPlans.push(...plans);
            }
            for (const t of roomTypeTemplates) {
              const name = (t as any).template_name || "";
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
            setAllTemplates(templatesData as any);
          } else {
            setRoomTemplates([]);
            setAllRoomTemplates([]);
            setCustomMealPlans([]);
          }

          const holidayData = holidayRes.data as any[] | null;
          if (holidayData) {
            setPublicHolidays(
              holidayData
                .filter((h: any) => h.holiday_type !== "work_on_weekend")
                .map((h: any) => h.holiday_date),
            );
          }

          const addonData = addonRes.data as any[] | null;
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
      peer_trade: { label: "同業", className: "bg-teal-100 text-teal-800 border-teal-300", icon: Globe },
      kol: { label: "KOL互惠", className: "bg-pink-100 text-pink-700 border-pink-200", icon: Globe },
      points_starchain: { label: "星鏈會員", className: "bg-amber-100 text-amber-700 border-amber-200", icon: Globe },
      official_use: { label: "公務使用", className: "bg-slate-100 text-slate-700 border-slate-200", icon: Globe },
      franchise_diff: { label: "加盟價差", className: "bg-rose-100 text-rose-700 border-rose-200", icon: Globe },
      owner_provided: { label: "業主自帶", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Globe },
      hotelnabe: { label: "hotelnabe", className: "bg-sky-100 text-sky-700 border-sky-200", icon: Globe },
    };
    const config = sourceMap[source] || { label: source || "官網訂房", className: "bg-muted text-muted-foreground border-border", icon: Globe };
    const Icon = config.icon;
    // 旭海（hotelnabe）附加 OTA 通路來源，例如 hotelnabe - booking / hotelnabe - agoda
    const otaRaw = (order as any)?.hotelnabe_sync_state?.ota_code;
    const otaCode = typeof otaRaw === "string" ? otaRaw.trim().toLowerCase() : "";
    const label = source === "hotelnabe" && otaCode ? `${config.label} - ${otaCode}` : config.label;
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-help ${config.className}`}>
              <Icon className="w-3 h-3" />
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <div className="flex gap-2"><span className="text-muted-foreground">來源 code：</span><span className="font-mono">{source || "—"}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">顯示名稱：</span><span>{getOrderSourceDisplayName(source)}</span></div>
              {otaCode && (
                <>
                  <div className="border-t border-border/50 my-1" />
                  <div className="flex gap-2"><span className="text-muted-foreground">OTA code：</span><span className="font-mono">{otaCode}</span></div>
                  <div className="flex gap-2"><span className="text-muted-foreground">OTA 通路：</span><span>{getHotelnabeOtaDisplayName(otaCode)}</span></div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };



  const getPaymentMethodDisplayName = (method: string | null) => {
    if (!method) return "-";
    const methodMap: Record<string, string> = {
      credit_card: "信用卡",
      credit_card_3ds: "信用卡",
      credit_card_payuni: "信用卡(PAYUNi)",
      atm: "ATM 虛擬帳號",
      atm_payuni: "ATM 虛擬帳號(PAYUNi)",
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

  /**
   * D2「專案」欄位顯示順序（只改顯示，不動 orders.meal_plan 寫入）：
   *   orders.pricing_template_id 的專案名稱 → orders.package_id 的方案名稱 → 現行 meal_plan 顯示
   */
  const getOrderProjectLabel = () => {
    const pkgId = (order as any)?.package_id ?? null;
    return (
      resolveOrderProjectDisplayName({
        pricingTemplateId: (order as any)?.pricing_template_id ?? null,
        templates: allRoomTemplates.length > 0 ? allRoomTemplates : roomTemplates,
        packageId: pkgId,
        packages: pkgId && orderPackageName ? [{ id: pkgId, name: orderPackageName }] : [],
      }) ?? getTemplateDisplayName(order?.meal_plan ?? null)
    );
  };

  // D2 顯示用：載入 orders.package_id 的方案名稱（唯讀，不影響任何寫入）
  useEffect(() => {
    const pkgId = (order as any)?.package_id ?? null;
    if (!pkgId) {
      setOrderPackageName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_packages")
        .select("id, name")
        .eq("id", pkgId)
        .maybeSingle();
      if (!cancelled) setOrderPackageName(((data as any)?.name as string) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [(order as any)?.package_id]);

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
        .select("role, accommodation_id")
        .eq("user_id", user.id);
      const rows = (data ?? []) as { role: string; accommodation_id: string | null }[];
      const scopedRoles = rows
        .filter(r => r.accommodation_id === order.accommodation_id || r.accommodation_id === null)
        .map(r => r.role);
      // super_admin 為總部級角色，於任一館別（或全域）持有即視為所有館別的 super_admin
      const isSuper = rows.some(r => r.role === "super_admin");
      if (!cancelled) {
        setIsAdminUser(isSuper || scopedRoles.includes("hotel_admin"));
        setIsSuperAdmin(isSuper);
      }
    })();
    return () => { cancelled = true; };
  }, [order?.accommodation_id]);

  // 刪除訂單（僅 super_admin，透過後端 RPC 二次驗證權限）
  const handleDeleteOrder = async () => {
    if (!order) return;
    setIsDeletingOrder(true);
    try {
      const { error } = await supabase.rpc("admin_delete_order", {
        _order_id: order.id,
        _reason: deleteReason.trim() || null,
      });
      if (error) throw error;
      toast({
        title: "訂單已刪除",
        description: `訂單 ${order.order_number} 已永久刪除，並已寫入稽核紀錄。`,
      });
      setShowDeleteDialog(false);
      navigate(-1);
    } catch (e: any) {
      toast({
        title: "刪除失敗",
        description: e?.message || "無法刪除訂單，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsDeletingOrder(false);
    }
  };

  const handleRepushOwlting = async () => {
    if (!order) return;
    // 由確認彈窗觸發，這裡不再使用 window.confirm
    setIsRepushingOwlting(true);
    try {
      const echoToken = `RENKE-${order.order_number}-manual-${Date.now()}`;
      const { error } = await supabase.from("owlting_order_push_queue").insert({
        accommodation_id: order.accommodation_id,
        order_id: order.id,
        res_status: "Modify",
        echo_token: echoToken,
        status: "pending",
        next_retry_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast({
        title: "已排入重新推送",
        description: "任務已進入奧丁丁推送佇列，將於下一輪 cron（約 1 分鐘內）執行。",
      });
    } catch (e: any) {
      toast({
        title: "重新推送失敗",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setIsRepushingOwlting(false);
    }
  };

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
          <Button variant="ghost" size="icon" onClick={goBack}>
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

  // v5.5：專用金額調整入口的唯一顯示條件 — 同館 + orders 模組 editable
  const canUsePaidAmountDialogs =
    !!order.accommodation_id &&
    order.accommodation_id === currentAccommodationId &&
    getModuleLevel("orders") === "editable";
  // 折扣入口另需 payment_status ∈ (paid, fully_paid)
  const showPaidDiscountEntry = canShowPaidDiscountEntry({
    ordersLevel: getModuleLevel("orders"),
    currentAccommodationId,
    order: order as any,
  });
  // 已付訂金訂單：只開放「只補記推薦碼（不改金額）」
  const showReferralOnlyEntry = !showPaidDiscountEntry && canShowReferralCodeEntry({
    ordersLevel: getModuleLevel("orders"),
    currentAccommodationId,
    order: order as any,
  });
  // 已結清（paid／fully_paid）訂單在編輯模式下所有金額欄位唯讀；存檔 payload 亦不帶金額欄位
  const settledAmountLocked = isSettledPaymentStatus(order.payment_status);
  const hasUnsavedEdits = isEditing && (
    editRoomsChanged ||
    editPackagePick !== ((order as any).package_id || "") ||
    isEditFormDirty(editBaselineRef.current, editForm)
  );
  const openPaidAmountDialog = (m: PaidAmountEditMode) => {
    const blocked = paidDialogBlockReason({ isEditing, hasUnsavedEdits });
    if (blocked) {
      toast({ title: blocked, description: "編輯中有尚未儲存的修改，請先儲存或取消編輯後再開啟。", variant: "destructive" });
      return;
    }
    setPaidAmountDialogMode(m);
  };
  const showPaidAddonEntry =
    canUsePaidAmountDialogs && canEditPaidAddon({
      ordersLevel: getModuleLevel("orders"),
      currentAccommodationId,
      order: order as any,
    }).allowed;


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
    { value: "peer_trade", label: "同業" },
    { value: "kol", label: "KOL互惠" },
    { value: "points_starchain", label: "星鏈會員" },
    { value: "official_use", label: "公務使用" },
    { value: "franchise_diff", label: "加盟價差" },
    { value: "owner_provided", label: "業主自帶" },
  ];

  const inlineCancelBlocked = isCancelBlockedOrder(order as any);

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
      {!embedded && (
        <>
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
        </>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-4">
          {!embedded && (
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 md:h-10 md:w-10">
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          )}
          <h1 className="text-3xl md:text-2xl lg:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        <div className="flex flex-row gap-2 w-full sm:w-auto">
          {isEditing ? (
            <>
              {secondaryCurrencyConfig && (
                <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs self-center">
                  <button
                    type="button"
                    onClick={() => handleCurrencyModeChange("TWD")}
                    className={`px-2.5 py-1 rounded ${currencyForcedMode === "TWD" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                  >
                    NT$ 台幣
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCurrencyModeChange("SEC")}
                    className={`px-2.5 py-1 rounded ${currencyForcedMode === "SEC" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                  >
                    {secondaryCurrencyConfig.symbol} {secondaryCurrencyConfig.code}
                  </button>
                </div>
              )}
              <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="flex-1 sm:flex-none sm:w-auto text-sm h-11">
                <Save className="h-4 w-4 mr-2" />
                {isSavingEdit ? "儲存中..." : "儲存"}
              </Button>
              <Button variant="outline" onClick={cancelEditing} disabled={isSavingEdit} className="flex-1 sm:flex-none sm:w-auto text-sm h-11">
                <X className="h-4 w-4 mr-2" />
                取消編輯
              </Button>
            </>
          ) : (
            <>
              {/* 桌面：全部按鈕平鋪 */}
              <div className="hidden sm:flex sm:flex-row gap-2">
                {order.payment_status !== 'paid' && order.order_status !== 'cancelled' && !isNonPayableCurrency && (
                  <Button onClick={() => setShowPaymentDialog(true)} className="text-sm">
                    <CreditCard className="h-4 w-4 mr-2" />線上收款
                  </Button>
                )}
                {canManageOrders && (
                  <Button variant="outline" onClick={startEditing} className="text-sm">
                    <Pencil className="h-4 w-4 mr-2" />編輯
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button variant="outline" onClick={() => setShowMetaDrawer(true)} className="text-sm">
                    <Megaphone className="h-4 w-4 mr-2" />獎金資格例外
                  </Button>
                )}
                {isAdminUser && order.notes && /rec_trade_id/i.test(order.notes) && (
                  <Button variant="outline" className="text-sm" disabled={isSyncingRefund} onClick={handleSyncTapPayRefund}>
                    <CreditCard className="h-4 w-4 mr-2" />{isSyncingRefund ? "同步中..." : "同步 TapPay 退款狀態"}
                  </Button>
                )}
                {isSuperAdmin && order.order_source !== 'owlting' && order.order_source !== 'hotelnabe' && (
                  <Button variant="outline" className="text-sm" disabled={isRepushingOwlting} onClick={() => setShowRepushDialog(true)}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isRepushingOwlting ? 'animate-spin' : ''}`} />{isRepushingOwlting ? "排入中..." : "重新推送奧丁丁"}
                  </Button>
                )}
                {order.order_status !== 'cancelled' && (
                  <Button variant="ghost-destructive" className="text-sm" disabled={isCancelling} onClick={() => setShowCancelDialog(true)}>
                    <XCircle className="h-4 w-4 mr-2" />取消訂單
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button
                    variant="destructive"
                    className="text-sm"
                    disabled={isDeletingOrder}
                    onClick={() => { setDeleteConfirmText(""); setDeleteReason(""); setShowDeleteDialog(true); }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />刪除訂單
                  </Button>
                )}
              </div>
              {/* 手機：主 CTA + 更多 */}
              <div className="flex sm:hidden gap-2 w-full">
                {order.payment_status !== 'paid' && order.order_status !== 'cancelled' && !isNonPayableCurrency ? (
                  <Button onClick={() => setShowPaymentDialog(true)} className="flex-1 text-sm h-11">
                    <CreditCard className="h-4 w-4 mr-1.5" />收款
                  </Button>
                ) : canManageOrders ? (
                  <Button variant="outline" onClick={startEditing} className="flex-1 text-sm h-11">
                    <Pencil className="h-4 w-4 mr-1.5" />編輯
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="更多操作">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canManageOrders && order.payment_status !== 'paid' && order.order_status !== 'cancelled' && (
                      <DropdownMenuItem onClick={startEditing} className="py-3">
                        <Pencil className="mr-2 h-4 w-4" />編輯訂單
                      </DropdownMenuItem>
                    )}
                    {isSuperAdmin && (
                      <DropdownMenuItem onClick={() => setShowMetaDrawer(true)} className="py-3">
                        <Megaphone className="mr-2 h-4 w-4" />獎金資格例外
                      </DropdownMenuItem>
                    )}
                    {isAdminUser && order.notes && /rec_trade_id/i.test(order.notes) && (
                      <DropdownMenuItem disabled={isSyncingRefund} onClick={handleSyncTapPayRefund} className="py-3">
                        <CreditCard className="mr-2 h-4 w-4" />{isSyncingRefund ? "同步中..." : "同步 TapPay 退款"}
                      </DropdownMenuItem>
                    )}
                    {isSuperAdmin && order.order_source !== 'owlting' && order.order_source !== 'hotelnabe' && (
                      <DropdownMenuItem disabled={isRepushingOwlting} onClick={() => setShowRepushDialog(true)} className="py-3">
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRepushingOwlting ? 'animate-spin' : ''}`} />{isRepushingOwlting ? "排入中..." : "重新推送奧丁丁"}
                      </DropdownMenuItem>
                    )}
                    {order.order_status !== 'cancelled' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={isCancelling} onClick={() => setShowCancelDialog(true)} className="py-3 text-destructive focus:text-destructive">
                          <XCircle className="mr-2 h-4 w-4" />取消訂單
                        </DropdownMenuItem>
                      </>
                    )}
                    {isSuperAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={isDeletingOrder}
                          onClick={() => { setDeleteConfirmText(""); setDeleteReason(""); setShowDeleteDialog(true); }}
                          className="py-3 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />刪除訂單
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
              <span className="font-medium text-base md:text-base text-right inline-flex items-center gap-1.5">
                {format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}
                {isSuperAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDealDateOpen(true)}
                  >
                    修改
                  </Button>
                )}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">訂單來源</span>
              {isEditing ? (
                <Select value={editForm.order_source} onValueChange={(v) => setEditForm(f => ({ ...f, order_source: v, }))}>
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
                <div className="flex flex-col items-end gap-1">
                  <Select value={editForm.order_status} onValueChange={(v) => setEditForm(f => ({ ...f, order_status: v }))}>
                    <SelectTrigger className="w-[160px] h-10 text-sm md:w-[140px] md:h-8 md:text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orderStatusOptions.map(o => (
                        <SelectItem
                          key={o.value}
                          value={o.value}
                          disabled={o.value === "cancelled" && inlineCancelBlocked}
                        >
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {inlineCancelBlocked && (
                    <span className="text-xs text-muted-foreground text-right max-w-[240px] leading-snug">
                      {buildCancelBlockHint(order as any)}
                    </span>
                  )}
                </div>
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
              ) : getPaymentStatusBadge(getPaymentDeadlineInfo(order, isNonPayableCurrency).effectiveStatus)}

            </div>
            {!isEditing && (() => {
              const info = getPaymentDeadlineInfo(order, isNonPayableCurrency);
              return (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground space-y-1">
                  <div className="font-medium text-foreground">付款狀態說明</div>
                  <div className="flex justify-between gap-2">
                    <span>訂金期限（建立訂單 +3 天）</span>
                    <span className={info.stage === "deposit" ? "text-foreground font-medium tabular-nums" : "tabular-nums"}>
                      {info.depositDue ? format(info.depositDue, "yyyy 年 M 月 d 日 HH:mm") : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>尾款期限（入住日 +3 天，可提前付清）</span>
                    <span className={info.stage === "balance" ? "text-foreground font-medium tabular-nums" : "tabular-nums"}>
                      {info.balanceDue ? format(info.balanceDue, "yyyy 年 M 月 d 日 HH:mm") : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>目前判斷依據</span>
                    <span className="text-foreground">
                      {info.stage === "deposit" ? "訂金期限" : info.stage === "balance" ? "尾款期限" : "不適用"}
                    </span>
                  </div>
                  <div className={info.effectiveStatus === "overdue" ? "text-destructive" : ""}>{info.reason}</div>
                </div>
              );
            })()}

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
            {orderRoomsLoadError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="order-rooms-load-error">
                房間明細讀取失敗（{orderRoomsLoadError}）。為避免覆蓋既有資料，已暫停編輯與儲存房間明細，其他欄位仍可儲存。請重新整理頁面。
              </div>
            )}
            {isEditing && editRoomsChanged && editOrderRooms.length > 0 && (
              <div className="space-y-2" data-testid="inline-edit-package-section">
                <TemplateFallbackWarning
                  roomTypeNames={editFallbackRoomTypeIds.map(id => roomTypes.find(r => r.id === id)?.name || "")}
                  confirmed={fallbackConfirmed}
                  onConfirmedChange={setFallbackConfirmed}
                />
                {editRoomPicks[0]?.template_id ? (
                  <OrderPackageField
                    resolution={editPackageResolution}
                    manualPick={editPackagePick}
                    onManualPick={setEditPackagePick}
                    isRequired={packageChannel.isRequired}
                    channelLabel={packageChannel.channelLabel}
                    roomTypeName={(id) => roomTypes.find(r => r.id === id)?.name || ""}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground" data-testid="inline-edit-package-keep">
                    第一間房沒有選專案，訂單的對應方案與專案維持原值
                  </div>
                )}
              </div>
            )}
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
                            const candidates = allTemplates.filter(t => templateMatchesRoomType(t as any, rt.id));
                            const sharedTpl = primaryTpl && candidates.some(t => t.template_name === primaryTpl) ? primaryTpl : null;
                            const dateBasedTotal = await computeRoomTotalByDates(rt.id, sharedTpl);
                            const suggestedUnitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(rt.id) || rt.base_price;
                            setEditOrderRooms(prev => [...prev, {
                              id: crypto.randomUUID(),
                              room_type_id: rt.id,
                              quantity: 1,
                              room_price: suggestedUnitPrice,
                              unit_price: suggestedUnitPrice,
                              template_id: resolveTemplateId(allTemplates as any, rt.id, sharedTpl),
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
                              const candidates = allTemplates.filter(t => templateMatchesRoomType(t as any, rt.id));
                              const sharedTpl = primaryTpl && candidates.some(t => t.template_name === primaryTpl) ? primaryTpl : null;
                              const dateBasedTotal = await computeRoomTotalByDates(rt.id, sharedTpl);
                              const suggestedUnitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(rt.id) || rt.base_price;
                              setEditOrderRooms(prev => [...prev, {
                                id: crypto.randomUUID(),
                                room_type_id: rt.id,
                                quantity: 1,
                                room_price: suggestedUnitPrice,
                                unit_price: suggestedUnitPrice,
                                template_id: resolveTemplateId(allTemplates as any, rt.id, sharedTpl),
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
                          // 每一筆房間依自己的房型取組成欄位（種類＋上限），不共用第一筆
                          const rowBreakdownItems = getBreakdownItemsFor(or.room_type_id);
                          return (
                          <div key={or.id} className="space-y-2">
                          <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">房間 {idx + 1}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingRemoveRoomId(or.id)}
                                data-testid={`order-room-remove-${idx}`}
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
                                    const changed = v !== or.room_type_id;
                                    const selectedRoomType = roomTypes.find(rt => rt.id === v);
                                    if (!selectedRoomType) {
                                      setEditOrderRooms(prev => {
                                        const next = prev.map(r => r.id === or.id ? { ...r, room_type_id: v } : r);
                                        if (changed) void applyExclusiveDefaultsOnRoomTypeChange(next, or.id, v);
                                        return next;
                                      });
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
                                    setEditOrderRooms(prev => {
                                      const next = prev.map(r => r.id === or.id ? {
                                        ...r,
                                        room_type_id: v,
                                        unit_price: unitPrice,
                                        room_price: roomTotal,
                                      } : r);
                                      // 換成新房型當下才帶入該房型的預設組成間數
                                      if (changed) void applyExclusiveDefaultsOnRoomTypeChange(next, or.id, v);
                                      return next;
                                    });
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
                            {(() => {
                              const candidates = allTemplates.filter(t => templateMatchesRoomType(t as any, or.room_type_id));
                              return (
                              <div className="space-y-1">
                                <Label className="text-xs">專案</Label>
                                <Select
                                  value={or.template_name || "none"}
                                  onValueChange={async (v) => {
                                    const newTemplate = v === "none" ? "" : v;
                                    if (idx === 0) {
                                      // 主列變更 → 其他列同步；無同名方案時自動帶入該房型第一個預設方案
                                      const updates = await Promise.all(editOrderRooms.map(async (r) => {
                                        const cands = allTemplates.filter(t => templateMatchesRoomType(t as any, r.room_type_id));
                                        let applyTpl: string;
                                        if (r.id === or.id) {
                                          applyTpl = newTemplate;
                                        } else if (newTemplate && cands.some(t => t.template_name === newTemplate)) {
                                          applyTpl = newTemplate;
                                        } else {
                                          applyTpl = cands[0]?.template_name || r.template_name || "";
                                        }
                                        const applyId = resolveTemplateId(allTemplates as any, r.room_type_id, applyTpl);
                                        const dateBasedTotal = await computeRoomTotalByDates(r.room_type_id, applyTpl);
                                        if (dateBasedTotal > 0) {
                                          const roomTotal = dateBasedTotal * r.quantity;
                                          const unitPrice = r.quantity > 0 ? Math.round(roomTotal / r.quantity) : roomTotal;
                                          return { ...r, template_id: applyId, template_name: applyTpl, unit_price: unitPrice, room_price: roomTotal };
                                        }
                                        return { ...r, template_id: applyId, template_name: applyTpl };
                                      }));
                                      setEditOrderRooms(updates);
                                      return;
                                    }
                                    // 非主列：獨立設定自己的方案
                                    const dateBasedTotal = await computeRoomTotalByDates(or.room_type_id, newTemplate);
                                    const newTemplateId = resolveTemplateId(allTemplates as any, or.room_type_id, newTemplate);
                                    setEditOrderRooms(prev => prev.map(r => {
                                      if (r.id !== or.id) return r;
                                      if (dateBasedTotal > 0) {
                                        const roomTotal = dateBasedTotal * r.quantity;
                                        const unitPrice = r.quantity > 0 ? Math.round(roomTotal / r.quantity) : roomTotal;
                                        return { ...r, template_id: newTemplateId, template_name: newTemplate, unit_price: unitPrice, room_price: roomTotal };
                                      }
                                      return { ...r, template_id: newTemplateId, template_name: newTemplate };
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="選擇專案" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">無</SelectItem>
                                    {candidates.map(t => (
                                      <SelectItem key={t.id} value={t.template_name || ""}>{t.template_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                                rawMode={!!secondaryCurrencyConfig}
                                storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} hideToggle={!!secondaryCurrencyConfig}
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
                              <div className={`grid gap-2 ${rowBreakdownItems.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                                {rowBreakdownItems.map(b => {
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
                                將以備註形式儲存：{rowBreakdownItems.map(b => `${b.name} ${Number(cfg[b.name]) || 0} 間`).join("、")}
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
                                {orderCurrencyPrefix} {displayRoomPrice.toLocaleString()}
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
                      disabled={!orderRoomsLoaded}
                      onValueChange={async (v) => {
                        const changed = v !== editForm.room_type_id;
                        setEditForm(f => ({ ...f, room_type_id: v }));
                        // 同步建立一筆 editOrderRooms，切換到新版 UI（含棟號/房號選擇）
                        const selectedRoomType = roomTypes.find(rt => rt.id === v);
                        const dateBasedTotal = await computeRoomTotalByDates(v, null);
                        const unitPrice = dateBasedTotal || getSuggestedRoomUnitPrice(v) || (selectedRoomType?.base_price ?? 0);
                        const syntheticRows = [{
                          id: `synthetic-${order.id}`,
                          room_type_id: v,
                          quantity: 1,
                          room_price: unitPrice,
                          unit_price: unitPrice,
                          template_id: null,
                          template_name: null,
                          room_unit_id: null,
                        }];
                        setEditOrderRooms(syntheticRows);
                        // 換成新房型當下才帶入該房型的預設組成間數
                        if (changed) void applyExclusiveDefaultsOnRoomTypeChange(syntheticRows, `synthetic-${order.id}`, v);
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
                      <div className={`grid gap-2 ${headerBreakdownItems.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                        {headerBreakdownItems.map(b => {
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
                        將以備註形式儲存：{headerBreakdownItems.map(b => `${b.name} ${Number((editExclusiveConfigs[0] || {})[b.name]) || 0} 間`).join("、")}
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
              <div className="flex items-center gap-2">
                <span className="font-medium text-base md:text-base">{order.check_out_date}</span>
                {order.payment_status !== "paid" && order.order_status !== "cancelled" && (
                  (order.order_source === "kol" || isAdminUser || canEditOrders) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setChangeDatesOpen(true)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />改期
                    </Button>
                  )
                )}
              </div>
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
            {orderRooms.length === 0 && editOrderRooms.length === 0 && (order.meal_plan || (order as any).pricing_template_id || (order as any).package_id || isEditing) && (
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
                    <span className="font-medium text-base md:text-base text-right" data-testid="order-project-name">{getOrderProjectLabel()}</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 價格資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg md:text-lg">價格明細</CardTitle>
              {(showPaidDiscountEntry || showPaidAddonEntry || showReferralOnlyEntry) && (
                <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row">
                  {showPaidDiscountEntry && (
                    <Button
                      variant="outline"
                      className="h-11 w-full sm:h-9 sm:w-auto text-sm"
                      data-testid="paid-discount-entry-btn"
                      onClick={() => openPaidAmountDialog("discount")}
                    >
                      修改已結清折扣
                    </Button>
                  )}
                  {showReferralOnlyEntry && (
                    <Button
                      variant="outline"
                      className="h-11 w-full sm:h-9 sm:w-auto text-sm"
                      data-testid="referral-code-entry-btn"
                      onClick={() => openPaidAmountDialog("discount")}
                    >
                      補記推薦碼
                    </Button>
                  )}
                  {showPaidAddonEntry && (
                    <Button
                      variant="outline"
                      className="h-11 w-full sm:h-9 sm:w-auto text-sm"
                      data-testid="paid-addon-entry-btn"
                      onClick={() => openPaidAmountDialog("addon")}
                    >
                      修改額外加購
                    </Button>
                  )}
                </div>
              )}

            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Multi-room price breakdown */}
            {orderRooms.length > 0 && !isEditing && (
              <>
                {orderRooms.map((or) => {
                  const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
                  const savedAddons = (order.custom_addon_details as CustomAddonDetail[]) || [];
                  const customAddonTotal = savedAddons.reduce((sum, item) => sum + Number(item.total || 0), 0);
                  const dedicatedAddonTotal = Number(order.pet_plan_price || 0) + Number(order.meal_plan_total || 0);
                  const addonTotal = dedicatedAddonTotal > 0 ? dedicatedAddonTotal : customAddonTotal;
                  const totalIncludesAddons = Math.abs(
                    Number(order.final_price || 0) - (Number(order.total_price || 0) - Number(order.discount_amount || 0)),
                  ) <= 1;
                  const roomOnlyTotal = Math.max(0, Number(order.total_price || 0) - (totalIncludesAddons ? addonTotal : 0));
                  const displayRoomPrice = orderRooms.length === 1 && roomOnlyTotal > 0 && savedRoomsTotal !== roomOnlyTotal
                    ? roomOnlyTotal
                    : or.room_price;
                  return (
                    <div key={or.id} className="flex justify-between items-center gap-2">
                      <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">
                        {or.room_types?.name || "房型"} × {or.quantity} 間
                      </span>
                      <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {displayRoomPrice.toLocaleString()}</span>
                    </div>
                  );
                })}
              </>
            )}
            {(() => {
              const savedRoomsTotal = orderRooms.reduce((sum, r) => sum + r.room_price, 0);
              const savedAddons = (order.custom_addon_details as CustomAddonDetail[]) || [];
              const customAddonTotal = savedAddons.reduce((sum, item) => sum + Number(item.total || 0), 0);
              const dedicatedAddonTotal = Number(order.pet_plan_price || 0) + Number(order.meal_plan_total || 0);
              const addonTotal = dedicatedAddonTotal > 0 ? dedicatedAddonTotal : customAddonTotal;
              const totalIncludesAddons = Math.abs(
                Number(order.final_price || 0) - (Number(order.total_price || 0) - Number(order.discount_amount || 0)),
              ) <= 1;
              const roomOnlyTotal = Math.max(0, Number(order.total_price || 0) - (totalIncludesAddons ? addonTotal : 0));
              const displayTotal = orderRooms.length === 1 && roomOnlyTotal > 0 && savedRoomsTotal !== roomOnlyTotal
                ? roomOnlyTotal
                : (orderRooms.length > 0 ? savedRoomsTotal : roomOnlyTotal);
              // 編輯模式始終顯示；檢視模式下僅在無 orderRooms 或多房型時顯示原始金額
              const showInViewMode = orderRooms.length !== 1;
              if (!isEditing && !showInViewMode) return null;
              return (
                <>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">原始金額</span>
                    {isEditing ? (
                      <DualCurrencyInput config={secondaryCurrencyConfig} rawMode={!!secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} hideToggle={!!secondaryCurrencyConfig} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" disabled={settledAmountLocked} value={editForm.total_price} onChange={(v) => setEditForm(f => ({ ...f, total_price: v }))} />
                    ) : (
                      <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {displayTotal.toLocaleString()}</span>
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
                <DualCurrencyInput config={secondaryCurrencyConfig} rawMode={!!secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} hideToggle={!!secondaryCurrencyConfig} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" disabled={settledAmountLocked} value={editForm.discount_amount} onChange={(v) => setEditForm(f => ({ ...f, discount_amount: v }))} />
              ) : (
                order.discount_amount > 0 ? (
                  <span className="font-medium text-base md:text-base text-destructive">- {orderCurrencyPrefix} {order.discount_amount.toLocaleString()}</span>
                ) : (
                  <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} 0</span>
                )
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">折扣碼</span>
                {isEditing ? (
                  <Input className="w-[140px] h-10 text-base md:h-8 md:text-sm text-right uppercase" type="text" placeholder="選填" disabled={settledAmountLocked} value={editForm.discount_code} onChange={(e) => { setEditForm(f => ({ ...f, discount_code: e.target.value.toUpperCase() })); setDiscountCodeError(""); setDiscountCodeNote(""); }} />
                ) : (
                  order.discount_code ? (
                    <Badge variant="outline" className="text-xs">{order.discount_code}</Badge>
                  ) : (
                    <span className="font-medium text-base md:text-base text-muted-foreground">—</span>
                  )
                )}
              </div>
              {isEditing && discountCodeNote && !discountCodeError && (
                <p className="text-xs text-muted-foreground text-right" data-testid="discount-code-note">{discountCodeNote}</p>
              )}
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
                    <DualCurrencyInput disabled={isPaidAddonFlowOrder(order as any)} config={secondaryCurrencyConfig} rawMode={!!secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} hideToggle={!!secondaryCurrencyConfig} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" value={editForm.addon_total} onChange={(v) => setEditForm(f => ({ ...f, addon_total: v }))} />
                  </div>
                  {isPaidAddonFlowOrder(order as any) && (
                    <p className="text-xs text-muted-foreground">
                      已結清訂單的折扣與額外加購請使用價格明細上方的「修改已結清折扣」／「修改額外加購」，此處欄位不會被儲存。
                    </p>
                  )}
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">額外現場加購金額</span>
                    <DualCurrencyInput
                      disabled={isPaidAddonFlowOrder(order as any)}
                      config={secondaryCurrencyConfig}
                      rawMode={!!secondaryCurrencyConfig}
                      storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} hideToggle={!!secondaryCurrencyConfig}
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
                      disabled={isPaidAddonFlowOrder(order as any)}
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
                      <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {item.amount.toLocaleString()}</span>
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
                      <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {addonTotal.toLocaleString()}</span>
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
                        {orderCurrencyPrefix} {isEditing ? (editForm.total_price + editForm.addon_total - editForm.discount_amount).toLocaleString() : effectiveFinalPrice.toLocaleString()}
                      </span>
                      {secondaryCurrencyConfig && !isRawCurrency && (
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
                    const canEditSplit = isEditing && !settledAmountLocked;
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
                              {orderCurrencyPrefix} {dep.toLocaleString()}
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
                              {orderCurrencyPrefix} {balance.toLocaleString()}
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
                      <DualCurrencyInput config={secondaryCurrencyConfig} rawMode={!!secondaryCurrencyConfig} storageKey={order.accommodation_id} forcedMode={currencyForcedMode} onModeChange={handleCurrencyModeChange} hideToggle={!!secondaryCurrencyConfig} className="w-[150px]" inputClassName="h-10 text-base md:h-8 md:text-sm" disabled={settledAmountLocked} value={editForm.paid_amount} onChange={(v) => setEditForm(f => ({ ...f, paid_amount: v }))} />
                    ) : (
                      <span className="font-medium text-base md:text-base text-primary">{orderCurrencyPrefix} {order.paid_amount.toLocaleString()}</span>
                    )}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm md:text-sm text-muted-foreground flex-shrink-0">待付金額</span>
                    <span className="font-medium text-base md:text-base text-destructive">
                      {orderCurrencyPrefix} {isEditing
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
        // 已付訂金／已付清的訂單不視為逾期（與訂單列表狀態一致）
        const isExpired = isAtmExpired(o);
        const isAtmPaid = o.payment_status === "paid" || o.payment_status === "deposit_paid";
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
                  <Badge variant="outline" className="ml-auto text-destructive border-destructive/30">已逾期</Badge>
                ) : isAtmPaid ? (
                  <Badge variant="outline" className="ml-auto text-primary border-primary/30">
                    {o.payment_status === "paid" ? "已付清" : "已付訂金"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto text-primary border-primary/30">待付款</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {o.payment_method === "atm_payuni" && (() => {
                const dep = Number(o.booking_deposit_amount || 0);
                const paid = Number(o.paid_amount || 0);
                const balance = Math.max(0, Number(o.final_price || 0) - Math.max(paid, dep));
                return (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="payuni-atm-order-summary">
                    PAYUNi ATM 訂金 {paid > 0 ? "已付" : "未付"}（NT$ {dep.toLocaleString()}）{balance > 0 ? `・尾款現場收 NT$ ${balance.toLocaleString()}` : ""}
                  </div>
                );
              })()}
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
                <span className="text-sm text-muted-foreground flex-shrink-0">
                  應繳金額{getAtmDepositPercent(o) ? `（訂金 ${getAtmDepositPercent(o)}%）` : ""}
                </span>
                <span className="font-semibold text-base text-primary">
                  {orderCurrencyPrefix} {getAtmTransferAmount(o).toLocaleString()}
                </span>
              </div>
              {expireAt && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm text-muted-foreground flex-shrink-0">繳費期限</span>
                    <span className={`font-medium text-sm ${isExpired ? "text-destructive" : ""}`}>
                      {format(expireAt, "yyyy/MM/dd HH:mm")}
                      {isExpired ? "（已逾期）" : ""}
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
            <fieldset disabled={settledAmountLocked} className="contents" data-testid="order-edit-addon-fieldset">
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
                      <span className="text-base md:text-sm">{orderCurrencyPrefix} {petAddon.price_per_unit.toLocaleString()} / {petAddon.unit_label} / 晚</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                      <span className="font-medium text-sm">{orderCurrencyPrefix} {editForm.pet_plan_price.toLocaleString()}</span>
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

              {/* 舊版餐食／烤肉方案編輯已移除，所有加購一律走 custom_addon_details */}



              {/* 其他自訂加購方案 - 編輯模式 */}
              {(() => {
                const genericAddons = addonSettings.filter(a => a.addon_type !== 'pet' && a.addon_type !== 'meal' && a.addon_type !== 'bbq');
                return genericAddons.map((addon, idx) => {
                  const matchesAddon = (d: CustomAddonDetail) =>
                    d.addon_id ? d.addon_id === addon.id : d.addon_type === addon.addon_type;
                  const existing = editForm.custom_addon_details.find(matchesAddon);

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
                                const newCount = addonStepDown(count, addon.min_quantity);
                                const newTotal = newCount * addon.price_per_unit * addonNightsMultiplier(addon.pricing_mode, nights);
                                const newDetails = editForm.custom_addon_details.filter(d => !matchesAddon(d));
                                if (newCount > 0) {
                                  newDetails.push({ addon_id: addon.id, addon_type: addon.addon_type, count: newCount, price_per_unit: addon.price_per_unit, total: newTotal, unit_label: addon.unit_label });
                                }
                                setEditForm(f => ({ ...f, custom_addon_details: newDetails }));
                              }}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{count}</span>
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={count >= addon.max_quantity}
                              onClick={() => {
                                const newCount = addonStepUp(count, addon.min_quantity, addon.max_quantity);
                                const newTotal = newCount * addon.price_per_unit * addonNightsMultiplier(addon.pricing_mode, nights);
                                const newDetails = editForm.custom_addon_details.filter(d => !matchesAddon(d));
                                if (newCount > 0) {
                                  newDetails.push({ addon_id: addon.id, addon_type: addon.addon_type, count: newCount, price_per_unit: addon.price_per_unit, total: newTotal, unit_label: addon.unit_label });
                                }
                                setEditForm(f => ({ ...f, custom_addon_details: newDetails }));
                              }}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                          <span className="text-sm md:text-sm text-muted-foreground">單價</span>
                          <span className="text-base md:text-sm">{orderCurrencyPrefix} {addon.price_per_unit.toLocaleString()} / {addon.unit_label} {addonPricingSuffix(addon.pricing_mode)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                          <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                          <span className="font-medium text-sm">{orderCurrencyPrefix} {total.toLocaleString()}</span>
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
                        {orderCurrencyPrefix} {grandTotal.toLocaleString()}
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
            </fieldset>
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
                            <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {order.pet_plan_price.toLocaleString()}</span>
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
                                <span className="font-medium">{orderCurrencyPrefix} {detail.price.toLocaleString()}</span>
                              </div>
                            ))}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-sm md:text-sm text-muted-foreground">小計</span>
                              <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {order.meal_plan_total.toLocaleString()}</span>
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
                            <span className="font-medium text-base md:text-base">{orderCurrencyPrefix} {addon.total.toLocaleString()}</span>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}

                    <Separator />
                    <div className="flex justify-between items-center gap-2 pt-2">
                      <span className="text-sm md:text-sm font-semibold">加購總計</span>
                      <span className="font-bold text-lg md:text-lg text-primary">
                        {orderCurrencyPrefix} {grandTotal.toLocaleString()}
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

      {/* 備品分配（依住宿夜次佔用數量） */}
      {order && (
        <OrderAmenityCard
          orderId={order.id}
          accommodationId={order.accommodation_id}
          checkIn={order.check_in_date}
          checkOut={order.check_out_date}
          readOnly={!(isAdminUser || canEditOrders)}
        />
      )}

      {/* 關聯的購物商品（加購紀錄） */}
      {order && <OrderAddonSalesCard orderId={order.id} />}





      {/* 客服待辦（人工重新計價／改期審核） */}
      {order && (
        <OrderManualReviewCard
          orderId={order.id}
          orderNumber={order.order_number}
          onResolved={fetchOrder}
        />
      )}

      {/* 訂單歷程（變更＋付款＋押金＋通知信，含重送按鈕） */}
      {order && (
        <OrderTimelineCard
          orderId={order.id}
          orderNumber={order.order_number}
          orderSource={order.order_source}
          paymentMethod={order.payment_method}
          orderStatus={order.order_status}
          canManage={isAdminUser || canEditOrders}
        />
      )}

      {order && (
        <PaidAmountEditDialog
          orderId={order.id}
          mode={paidAmountDialogMode ?? "discount"}
          open={paidAmountDialogMode !== null}
          onOpenChange={(v) => { if (!v) setPaidAmountDialogMode(null); }}
          referralOnly={!showPaidDiscountEntry && showReferralOnlyEntry}
          onSuccess={() => { if (isEditing) setIsEditing(false); fetchOrder(); }}
        />
      )}



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

      {/* PAYUNi 退款進度（ATM 轉匯失敗可由館方／總部代填帳戶） */}
      {order && ["credit_card_payuni", "atm_payuni"].includes(String((order as any).payment_method)) && (
        <div className="px-4 pb-4">
          <PayuniRefundStatus as="admin" orderId={order.id} />
        </div>
      )}

      {/* 取消訂單對話框（含退款選項） */}
      {order && (
        <CancelOrderDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          order={{
            id: order.id,
            order_number: order.order_number,
            paid_amount: order.paid_amount,
            order_source: (order as any).order_source,
            payment_method: (order as any).payment_method,
            deposit_payment_method: (order as any).deposit_payment_method,
            balance_payment_method: (order as any).balance_payment_method,
          }}
          onCancelled={goBack}
        />
      )}

      {/* 刪除訂單確認彈窗（僅 super_admin 可見） */}
      {order && isSuperAdmin && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">永久刪除此訂單？</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <div>此操作無法復原。訂單本體與其房間、分潤、佣金等關聯紀錄將一併移除，房間庫存會即時釋放。</div>
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                    <div><span className="text-muted-foreground">訂單編號：</span><span className="font-mono">{order.order_number}</span></div>
                    <div><span className="text-muted-foreground">訂房人：</span>{order.guest_name}</div>
                    <div><span className="text-muted-foreground">入住／退房：</span>{order.check_in_date} → {order.check_out_date}</div>
                  </div>
                  <div className="text-muted-foreground">若只是要停止此訂單，建議改用「取消訂單」以保留紀錄。刪除前系統會自動將完整內容寫入稽核紀錄。</div>
                  <div className="space-y-2">
                    <div className="text-foreground">刪除原因（選填，會寫入稽核紀錄）</div>
                    <Textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      placeholder="例如：重複建單、測試訂單"
                      className="text-sm"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-foreground">請輸入訂單編號 <span className="font-mono">{order.order_number}</span> 以確認刪除</div>
                    <Input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={order.order_number}
                      className="text-sm font-mono"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingOrder}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeletingOrder || deleteConfirmText.trim().toUpperCase() !== order.order_number.toUpperCase()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => {
                  e.preventDefault();
                  await handleDeleteOrder();
                }}
              >
                {isDeletingOrder ? "刪除中..." : "永久刪除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 重新推送奧丁丁確認彈窗 */}
      {order && (
        <AlertDialog open={showRepushDialog} onOpenChange={setShowRepushDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>重新推送此訂單到奧丁丁？</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <div>系統將建立一筆 Modify 任務推送至奧丁丁，不會修改訂單本身。</div>
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                    <div><span className="text-muted-foreground">訂單編號：</span><span className="font-mono">{order.order_number}</span></div>
                    <div><span className="text-muted-foreground">任務類型：</span>Modify（更新既有訂單）</div>
                    <div><span className="text-muted-foreground">狀態：</span>pending（進入推送佇列）</div>
                    <div><span className="text-muted-foreground">預估執行：</span>下一輪 cron，約 1 分鐘內</div>
                  </div>
                  <div className="text-muted-foreground">
                    影響說明：奧丁丁端將以最新的訂單資料（房型、日期、金額、備註等）覆蓋，若對方已有此訂單則會被更新；訂單本體與 PMS 資料不會被異動。
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRepushingOwlting}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={isRepushingOwlting}
                onClick={async (e) => {
                  e.preventDefault();
                  await handleRepushOwlting();
                  setShowRepushDialog(false);
                }}
              >
                {isRepushingOwlting ? "排入中..." : "確認推送"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 移除房間前確認（移除後需按儲存才會寫入） */}
      <AlertDialog open={!!pendingRemoveRoomId} onOpenChange={(o) => { if (!o) setPendingRemoveRoomId(null); }}>
        <AlertDialogContent data-testid="order-room-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>確定移除這間房？</AlertDialogTitle>
            <AlertDialogDescription>
              移除後按「儲存」才會寫入資料庫。此訂單原本有房間明細時，房間明細不可存成 0 間。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="order-room-remove-cancel">取消</AlertDialogCancel>
            <AlertDialogAction
              data-testid="order-room-remove-confirm"
              onClick={() => {
                const id = pendingRemoveRoomId;
                setEditOrderRooms(prev => prev.filter(r => r.id !== id));
                setPendingRemoveRoomId(null);
              }}
            >
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 原本沒有房間明細、由系統合成的房間：客服確認後才寫入 */}
      <AlertDialog open={syntheticRoomPrompt} onOpenChange={(o) => { if (!o) setSyntheticRoomPrompt(false); }}>
        <AlertDialogContent data-testid="order-room-synthetic-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>此訂單原本沒有房間明細</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>系統依訂單資料帶出以下房間，尚未存進資料庫。請確認內容正確再寫入；不確定時可只儲存其他欄位。</p>
                <ul className="list-disc pl-5" data-testid="order-room-synthetic-list">
                  {editOrderRooms.map(r => (
                    <li key={r.id}>
                      {roomTypes.find(t => t.id === r.room_type_id)?.name || "房型"} × {r.quantity}，房價 NT${Number(r.room_price || 0).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              data-testid="order-room-synthetic-write"
              onClick={() => {
                syntheticDecisionRef.current = "write";
                setSyntheticRoomPrompt(false);
                void handleSaveEdit();
              }}
            >
              確認無誤，寫入房間明細並儲存
            </Button>
            <Button
              variant="outline"
              data-testid="order-room-synthetic-skip"
              onClick={() => {
                syntheticDecisionRef.current = "skip";
                setSyntheticRoomPrompt(false);
                void handleSaveEdit();
              }}
            >
              只儲存其他欄位，不寫入房間明細
            </Button>
            <AlertDialogCancel data-testid="order-room-synthetic-cancel">返回編輯</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* V5.5C.1：改為「已付清」但已付金額不足 */}
      <AlertDialog open={!!paidSyncPrompt} onOpenChange={(o) => { if (!o) setPaidSyncPrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>付款狀態為「已付清」，但已付金額少於應收</AlertDialogTitle>
            <AlertDialogDescription>
              應收 NT${(paidSyncPrompt?.expected ?? 0).toLocaleString()}，目前已付 NT${(paidSyncPrompt?.current ?? 0).toLocaleString()}，
              差額 NT${Math.max(0, (paidSyncPrompt?.expected ?? 0) - (paidSyncPrompt?.current ?? 0)).toLocaleString()}。請選擇處理方式。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              onClick={() => {
                const expected = paidSyncPrompt?.expected ?? 0;
                paidSyncOverrideRef.current = { paid_amount: expected };
                setEditForm((f) => ({ ...f, paid_amount: expected }));
                setPaidSyncPrompt(null);
                void handleSaveEdit();
              }}
            >
              已收齊，把已付金額更新為 NT${(paidSyncPrompt?.expected ?? 0).toLocaleString()}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                paidSyncOverrideRef.current = { payment_status: "deposit_paid" };
                setEditForm((f) => ({ ...f, payment_status: "deposit_paid" }));
                setPaidSyncPrompt(null);
                void handleSaveEdit();
              }}
            >
              維持已付 NT${(paidSyncPrompt?.current ?? 0).toLocaleString()}，狀態改為「已付訂金」
            </Button>
            <Button variant="ghost" onClick={() => setPaidSyncPrompt(null)}>
              取消，我要自己調整
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 改期對話框 */}
      {order && (
        <ChangeOrderDatesDialog
          open={changeDatesOpen}
          onOpenChange={setChangeDatesOpen}
          order={{
            id: order.id,
            order_number: order.order_number,
            order_source: order.order_source,
            payment_status: order.payment_status,
            check_in_date: order.check_in_date,
            check_out_date: order.check_out_date,
            accommodation_id: order.accommodation_id,
          }}
          mode={order.order_source === "kol" ? "kol" : "general"}
          onSuccess={fetchOrder}
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
                {orderCurrencyPrefix} {editFinalPrice.toLocaleString()}
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
      {isSuperAdmin && (
        <CommissionEligibilityExceptionDialog
          orderId={showMetaDrawer ? order.id : null}
          open={showMetaDrawer}
          onClose={() => setShowMetaDrawer(false)}
        />
      )}
      {isSuperAdmin && (
        <DealDateEditDialog
          open={dealDateOpen}
          onOpenChange={setDealDateOpen}
          orderId={order.id}
          orderNumber={order.order_number}
          accommodationId={(order as any).accommodation_id ?? null}
          currentOrderDate={order.order_date}
          onSaved={() => { fetchOrder(); }}
        />
      )}
      {kolQuotaPrompt && (
        <KolQuotaConfirmDialog
          open
          yearMonth={kolQuotaPrompt.yearMonth}
          used={kolQuotaPrompt.used}
          quota={kolQuotaPrompt.quota}
          packageName={kolQuotaPrompt.packageName}
          onCancel={() => { kolQuotaPrompt.resolve(false); setKolQuotaPrompt(null); }}
          onConfirm={() => { kolQuotaPrompt.resolve(true); setKolQuotaPrompt(null); }}
        />
      )}
    </div>
  );
};

export default OrderDetailPage;
