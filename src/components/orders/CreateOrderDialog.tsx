import { useEffect, useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Tag, X, Loader2, User, Phone, AlertTriangle, Plus, Minus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAuditLog } from "@/hooks/use-audit-log";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveTemplatePricesForDates } from "@/utils/templatePriceResolver";
import { Switch } from "@/components/ui/switch";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  is_exclusive_package?: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface AddonSetting {
  id: string;
  addon_type: string;
  description: string | null;
  price_per_unit: number;
  unit_label: string;
  enabled: boolean;
  max_quantity: number;
}

interface PricingTemplate {
  id: string;
  template_name: string;
  meal_plans: any;
  project_name: string | null;
  price: number | null;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
}

interface RoomUnit {
  id: string;
  room_type_id: string;
  display_order: number;
  is_active: boolean;
  unit_number?: string | null;
  nickname?: string | null;
}

interface OccupiedRoomUnitRow {
  room_unit_id: string | null;
  orders: { id: string } | null;
}

interface RoomSelection {
  id: string;
  room_type_id: string;
  template_id: string;
  template_name: string;
  quantity: number;
  roomPrice: number;
  filteredTemplates: PricingTemplate[];
  room_unit_id?: string | null;
}

interface InventoryWarning {
  date: string;
  roomTypeId?: string;
  roomName?: string;
  available: number;
  needed?: number;
  blocked?: boolean;
  blockedBy?: string;
  closed?: boolean; // 該日庫存被管理員關閉 (is_available=false)
}


interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (orderId: string) => void;
  initialData?: {
    check_in_date?: string;
    check_out_date?: string;
    room_type_id?: string;
  };
}

export function CreateOrderDialog({ open, onOpenChange, onSuccess, initialData }: CreateOrderDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const { logAction } = useAuditLog();
  const [isSaving, setIsSaving] = useState(false);
  // Deposit flow removed: orders always require full payment upfront.
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  const [addonSettings, setAddonSettings] = useState<AddonSetting[]>([]);
  const [pricingTemplates, setPricingTemplates] = useState<PricingTemplate[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [roomPrice, setRoomPrice] = useState(0);
  const [inventoryWarnings, setInventoryWarnings] = useState<InventoryWarning[]>([]);
  const [isCheckingInventory, setIsCheckingInventory] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; type: "percentage" | "amount"; value: number } | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [manualDiscountStr, setManualDiscountStr] = useState<string | null>(null);
  const manualDiscountInputRef = useRef<string | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  
  // Customer autocomplete states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<Customer[]>([]);
  const [phoneSuggestions, setPhoneSuggestions] = useState<Customer[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLDivElement>(null);
  
  // Selected addons
  const [selectedAddons, setSelectedAddons] = useState<{ addon_id: string; quantity: number }[]>([]);
  const [depositPct, setDepositPct] = useState<number>(30);

  // Multi-room selections
  const [roomSelections, setRoomSelections] = useState<RoomSelection[]>([]);
  // 散客房可選房號：載入該民宿所有 active room_units + 計算指定日期區間已被佔用的 unit
  const [allRoomUnits, setAllRoomUnits] = useState<RoomUnit[]>([]);
  const [occupiedUnitIdsForDates, setOccupiedUnitIdsForDates] = useState<Set<string>>(new Set());
  // 哈庫納馬塔塔：7 間房（最多 2 雙人房 + 4 四人房，加上 1 額外房型）
  const HAKUNA_ACC_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
  const SENSAN_ACC_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
  const YUNXIU_ACC_ID = "7690a606-6bac-4cd5-a3e7-2fa754b318e8";
  // 奧莉薇雅：8 雙人房 + 1 四人房 = 9 間房
  const OLIVIA_ACC_ID = "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8";
  const isHakuna = currentAccommodationId === HAKUNA_ACC_ID;
  const isSensan = currentAccommodationId === SENSAN_ACC_ID;
  const isYunxiu = currentAccommodationId === YUNXIU_ACC_ID;
  const isOlivia = currentAccommodationId === OLIVIA_ACC_ID;
  // 只有森山寫照保留「包區」用語，其餘民宿一律使用「包棟」
  const exclusiveLabel = isSensan ? "包區" : "包棟";
  const MAX_TOTAL_ROOMS = isHakuna ? 7 : isOlivia ? 9 : 6;
  const MAX_DOUBLE_ROOMS = isHakuna ? 2 : isOlivia ? 8 : 3;
  const MAX_QUAD_ROOMS = isHakuna ? 4 : isOlivia ? 1 : 3;

  // Booking mode: "exclusive" (包棟) or "normal" (非包棟) or "" (not yet selected)
  const [bookingMode, setBookingMode] = useState<"" | "exclusive" | "normal">("");
  const [exclusiveDoubleRooms, setExclusiveDoubleRooms] = useState(0);
  const [exclusiveQuadRooms, setExclusiveQuadRooms] = useState(0);
  // 額外包棟（roomSelections[1..]）的房間配置，key = selection.id
  const [extraExclusiveConfigs, setExtraExclusiveConfigs] = useState<Record<string, { double: number; quad: number }>>({});
  const setExtraExclusiveConfig = useCallback((selId: string, patch: Partial<{ double: number; quad: number }>) => {
    setExtraExclusiveConfigs(prev => ({
      ...prev,
      [selId]: { double: 0, quad: 0, ...(prev[selId] || {}), ...patch },
    }));
  }, []);

  // Phase 3: 每個包棟方案各自的房間組成（從 room_types.package_contents 讀取）。
  // breakdownByPackage[包棟房型 id] = [{ room_type_id: 自訂房間 id, name, count }, ...]
  type BreakdownItem = { room_type_id: string; name: string; count: number };
  const [breakdownByPackage, setBreakdownByPackage] = useState<Record<string, BreakdownItem[]>>({});
  const getPackageBreakdown = useCallback(
    (pkgRoomTypeId?: string | null): BreakdownItem[] | null => {
      if (!pkgRoomTypeId) return null;
      const arr = breakdownByPackage[pkgRoomTypeId];
      return arr && arr.length > 0 ? arr : null;
    },
    [breakdownByPackage],
  );
  // 第一棟包棟：room_type_id -> 間數
  const [exclusiveCustomCounts, setExclusiveCustomCounts] = useState<Record<string, number>>({});
  // 額外加棟：selection.id -> { room_type_id -> 間數 }
  const [extraExclusiveCustomCounts, setExtraExclusiveCustomCounts] = useState<Record<string, Record<string, number>>>({});
  const setExtraExclusiveCustomCount = useCallback((selId: string, rtId: string, count: number) => {
    setExtraExclusiveCustomCounts(prev => ({
      ...prev,
      [selId]: { ...(prev[selId] || {}), [rtId]: count },
    }));
  }, []);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // 奧莉薇雅：標記為包棟 → 自動鎖當天整棟所有其他房型
  const [lockWholeBuilding, setLockWholeBuilding] = useState(false);
  const [filteredTemplates, setFilteredTemplates] = useState<PricingTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    guest_gender: "",
    guest_nationality: "",
    check_in_date: "",
    check_out_date: "",
    room_type_id: "",
    meal_plan: "",
    guest_count: 2,
    order_status: "confirmed",
    deposit_payment_method: "",
    balance_payment_method: "",
    deposit_paid: false,
    balance_paid: false,
    deposit_amount: 0,
    notes: "",
    order_source: "",
    security_deposit_method: "cash" as "cash" | "card",
    security_deposit_amount: 5000,
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        guest_name: "",
        guest_phone: "",
        guest_email: "",
        guest_gender: "",
        guest_nationality: "",
        check_in_date: initialData?.check_in_date || "",
        check_out_date: initialData?.check_out_date || "",
        room_type_id: initialData?.room_type_id || "",
        meal_plan: "",
        guest_count: 2,
        order_status: "confirmed",
        deposit_payment_method: "",
        balance_payment_method: "",
        deposit_paid: false,
        balance_paid: false,
        deposit_amount: 0,
        notes: "",
        order_source: "",
        security_deposit_method: "cash",
        security_deposit_amount: 5000,
      });
      setSelectedAddons([]);
      setDiscountCode("");
      setAppliedDiscount(null);
      setManualDiscountStr(null);
      manualDiscountInputRef.current = null;
      setRoomPrice(0);
      setDepositPct(30);
      setNameSuggestions([]);
      setPhoneSuggestions([]);
      setShowNameSuggestions(false);
      setShowPhoneSuggestions(false);
      setSelectedTemplateId("");
      setFilteredTemplates([]);
      setRoomSelections([]);
      setBookingMode("");
      setExclusiveDoubleRooms(0);
      setExclusiveQuadRooms(0);
      setExtraExclusiveConfigs({});
      setExclusiveCustomCounts({});
      setExtraExclusiveCustomCounts({});
    }
  }, [open, initialData]);

  // Fetch room types, public holidays, and customers
  useEffect(() => {
    const fetchData = async () => {
      if (!currentAccommodationId) return;
      
      const [roomTypesResult, holidaysResult, customersResult, addonsResult, templatesResult] = await Promise.all([
        supabase
          .from("room_types")
          .select("id, name, capacity, is_exclusive_package")
          .eq("accommodation_id", currentAccommodationId)
          .order("display_order"),
        supabase
          .from("public_holidays")
          .select("holiday_date")
          .eq("accommodation_id", currentAccommodationId),
        supabase
          .from("customers")
          .select("id, name, phone, email")
          .eq("accommodation_id", currentAccommodationId)
          .order("name"),
        supabase
          .from("addon_settings")
          .select("id, addon_type, description, price_per_unit, unit_label, enabled, max_quantity")
          .eq("accommodation_id", currentAccommodationId)
          .eq("enabled", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("pricing_templates")
          .select("id, template_name, meal_plans, project_name, room_type_id, room_type_ids, price, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, valid_from, valid_until, room_overrides, season_segments, extra_dates, excluded_dates")
          .eq("accommodation_id", currentAccommodationId)
          .order("display_order")
      ]);

      if (!roomTypesResult.error && roomTypesResult.data) {
        setRoomTypes(roomTypesResult.data);
      }
      if (holidaysResult.data) {
        setPublicHolidays(holidaysResult.data.map(h => h.holiday_date));
      }
      if (!customersResult.error && customersResult.data) {
        setCustomers(customersResult.data);
      }
      if (!addonsResult.error && addonsResult.data) {
        setAddonSettings(addonsResult.data);
      }
      if (!templatesResult.error && templatesResult.data) {
        setPricingTemplates(templatesResult.data);
      }

      // Phase 3: 每個包棟方案各自從 room_types.package_contents 讀取房間組成
      const exclusivePkgs = (roomTypesResult.data || []).filter((r: any) => r.is_exclusive_package);
      if (exclusivePkgs.length > 0) {
        const { data: pkgRows } = await supabase
          .from("room_types")
          .select("id, package_contents")
          .in("id", exclusivePkgs.map((r: any) => r.id));
        const map: Record<string, BreakdownItem[]> = {};
        for (const row of (pkgRows || []) as any[]) {
          const contents = Array.isArray(row.package_contents) ? row.package_contents : [];
          const normalized: BreakdownItem[] = contents
            .map((it: any) => {
              const key = it?.id;
              const name = it?.name;
              const count = Number(it?.count) || 0;
              if (!key || !name || count <= 0) return null;
              return { room_type_id: String(key), name: String(name), count };
            })
            .filter(Boolean) as BreakdownItem[];
          if (normalized.length > 0) map[row.id] = normalized;
        }
        setBreakdownByPackage(map);
      } else {
        setBreakdownByPackage({});
      }
    };

    fetchData();
  }, [currentAccommodationId]);

  // 載入該民宿的訂金比例設定（HQ 設定會即時代入）
  useEffect(() => {
    const loadDepositPct = async () => {
      if (!currentAccommodationId) return;
      const { data } = await supabase
        .from("booking_settings")
        .select("deposit_percentage")
        .eq("accommodation_id", currentAccommodationId)
        .maybeSingle();
      if (data?.deposit_percentage != null) {
        setDepositPct(data.deposit_percentage);
      }
    };
    if (open) loadDepositPct();
  }, [currentAccommodationId, open]);

  // 載入該民宿所有 active room_units（用於散客房選房號）
  useEffect(() => {
    const loadUnits = async () => {
      if (!currentAccommodationId) { setAllRoomUnits([]); return; }
      const { data } = await supabase
        .from("room_units")
        .select("id, room_type_id, display_order, is_active, unit_number, nickname")
        .eq("accommodation_id", currentAccommodationId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      setAllRoomUnits((data as any[]) || []);
    };
    loadUnits();
  }, [currentAccommodationId]);

  // 載入指定入住區間已被其他訂單佔用的 room_units
  useEffect(() => {
    const loadOccupied = async () => {
      if (!currentAccommodationId || !form.check_in_date || !form.check_out_date) {
        setOccupiedUnitIdsForDates(new Set());
        return;
      }
      const { data } = await supabase
        .from("order_rooms")
        .select("room_unit_id, orders!inner(id, accommodation_id, order_status, check_in_date, check_out_date)")
        .not("room_unit_id", "is", null)
        .eq("orders.accommodation_id", currentAccommodationId)
        .neq("orders.order_status", "cancelled")
        .lt("orders.check_in_date", form.check_out_date)
        .gt("orders.check_out_date", form.check_in_date);
      const ids = new Set<string>();
      ((data as OccupiedRoomUnitRow[] | null) || []).forEach((row) => {
        if (row.room_unit_id) ids.add(row.room_unit_id);
      });
      setOccupiedUnitIdsForDates(ids);
    };
    loadOccupied();
  }, [currentAccommodationId, form.check_in_date, form.check_out_date]);


  // Helper: get templates for a room_type_id（含期限硬性限制）
  const getTemplatesForRoomType = useCallback((roomTypeId: string) => {
    if (!roomTypeId || pricingTemplates.length === 0) return [];
    // 計算當下訂單入住期間
    const nights = (() => {
      if (!form.check_in_date || !form.check_out_date) return 0;
      const ci = new Date(form.check_in_date);
      const co = new Date(form.check_out_date);
      return Math.max(0, Math.ceil((co.getTime() - ci.getTime()) / 86400000));
    })();
    const dateStrs: string[] = [];
    if (nights > 0 && form.check_in_date) {
      const start = new Date(form.check_in_date);
      for (let i = 0; i < nights; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dateStrs.push(format(d, "yyyy-MM-dd"));
      }
    }
    const inValidRange = (t: any) => {
      const vf = t?.valid_from || null;
      const vu = t?.valid_until || null;
      if (!vf && !vu) return true;
      if (dateStrs.length === 0) return true;
      return dateStrs.every(d => (!vf || d >= vf) && (!vu || d <= vu));
    };
    const filtered = pricingTemplates.filter(t => {
      const ids = (t as any).room_type_ids;
      const matches = Array.isArray(ids) && ids.length > 0
        ? ids.includes(roomTypeId)
        : (t as any).room_type_id === roomTypeId;
      return matches && inValidRange(t);
    });
    const result = filtered.length > 0
      ? filtered
      : pricingTemplates.filter(t => {
          const ids = (t as any).room_type_ids;
          const hasIds = Array.isArray(ids) && ids.length > 0;
          return !hasIds && !(t as any).room_type_id && inValidRange(t);
        });
    return result.length > 0 ? result : pricingTemplates.filter(inValidRange);
  }, [pricingTemplates, form.check_in_date, form.check_out_date]);

  // Keep legacy form.room_type_id in sync (old template filter useEffect kept for compat)
  useEffect(() => {
    if (!form.room_type_id) {
      setFilteredTemplates([]);
      setSelectedTemplateId("");
      setForm(prev => ({ ...prev, meal_plan: "" }));
      setIsLoadingTemplates(false);
      return;
    }
    const finalList = getTemplatesForRoomType(form.room_type_id);
    setFilteredTemplates(finalList);
    setSelectedTemplateId(prev => {
      const stillExists = finalList.some(t => t.id === prev);
      return stillExists ? prev : finalList[0]?.id || "";
    });
    setForm(prev => {
      const stillExists = finalList.some(t => t.template_name === prev.meal_plan);
      return { ...prev, meal_plan: stillExists ? prev.meal_plan : finalList[0]?.template_name || "" };
    });
    setIsLoadingTemplates(false);
  }, [form.room_type_id, pricingTemplates, getTemplatesForRoomType]);

  // Multi-room helpers
  // 解除間數上限：每筆 selection 各自佔自己的間數，包棟視為 1 棟
  const getEffectiveQuantity = useCallback((sel: RoomSelection) => sel.quantity, []);
  const totalRoomCount = roomSelections.reduce((sum, s) => sum + getEffectiveQuantity(s), 0);
  const hasExclusivePackage = roomSelections.some(s => roomTypes.find(r => r.id === s.room_type_id)?.is_exclusive_package);

  const addRoomSelection = useCallback((preferExclusive = false) => {
    const id = crypto.randomUUID();
    const candidates = preferExclusive
      ? [...roomTypes.filter(r => r.is_exclusive_package), ...roomTypes.filter(r => !r.is_exclusive_package)]
      : [...roomTypes.filter(r => !r.is_exclusive_package), ...roomTypes.filter(r => r.is_exclusive_package)];
    const defaultRoomType = candidates[0];
    // 雲岫散客房：自動依序代入尚未被使用的房型
    setRoomSelections(prev => {
      let chosen = defaultRoomType;
      if (isYunxiu && !preferExclusive) {
        const fitRoomTypes = roomTypes.filter(r => !r.is_exclusive_package);
        const usedIds = new Set(
          prev
            .filter(s => !roomTypes.find(r => r.id === s.room_type_id)?.is_exclusive_package)
            .map(s => s.room_type_id)
        );
        const nextUnused = fitRoomTypes.find(r => !usedIds.has(r.id));
        if (nextUnused) chosen = nextUnused;
      }
      // 加包棟時：自動跳過已被選用的包棟房型，避免每次都預設成第一棟造成重複
      if (preferExclusive) {
        const exclusiveTypes = roomTypes.filter(r => r.is_exclusive_package);
        const usedExcIds = new Set(
          prev
            .filter(s => roomTypes.find(r => r.id === s.room_type_id)?.is_exclusive_package)
            .map(s => s.room_type_id)
        );
        const nextUnusedExc = exclusiveTypes.find(r => !usedExcIds.has(r.id));
        if (nextUnusedExc) chosen = nextUnusedExc;
      }
      if (!chosen) return prev;
      const templates = getTemplatesForRoomType(chosen.id);
      // 同一組訂單共用同一個專案：若主方案的 template 在新房型的可選範圍內，直接沿用
      const primaryTplId = prev[0]?.template_id;
      const inheritedTpl = primaryTplId ? templates.find(t => t.id === primaryTplId) : undefined;
      const useTpl = inheritedTpl || templates[0];
      return [...prev, {
        id,
        room_type_id: chosen.id,
        template_id: useTpl?.id || "",
        template_name: useTpl?.template_name || "",
        quantity: 1,
        roomPrice: 0,
        filteredTemplates: templates,
      }];
    });
  }, [roomTypes, getTemplatesForRoomType, isYunxiu]);

  const removeRoomSelection = useCallback((selId: string) => {
    setRoomSelections(prev => prev.filter(s => s.id !== selId));
  }, []);

  const updateRoomSelection = useCallback((selId: string, updates: Partial<RoomSelection>) => {
    setRoomSelections(prev => prev.map((s, idx) => {
      if (s.id !== selId) return s;
      const updated = { ...s, ...updates };
      if (updates.room_type_id && updates.room_type_id !== s.room_type_id) {
        const templates = getTemplatesForRoomType(updates.room_type_id);
        const newRt = roomTypes.find(r => r.id === updates.room_type_id);
        updated.filteredTemplates = templates;
        // 沿用主方案的 template（若可用）；只有主列(idx=0)或無法沿用時才用第一個
        const primaryTplId = idx === 0 ? null : prev[0]?.template_id;
        const inherited = primaryTplId ? templates.find(t => t.id === primaryTplId) : undefined;
        const useTpl = inherited || templates[0];
        updated.template_id = useTpl?.id || "";
        updated.template_name = useTpl?.template_name || "";
        // 切到包棟時鎖為 1
        if (newRt?.is_exclusive_package) updated.quantity = 1;
        // 換房型時清掉房號選擇
        updated.room_unit_id = null;
      }
      return updated;
    }));
  }, [getTemplatesForRoomType, roomTypes]);


  const changeRoomQuantity = useCallback((selId: string, delta: number) => {
    setRoomSelections(prev => {
      const sel = prev.find(s => s.id === selId);
      if (!sel) return prev;
      const rt = roomTypes.find(r => r.id === sel.room_type_id);
      if (rt?.is_exclusive_package) return prev; // 包棟一筆=1 棟，不可調整
      const newQty = sel.quantity + delta;
      if (newQty < 1) return prev;
      return prev.map(s => s.id === selId ? { ...s, quantity: newQty } : s);
    });
  }, [roomTypes]);

  // Calculate room prices for all selections
  const roomSelectionsKey = roomSelections.map(s => `${s.room_type_id}-${s.template_id}-${s.quantity}`).join(',');
  useEffect(() => {
    let cancelled = false;
    const calcPrices = async () => {
      if (roomSelections.length === 0 || !form.check_in_date || !form.check_out_date || !currentAccommodationId) {
        setRoomPrice(0);
        return;
      }
      const nights = calculateNights();
      if (nights === 0) { setRoomPrice(0); return; }

      const dates: string[] = [];
      const start = new Date(form.check_in_date);
      for (let i = 0; i < nights; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(format(d, "yyyy-MM-dd"));
      }

      // Snapshot 當下要算的 selections（id + 規格），算完後依 id merge 回去，
      // 避免 await 期間使用者切換房型／加棟被本 effect 用 stale state 覆寫造成「跳針」。
      const snapshot = roomSelections.map(s => ({
        id: s.id,
        room_type_id: s.room_type_id,
        template_id: s.template_id,
        quantity: s.quantity,
      }));

      const priceById = new Map<string, number>();
      let totalPrice = 0;
      for (const sel of snapshot) {
        const template = pricingTemplates.find(t => t.id === sel.template_id);
        const priceMap = await resolveTemplatePricesForDates({
          roomTypeId: sel.room_type_id,
          template: template ?? null,
          dates,
          publicHolidays,
        });
        if (cancelled) return;
        let perRoom = 0;
        for (const dateStr of dates) {
          perRoom += priceMap[dateStr] ?? 0;
        }
        const selPrice = perRoom * sel.quantity;
        priceById.set(sel.id, selPrice);
        totalPrice += selPrice;
      }

      if (cancelled) return;
      setRoomSelections(prev => prev.map(s => {
        const snap = snapshot.find(x => x.id === s.id);
        // 只有規格仍與快照一致時才寫回價格；使用者已換房型/方案/間數則略過，等下一輪重算
        if (!snap) return s;
        if (
          snap.room_type_id !== s.room_type_id ||
          snap.template_id !== s.template_id ||
          snap.quantity !== s.quantity
        ) return s;
        const p = priceById.get(s.id);
        return p === undefined || p === s.roomPrice ? s : { ...s, roomPrice: p };
      }));
      setRoomPrice(totalPrice);
    };

    calcPrices();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.check_in_date, form.check_out_date, roomSelectionsKey, currentAccommodationId, pricingTemplates, publicHolidays]);

  // Handle customer name search
  const handleNameChange = useCallback((value: string) => {
    setForm(prev => ({ ...prev, guest_name: value }));
    if (value.trim().length > 0) {
      const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 5);
      setNameSuggestions(filtered);
      setShowNameSuggestions(filtered.length > 0);
    } else {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
    }
  }, [customers]);

  const handlePhoneChange = useCallback((value: string) => {
    setForm(prev => ({ ...prev, guest_phone: value }));
    if (value.trim().length > 2) {
      const filtered = customers.filter(c => 
        c.phone && c.phone.includes(value)
      ).slice(0, 5);
      setPhoneSuggestions(filtered);
      setShowPhoneSuggestions(filtered.length > 0);
    } else {
      setPhoneSuggestions([]);
      setShowPhoneSuggestions(false);
    }
  }, [customers]);

  const selectCustomer = useCallback((customer: Customer) => {
    setForm(prev => ({
      ...prev,
      guest_name: customer.name,
      guest_phone: customer.phone || "",
      guest_email: customer.email || "",
    }));
    setShowNameSuggestions(false);
    setShowPhoneSuggestions(false);
    toast({ title: "已帶入客戶資料", description: `${customer.name}` });
  }, [toast]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (nameInputRef.current && !nameInputRef.current.contains(event.target as Node)) {
        setShowNameSuggestions(false);
      }
      if (phoneInputRef.current && !phoneInputRef.current.contains(event.target as Node)) {
        setShowPhoneSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const calculateNights = () => {
    if (!form.check_in_date || !form.check_out_date) return 0;
    const start = new Date(form.check_in_date);
    const end = new Date(form.check_out_date);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
  };

  const calculateDiscount = (total: number) => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === "percentage") {
      return Math.round(total * (appliedDiscount.value / 100));
    }
    return appliedDiscount.value;
  };

  const buildStayDates = useCallback(() => {
    const nights = calculateNights();
    if (nights <= 0) return [];
    const start = new Date(form.check_in_date);
    return Array.from({ length: nights }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return format(d, "yyyy-MM-dd");
    });
  }, [form.check_in_date, form.check_out_date]);

  const validateInventoryAvailability = useCallback(async (): Promise<InventoryWarning[]> => {
    if (roomSelections.length === 0 || !form.check_in_date || !form.check_out_date || !currentAccommodationId) return [];

    const dates = buildStayDates();
    if (dates.length === 0) return [];

    const requiredByRoomType = new Map<string, number>();
    roomSelections.forEach((sel) => {
      requiredByRoomType.set(sel.room_type_id, (requiredByRoomType.get(sel.room_type_id) || 0) + sel.quantity);
    });

    const roomTypeIds = Array.from(requiredByRoomType.keys());

    // 同步抓取「庫存是否被管理員關閉」(is_available=false)
    const { data: baseRows, error: baseErr } = await supabase
      .from("room_inventory_pricing")
      .select("room_type_id, date, is_available")
      .in("room_type_id", roomTypeIds)
      .in("date", dates);
    if (baseErr) throw baseErr;
    const closedMap = new Map<string, boolean>();
    (baseRows || []).forEach((r: any) => {
      if (r.is_available === false) closedMap.set(`${r.room_type_id}:${r.date}`, true);
    });

    // Use RPC that includes exclusive-package mutual exclusion logic
    const results = await Promise.all(
      roomTypeIds.map(async (roomTypeId) => {
        const { data, error } = await supabase.rpc("get_adjusted_room_inventory_batch", {
          p_room_type_id: roomTypeId,
          p_dates: dates,
          p_accommodation_id: currentAccommodationId,
        });
        if (error) throw error;
        return { roomTypeId, rows: data || [] };
      })
    );

    const warnings: InventoryWarning[] = [];
    results.forEach(({ roomTypeId, rows }) => {
      const needed = requiredByRoomType.get(roomTypeId) || 0;
      const roomName = roomTypes.find((room) => room.id === roomTypeId)?.name || "房型";

      rows.forEach((row: any) => {
        const dateStr = typeof row.date_value === "string" ? row.date_value : format(new Date(row.date_value), "yyyy-MM-dd");
        const available = row.available_rooms ?? 0;
        if (closedMap.get(`${roomTypeId}:${dateStr}`)) {
          warnings.push({
            date: dateStr,
            roomTypeId,
            roomName,
            available: 0,
            needed,
            blocked: true,
            closed: true,
          });
          return;
        }
        if (row.is_blocked) {
          warnings.push({
            date: dateStr,
            roomTypeId,
            roomName,
            available: 0,
            needed,
            blocked: true,
            blockedBy: row.blocked_by_room_name || undefined,
          });
        } else if (available < needed) {
          warnings.push({ date: dateStr, roomTypeId, roomName, available, needed });
        }
      });
    });

    return warnings;
  }, [buildStayDates, currentAccommodationId, form.check_in_date, form.check_out_date, roomSelections, roomTypes]);


  // 回傳每個 selection 對應 quantity 個自動安排的 unit IDs（依 display_order）
  // 已被手動指定的 unit 會優先排除；同型房型可批次連續指派
  const getAutomaticRoomUnitAssignments = useCallback(async (selections: RoomSelection[]) => {
    const assignments = new Map<string, string[]>();
    if (!currentAccommodationId || !form.check_in_date || !form.check_out_date) return assignments;

    const fitSelections = selections.filter((sel) => sel.quantity > 0);
    if (fitSelections.length === 0) return assignments;

    const roomTypeIds = Array.from(new Set(fitSelections.map((sel) => sel.room_type_id)));
    const [unitsResult, occupiedResult] = await Promise.all([
      supabase
        .from("room_units")
        .select("id, room_type_id, display_order, is_active")
        .eq("accommodation_id", currentAccommodationId)
        .eq("is_active", true)
        .in("room_type_id", roomTypeIds)
        .order("display_order", { ascending: true }),
      supabase
        .from("order_rooms")
        .select("room_unit_id, orders!inner(id, accommodation_id, order_status, check_in_date, check_out_date)")
        .not("room_unit_id", "is", null)
        .eq("orders.accommodation_id", currentAccommodationId)
        .neq("orders.order_status", "cancelled")
        .lt("orders.check_in_date", form.check_out_date)
        .gt("orders.check_out_date", form.check_in_date),
    ]);

    if (unitsResult.error) throw unitsResult.error;
    if (occupiedResult.error) throw occupiedResult.error;

    const reservedUnitIds = new Set<string>();
    ((occupiedResult.data as OccupiedRoomUnitRow[] | null) || []).forEach((row) => {
      if (row.room_unit_id) reservedUnitIds.add(row.room_unit_id);
    });
    // 排除使用者已手動指派的 unit
    selections.forEach((sel) => {
      if (sel.room_unit_id) reservedUnitIds.add(sel.room_unit_id);
    });

    const units = ((unitsResult.data as RoomUnit[]) || []).sort((a, b) => a.display_order - b.display_order);
    fitSelections.forEach((sel) => {
      const needed = sel.room_unit_id ? sel.quantity - 1 : sel.quantity;
      if (needed <= 0) return;
      const pool = units.filter((u) => u.room_type_id === sel.room_type_id && !reservedUnitIds.has(u.id));
      const picked = pool.slice(0, needed).map((u) => u.id);
      picked.forEach((id) => reservedUnitIds.add(id));
      if (picked.length > 0) assignments.set(sel.id, picked);
    });

    return assignments;
  }, [currentAccommodationId, form.check_in_date, form.check_out_date]);

  // Check inventory warnings (for all room selections)
  useEffect(() => {
    const checkInventory = async () => {
      if (roomSelections.length === 0 || !form.check_in_date || !form.check_out_date || !currentAccommodationId) {
        setInventoryWarnings([]);
        return;
      }
      setIsCheckingInventory(true);
      try {
        const warnings = await validateInventoryAvailability();
        setInventoryWarnings(warnings);
      } catch (error) {
        console.error("查詢庫存失敗:", error);
      } finally {
        setIsCheckingInventory(false);
      }
    };
    checkInventory();
  }, [form.check_in_date, form.check_out_date, roomSelectionsKey, currentAccommodationId, validateInventoryAvailability]);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !currentAccommodationId) {
      toast({ title: "請輸入折扣代碼", variant: "destructive" });
      return;
    }

    setIsValidatingCode(true);
    try {
      const { data, error } = await supabase.rpc('validate_discount_code', {
        p_code: discountCode.trim().toUpperCase(),
        p_accommodation_id: currentAccommodationId,
        p_order_amount: roomPrice,
        p_room_type_id: form.room_type_id || null,
        p_check_in_date: form.check_in_date || null
      });

      if (error) throw error;
      const result = data[0];
      
      if (result.is_valid) {
        setAppliedDiscount({
          code: discountCode.trim().toUpperCase(),
          type: result.discount_type as "percentage" | "amount",
          value: result.discount_value
        });
        toast({
          title: "折扣代碼已套用",
          description: `已套用 ${result.discount_type === "percentage" ? `${result.discount_value}% 折扣` : `NT$ ${result.discount_value} 折扣`}`,
        });
      } else {
        toast({ title: "折扣代碼無效", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error validating discount code:", error);
      toast({ title: "驗證失敗", description: "無法驗證折扣代碼，請稍後再試", variant: "destructive" });
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    setManualDiscountStr(null);
    manualDiscountInputRef.current = null;
    toast({ title: "已移除折扣", description: "折扣代碼已清除" });
  };

  // Calculate totals
  const calculateTotalsForSelections = (selections: RoomSelection[]) => {
    const addonNights = Math.max(1, calculateNights());
    const addonTotal = selectedAddons.reduce((sum, a) => {
      const addon = addonSettings.find(ad => ad.id === a.addon_id);
      return sum + (addon ? addon.price_per_unit * a.quantity * addonNights : 0);
    }, 0);
    // Use explicit selection prices to avoid stale roomPrice state during submit
    const actualRoomTotal = selections.reduce((sum, sel) => sum + sel.roomPrice, 0);
    const codeDiscount = calculateDiscount(actualRoomTotal);
    const manualDiscountValue = manualDiscountInputRef.current ?? manualDiscountStr;
    const discount = manualDiscountValue !== null
      ? Math.max(0, parseInt(manualDiscountValue) || 0)
      : codeDiscount;
    const subtotal = actualRoomTotal + addonTotal;
    const final_ = Math.max(0, actualRoomTotal - discount + addonTotal);
    return { roomTotal: actualRoomTotal, addonTotal, subtotal, discount, final: final_ };
  };

  const getTotals = () => calculateTotalsForSelections(roomSelections);

  const handleSave = async () => {
    if (!form.guest_name.trim()) {
      toast({ title: "請輸入訂購人姓名", variant: "destructive" });
      return;
    }
    if (!form.guest_phone.trim()) {
      toast({ title: "請輸入聯絡電話", variant: "destructive" });
      return;
    }
    if (!form.check_in_date || !form.check_out_date) {
      toast({ title: "日期錯誤", description: "請選擇入住和退房日期", variant: "destructive" });
      return;
    }
    const checkInDate = parseISO(form.check_in_date);
    const checkOutDate = parseISO(form.check_out_date);
    if (!isAfter(checkOutDate, checkInDate)) {
      toast({ title: "日期錯誤", description: "退房日期必須在入住日期之後", variant: "destructive" });
      return;
    }
    if (roomSelections.length === 0) {
      toast({ title: "房型錯誤", description: "請至少新增一間房", variant: "destructive" });
      return;
    }
    for (const sel of roomSelections) {
      if (!sel.room_type_id) {
        toast({ title: "房型錯誤", description: "請選擇所有房間的房型", variant: "destructive" });
        return;
      }
    }
    if (!currentAccommodationId) {
      toast({ title: "系統錯誤", description: "無法取得住宿資訊", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    // Block creation with a fresh inventory check, not stale UI warnings.
    let latestInventoryWarnings: InventoryWarning[] = [];
    try {
      latestInventoryWarnings = await validateInventoryAvailability();
      setInventoryWarnings(latestInventoryWarnings);
    } catch (error) {
      console.error("查詢庫存失敗:", error);
      toast({ title: "無法確認庫存", description: "請稍後再試，避免建立超過庫存的訂單", variant: "destructive" });
      setIsSaving(false);
      return;
    }

    if (latestInventoryWarnings.length > 0) {
      const blockedDates = latestInventoryWarnings.filter(w => w.blocked || w.available <= 0);
      if (blockedDates.length > 0) {
        const dateList = blockedDates.map(w => `${format(parseISO(w.date), "MM/dd")}${w.roomName ? ` ${w.roomName}` : ""}`).join("、");
        toast({
          title: "無法建立訂單",
          description: `${dateList} 已關閉庫存，無法建立訂單`,
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }
      const insufficientDates = latestInventoryWarnings.filter(w => !w.blocked && w.available > 0);
      if (insufficientDates.length > 0) {
        const dateList = insufficientDates.map(w => `${format(parseISO(w.date), "MM/dd")}${w.roomName ? ` ${w.roomName}` : ""}(剩 ${w.available}，需 ${w.needed ?? 1})`).join("、");
        toast({
          title: "庫存不足",
          description: `${dateList}，無法建立訂單`,
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }
    }

    try {
      // Recompute room prices synchronously to avoid stale 0 values from async useEffect race
      let pricedRoomSelections = roomSelections.map(sel => ({ ...sel }));
      const nights = calculateNights();
      if (nights > 0) {
        const dates: string[] = [];
        const start = new Date(form.check_in_date);
        for (let i = 0; i < nights; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          dates.push(format(d, "yyyy-MM-dd"));
        }

        // 確保 pricingTemplates 已載入（避免使用者太快按存檔時模板還沒 fetch 完）
        const templatesById = new Map(pricingTemplates.map(t => [t.id, t] as const));
        const missingTemplateIds = Array.from(new Set(
          pricedRoomSelections.map(s => s.template_id).filter((id): id is string => !!id && !templatesById.has(id))
        ));
        if (missingTemplateIds.length > 0) {
          const { data: fetchedTemplates } = await supabase
            .from('pricing_templates')
            .select('id, template_name, project_name, price, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, room_overrides, season_segments, extra_dates, excluded_dates, valid_from, valid_until')
            .in('id', missingTemplateIds);
          (fetchedTemplates || []).forEach((t: any) => templatesById.set(t.id, t));
        }

        for (const sel of pricedRoomSelections) {
          const template = sel.template_id ? templatesById.get(sel.template_id) : null;
          const priceMap = await resolveTemplatePricesForDates({
            roomTypeId: sel.room_type_id,
            template: template ?? null,
            dates,
            publicHolidays,
          });
          let perRoom = 0;
          for (const dateStr of dates) {
            perRoom += priceMap[dateStr] ?? 0;
          }
          const recomputed = perRoom * sel.quantity;
          // 重算 > 0 一律覆寫；重算 = 0 時保留原本已顯示的 roomPrice，避免價格被清掉
          if (recomputed > 0) {
            sel.roomPrice = recomputed;
          }
          // sel.roomPrice 已是最新值（原本 state + 本次重算），後續用它計算 totals 與寫入 order_rooms
        }
      }
      const totals = calculateTotalsForSelections(pricedRoomSelections);
      // 不要呼叫 setRoomSelections(pricedRoomSelections)，因為這會觸發 useEffect (line ~398)
      // 直接 mutate 狀態中的 sel.roomPrice，導致 order_rooms insert 時讀到被覆寫的值而與
      // orders.total_price 不一致。此處只更新顯示用的 roomPrice。
      setRoomPrice(totals.roomTotal);

      // 防呆：若房費總額為 0，提醒使用者（通常是該房型在該日期沒有設定專案/庫存價）
      if (totals.roomTotal <= 0) {
        const missing = pricedRoomSelections
          .map(sel => roomTypes.find(r => r.id === sel.room_type_id)?.name)
          .filter(Boolean)
          .join("、");
        const proceed = window.confirm(
          `偵測到房費為 NT$ 0（${missing || "所選房型"}在該日期沒有可用價格）。\n\n` +
          `請先到「房價管理」為該房型設定專案價/庫存價，或在訂單建立後到訂單詳情手動修改金額。\n\n` +
          `仍要以 NT$ 0 建立訂單嗎？`
        );
        if (!proceed) {
          setIsSaving(false);
          return;
        }
      }

      const isBankTransfer = form.balance_payment_method === "bank_transfer";

      // 驗證：訂金欄位只在匯款時有效；金額必須 > 0 且 ≤ 尾款（即 ≤ final/2）
      let depositAmount = 0;
      if (isBankTransfer && !form.balance_paid) {
        const rawDeposit = Number(form.deposit_amount) || 0;
        if (rawDeposit < 0) {
          toast({ title: "訂金金額不可為負數", variant: "destructive" });
          setIsSaving(false);
          return;
        }
        const maxDeposit = totals.final;
        if (rawDeposit > maxDeposit) {
          toast({
            title: "訂金金額不合法",
            description: `訂金不可超過訂單總額 NT$ ${maxDeposit.toLocaleString()}`,
            variant: "destructive",
          });
          setIsSaving(false);
          return;
        }
        if (form.deposit_paid && rawDeposit <= 0) {
          toast({ title: "請輸入訂金金額", description: "選擇「已付訂金」時，訂金金額必須大於 0", variant: "destructive" });
          setIsSaving(false);
          return;
        }
        depositAmount = rawDeposit;
      }
      const balanceAmount = totals.final - depositAmount;

      let paymentStatus = "unpaid";
      let paidAmount = 0;
      if (form.balance_paid) {
        // 已付清：訂金/尾款一律視為全付
        paymentStatus = "paid";
        paidAmount = totals.final;
        depositAmount = 0;
      } else if (isBankTransfer && form.deposit_paid && depositAmount > 0) {
        paymentStatus = "deposit_paid";
        paidAmount = depositAmount;
      }

      const { data: orderNumber, error: orderNumberError } = await supabase.rpc('generate_order_number');
      if (orderNumberError) throw orderNumberError;

      // Use first room selection as primary room_type_id
      const primaryRoom = pricedRoomSelections[0];

      const { data: orderData, error } = await supabase.from("orders").insert({
        accommodation_id: currentAccommodationId,
        order_number: orderNumber,
        guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone.trim(),
        guest_email: form.guest_email.trim() || null,
        guest_gender: form.guest_gender || null,
        guest_nationality: form.guest_nationality.trim() || null,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        room_type_id: primaryRoom.room_type_id,
        guest_count: form.guest_count,
        order_status: form.order_status,
        payment_status: paymentStatus,
        deposit_payment_method: form.deposit_payment_method || null,
        balance_payment_method: form.balance_payment_method || null,
        deposit_amount: depositAmount,
        paid_amount: paidAmount,
        notes: (() => {
          let note = form.notes.trim();
          const pkgLines: string[] = [];
          if (bookingMode === 'exclusive') {
            const firstBd = getPackageBreakdown(roomSelections[0]?.room_type_id);
            if (firstBd) {
              const parts = firstBd
                .map(bd => ({ name: bd.name, count: exclusiveCustomCounts[bd.room_type_id] ?? 0 }))
                .filter(p => p.count > 0);
              if (parts.length > 0) {
                pkgLines.push(`【${exclusiveLabel}房間配置】${parts.map(p => `${p.name} ${p.count} 間`).join("、")}`);
              }
            } else if (exclusiveDoubleRooms > 0 || exclusiveQuadRooms > 0) {
              pkgLines.push(`【${exclusiveLabel}房間配置】雙人房 ${exclusiveDoubleRooms} 間、四人房 ${exclusiveQuadRooms} 間`);
            }
          }
          // 額外加棟（roomSelections[1..]）的包棟配置
          pricedRoomSelections.slice(1).forEach(sel => {
            const isExc = !!roomTypes.find(r => r.id === sel.room_type_id)?.is_exclusive_package;
            if (!isExc) return;
            const bd = getPackageBreakdown(sel.room_type_id);
            if (bd) {
              const map = extraExclusiveCustomCounts[sel.id] || {};
              const parts = bd
                .map(bdRow => ({ name: bdRow.name, count: map[bdRow.room_type_id] ?? 0 }))
                .filter(p => p.count > 0);
              if (parts.length > 0) {
                pkgLines.push(`【${exclusiveLabel}房間配置】${parts.map(p => `${p.name} ${p.count} 間`).join("、")}`);
              }
              return;
            }
            const cfg = extraExclusiveConfigs[sel.id];
            if (cfg && (cfg.double > 0 || cfg.quad > 0)) {
              pkgLines.push(`【${exclusiveLabel}房間配置】雙人房 ${cfg.double} 間、四人房 ${cfg.quad} 間`);
            }
          });
          if (pkgLines.length > 0) {
            note = note ? `${pkgLines.join("\n")}\n${note}` : pkgLines.join("\n");
          }
          return note || null;
        })(),
        total_price: totals.roomTotal + totals.addonTotal,
        discount_amount: totals.discount,
        final_price: totals.final,
        discount_code: appliedDiscount?.code || null,
        meal_plan: primaryRoom.template_name || null,
        meal_plan_details: null,
        custom_addon_details: selectedAddons.length > 0
          ? selectedAddons.map(a => {
              const addon = addonSettings.find(ad => ad.id === a.addon_id);
              const addonNights = Math.max(1, calculateNights());
              return {
                addon_type: addon?.addon_type || '',
                count: a.quantity,
                price_per_unit: addon?.price_per_unit || 0,
                total: (addon?.price_per_unit || 0) * a.quantity * addonNights,
                unit_label: addon?.unit_label || '',
              };
            })
          : null,
        confirmed_at: form.order_status === "confirmed" ? new Date().toISOString() : null,
        order_source: form.order_source || "manual",
        owner_direct: form.order_source === "owner_provided",

        deposit_required_amount: form.security_deposit_amount,
        deposit_method: form.security_deposit_method,
        deposit_status: "pending",
        lock_whole_building: isOlivia ? lockWholeBuilding : false,
      }).select('id').single();

      if (error) throw error;

      const automaticRoomUnitAssignments = await getAutomaticRoomUnitAssignments(pricedRoomSelections);

      // Insert order_rooms（quantity===1 時套用手動或自動安排；quantity>1 維持單列不指派個別單元）
      if (orderData?.id && pricedRoomSelections.length > 0) {
        const orderRooms = pricedRoomSelections.map(sel => {
          const autoUnit = automaticRoomUnitAssignments.get(sel.id)?.[0] || null;
          const unitId = sel.quantity === 1 ? (sel.room_unit_id || autoUnit) : null;
          return {
            order_id: orderData.id,
            room_type_id: sel.room_type_id,
            quantity: sel.quantity,
            room_price: sel.roomPrice,
            template_id: sel.template_id || null,
            template_name: sel.template_name || null,
            room_unit_id: unitId,
          };
        });
        const { error: roomsError } = await supabase.from("order_rooms").insert(orderRooms);
        if (roomsError) {
          await supabase.from("orders").delete().eq("id", orderData.id);
          throw roomsError;
        }

        // Final safety sync: the order header must mirror the exact selections saved in order_rooms.
        const savedRoomTotal = pricedRoomSelections.reduce((sum, sel) => sum + sel.roomPrice, 0);
        const savedDiscount = Math.max(0, Math.min(totals.discount, savedRoomTotal + totals.addonTotal));
        const savedFinal = Math.max(0, savedRoomTotal + totals.addonTotal - savedDiscount);
        const { error: syncError } = await supabase
          .from("orders")
          .update({
            total_price: savedRoomTotal + totals.addonTotal,
            discount_amount: savedDiscount,
            final_price: savedFinal,
            paid_amount: form.balance_paid ? savedFinal : paidAmount,
          })
          .eq("id", orderData.id);
        if (syncError) throw syncError;
      }

      if (error) throw error;

      // KOL Webhook
      if (appliedDiscount && orderData?.id) {
        try {
          await supabase.functions.invoke('kol-webhook', { body: { order_id: orderData.id } });
        } catch { /* ignore */ }
      }

      // Update or create customer record
      const guestName = form.guest_name.trim();
      const guestPhone = form.guest_phone.trim();
      const guestEmail = form.guest_email.trim() || null;

      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id, visit_count")
        .eq("accommodation_id", currentAccommodationId)
        .eq("phone", guestPhone)
        .maybeSingle();

      let customerId: string | null = null;
      if (existingCustomer) {
        await supabase
          .from("customers")
          .update({
            name: guestName,
            email: guestEmail,
            gender: form.guest_gender || null,
            nationality: form.guest_nationality.trim() || null,
            visit_count: existingCustomer.visit_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingCustomer.id);
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            accommodation_id: currentAccommodationId,
            name: guestName,
            phone: guestPhone,
            email: guestEmail,
            gender: form.guest_gender || null,
            nationality: form.guest_nationality.trim() || null,
            visit_count: 1,
            first_order_date: form.check_in_date,
          })
          .select("id")
          .single();
        customerId = newCustomer?.id || null;
      }

      // Link order to customer
      if (customerId && orderData?.id) {
        await supabase
          .from("orders")
          .update({ customer_id: customerId })
          .eq("id", orderData.id);
      }

      // Log the action
      if (orderData?.id) {
        await logAction({
          actionType: "create",
          actionCategory: "order",
          entityType: "order",
          entityId: orderData.id,
          entityName: orderNumber,
          accommodationId: currentAccommodationId,
          details: { guest_name: form.guest_name, check_in: form.check_in_date, check_out: form.check_out_date }
        });
      }

      // 寄送訂房確認 email（非阻塞，失敗不影響訂單建立）
      const recipientEmail = form.guest_email.trim();
      if (recipientEmail && orderData?.id) {
        try {
          const { data: accInfo } = await supabase
            .from("accommodation_info")
            .select("name")
            .eq("id", currentAccommodationId)
            .maybeSingle();
          const roomTypeName = roomTypes.find(r => r.id === primaryRoom.room_type_id)?.name || "";
          await supabase.functions.invoke("send-resend-email", {
            body: {
              templateType: "booking_confirmation",
              recipientEmail,
              templateData: {
                guestName: form.guest_name.trim(),
                accommodationName: (accInfo as any)?.name || "",
                checkIn: form.check_in_date,
                checkOut: form.check_out_date,
                roomType: roomTypeName,
                orderNumber,
                totalPrice: totals.final,
              },
            },
          });
        } catch (mailErr) {
          console.warn("[create-order] booking confirmation email failed:", mailErr);
        }
      }

      toast({
        title: "新增成功",
        description: `訂單 ${orderNumber} 已建立`,
      });

      onSuccess(orderData.id);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating order:", error);
      const dbMsg = error?.message || error?.details || "";
      let description = "無法建立訂單，請稍後再試";
      if (dbMsg.includes("not available")) {
        description = "所選日期房間不可用";
      } else if (dbMsg.includes("No rooms available")) {
        description = "所選日期已無空房";
      } else if (dbMsg.includes("exceeds room capacity")) {
        description = "入住人數超過房型上限";
      } else if (dbMsg) {
        description = dbMsg;
      }
      toast({ title: "新增失敗", description, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const totals = getTotals();

  const formContent = (
    <div className="space-y-4 py-4 overflow-visible">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-visible">
        {/* Name input with autocomplete */}
        <div className="space-y-2 relative overflow-visible" ref={nameInputRef}>
          <Label>訂購人姓名 <span className="text-destructive">*</span></Label>
          <Input
            value={form.guest_name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => {
              if (nameSuggestions.length > 0) setShowNameSuggestions(true);
            }}
            placeholder="輸入姓名搜尋客戶"
            className="h-12 text-base sm:h-10 sm:text-sm"
          />
          {showNameSuggestions && nameSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
              {nameSuggestions.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3"
                >
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{customer.name}</div>
                    {customer.phone && (
                      <div className="text-xs text-muted-foreground truncate">{customer.phone}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phone input with autocomplete */}
        <div className="space-y-2 relative overflow-visible" ref={phoneInputRef}>
          <Label>聯絡電話 <span className="text-destructive">*</span></Label>
          <Input
            value={form.guest_phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onFocus={() => {
              if (phoneSuggestions.length > 0) setShowPhoneSuggestions(true);
            }}
            placeholder="輸入電話搜尋客戶"
            className="h-12 text-base sm:h-10 sm:text-sm"
            type="tel"
          />
          {showPhoneSuggestions && phoneSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
              {phoneSuggestions.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3"
                >
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{customer.phone}</div>
                    <div className="text-xs text-muted-foreground truncate">{customer.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>電子郵件</Label>
        <Input
          value={form.guest_email}
          onChange={(e) => setForm({...form, guest_email: e.target.value})}
          placeholder="輸入電子郵件"
          className="h-12 text-base sm:h-10 sm:text-sm"
          type="email"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>性別</Label>
          <Select
            value={form.guest_gender}
            onValueChange={(value) => setForm({...form, guest_gender: value})}
          >
            <SelectTrigger className="h-12 sm:h-10">
              <SelectValue placeholder="請選擇" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">男</SelectItem>
              <SelectItem value="female">女</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>國籍</Label>
          <Input
            value={form.guest_nationality}
            onChange={(e) => setForm({...form, guest_nationality: e.target.value})}
            placeholder="例如：台灣、日本"
            className="h-12 text-base sm:h-10 sm:text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>入住日期 <span className="text-destructive">*</span></Label>
          <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12 sm:h-10",
                  form.check_in_date 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "bg-background text-foreground hover:bg-primary hover:text-primary-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.check_in_date ? format(parseISO(form.check_in_date), "yyyy/MM/dd") : "選擇日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.check_in_date ? parseISO(form.check_in_date) : undefined}
                defaultMonth={form.check_in_date ? parseISO(form.check_in_date) : undefined}
                onSelect={(date) => {
                  if (date && !isNaN(date.getTime())) {
                    const newCheckIn = format(date, "yyyy-MM-dd");
                    if (form.check_out_date && !isAfter(parseISO(form.check_out_date), date)) {
                      setForm({...form, check_in_date: newCheckIn, check_out_date: ""});
                    } else {
                      setForm({...form, check_in_date: newCheckIn});
                    }
                    setCheckInOpen(false);
                    setTimeout(() => setCheckOutOpen(true), 150);
                  }
                }}
                disabled={undefined}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>退房日期 <span className="text-destructive">*</span></Label>
          <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12 sm:h-10",
                  form.check_out_date 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "bg-background text-foreground hover:bg-primary hover:text-primary-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.check_out_date ? format(parseISO(form.check_out_date), "yyyy/MM/dd") : "選擇日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.check_out_date ? parseISO(form.check_out_date) : undefined}
                defaultMonth={form.check_in_date ? parseISO(form.check_in_date) : undefined}
                onSelect={(date) => {
                  if (date && !isNaN(date.getTime())) {
                    if (form.check_in_date && isAfter(date, parseISO(form.check_in_date))) {
                      setForm({...form, check_out_date: format(date, "yyyy-MM-dd")});
                      setCheckOutOpen(false);
                    } else {
                      toast({ title: "日期錯誤", description: "退房日期必須在入住日期之後", variant: "destructive" });
                    }
                  }
                }}
                disabled={(date) => {
                  if (!form.check_in_date) return true;
                  return !isAfter(date, parseISO(form.check_in_date));
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Booking Mode Selection */}
      <div className="space-y-3 pt-2">
        <Label className="text-base font-semibold">訂房類型</Label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={bookingMode === "exclusive" ? "default" : "outline"}
            className="h-12"
            onClick={() => {
              if (bookingMode === "exclusive") return;
              setBookingMode("exclusive");
              setRoomSelections([]);
              // Auto-add exclusive package room
              const exclusiveTypes = roomTypes.filter(r => r.is_exclusive_package);
              if (exclusiveTypes.length > 0) {
                const rt = exclusiveTypes[0];
                const templates = getTemplatesForRoomType(rt.id);
                setRoomSelections([{
                  id: crypto.randomUUID(),
                  room_type_id: rt.id,
                  template_id: templates[0]?.id || "",
                  template_name: templates[0]?.template_name || "",
                  quantity: 1,
                  roomPrice: 0,
                  filteredTemplates: templates,
                }]);
              }
            }}
          >
            {exclusiveLabel}
          </Button>
          <Button
            type="button"
            variant={bookingMode === "normal" ? "default" : "outline"}
            className="h-12"
            onClick={() => {
              if (bookingMode === "normal") return;
              setBookingMode("normal");
              setRoomSelections([]);
            }}
          >
            {`非${exclusiveLabel}`}
          </Button>
        </div>

        {/* Exclusive mode: show package selector */}
        {bookingMode === "exclusive" && (
          <div className="space-y-3">
            {roomTypes.filter(r => r.is_exclusive_package).length === 0 ? (
              <div className="p-4 border rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
                目前沒有{exclusiveLabel}房型，請先至房型管理新增
              </div>
            ) : (
              <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{exclusiveLabel}方案 <span className="text-destructive">*</span></Label>
                    <Select
                      value={roomSelections[0]?.room_type_id || ""}
                      onValueChange={(value) => {
                        const templates = getTemplatesForRoomType(value);
                        setRoomSelections([{
                          id: roomSelections[0]?.id || crypto.randomUUID(),
                          room_type_id: value,
                          template_id: templates[0]?.id || "",
                          template_name: templates[0]?.template_name || "",
                          quantity: 1,
                          roomPrice: 0,
                          filteredTemplates: templates,
                        }]);
                      }}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder={`選擇${exclusiveLabel}方案`} />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.filter(r => r.is_exclusive_package).map((rt) => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.name} (最多{rt.capacity}人)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">專案</Label>
                    {(roomSelections[0]?.filteredTemplates?.length || 0) > 0 ? (
                      <Select
                        value={roomSelections[0]?.template_id || ""}
                        onValueChange={(value) => {
                          const template = roomSelections[0]?.filteredTemplates.find(t => t.id === value);
                          // 同一組訂單共用同一個專案：同步套用到所有房間
                          setRoomSelections(prev => prev.map((s, i) => {
                            if (i === 0) {
                              return { ...s, template_id: value, template_name: template?.template_name || "" };
                            }
                            const match = s.filteredTemplates.find(t => t.id === value);
                            if (!match) return s; // 此房型無對應專案則保留原值
                            return { ...s, template_id: match.id, template_name: match.template_name };
                          }));
                        }}

                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="選擇專案" />
                        </SelectTrigger>
                        <SelectContent>
                          {roomSelections[0]?.filteredTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.project_name || template.template_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">無對應專案</p>
                    )}
                  </div>
                </div>
                {(() => {
                  const customBreakdown = getPackageBreakdown(roomSelections[0]?.room_type_id);
                  return customBreakdown ? (
                  <>
                    <div className={`grid gap-3 ${customBreakdown.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                      {customBreakdown.map((bd) => {
                        const cur = exclusiveCustomCounts[bd.room_type_id] ?? 0;
                        const max = Math.max(bd.count, 0);
                        return (
                          <div key={bd.room_type_id} className="space-y-1.5">
                            <Label className="text-xs">{bd.name} 間數</Label>
                            <Select
                              value={String(cur)}
                              onValueChange={(v) =>
                                setExclusiveCustomCounts(prev => ({ ...prev, [bd.room_type_id]: Number(v) }))
                              }
                            >
                              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: max + 1 }, (_, i) => i).map(n => (
                                  <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {exclusiveLabel}已鎖定 {customBreakdown.reduce((s, b) => s + b.count, 0)} 間房（
                      {customBreakdown.map(bd => `${bd.name} ${exclusiveCustomCounts[bd.room_type_id] ?? 0} 間`).join("、")}
                      ）
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">雙人房間數</Label>
                        <Select value={String(exclusiveDoubleRooms)} onValueChange={(v) => setExclusiveDoubleRooms(Number(v))}>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: MAX_DOUBLE_ROOMS + 1 }, (_, i) => i).map(n => (
                              <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">四人房間數</Label>
                        <Select value={String(exclusiveQuadRooms)} onValueChange={(v) => setExclusiveQuadRooms(Number(v))}>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: MAX_QUAD_ROOMS + 1 }, (_, i) => i).map(n => (
                              <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {exclusiveLabel}已鎖定 {MAX_TOTAL_ROOMS} 間房（雙人房 {exclusiveDoubleRooms} 間、四人房 {exclusiveQuadRooms} 間）
                    </div>
                  </>
                );
                })()}
                {/* 棟號選擇（主包棟） */}
                {(() => {
                  const primary = roomSelections[0];
                  if (!primary) return null;
                  const unitsForType = allRoomUnits.filter(u => u.room_type_id === primary.room_type_id);
                  if (unitsForType.length === 0) return null;
                  const usedByOtherRows = new Set(
                    roomSelections.filter(o => o.id !== primary.id && o.room_unit_id).map(o => o.room_unit_id as string)
                  );
                  return (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{exclusiveLabel}棟號（可選）</Label>
                      <Select
                        value={primary.room_unit_id || "auto"}
                        onValueChange={(v) => updateRoomSelection(primary.id, { room_unit_id: v === "auto" ? null : v })}
                      >
                        <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="自動安排" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自動安排</SelectItem>
                          {unitsForType.map(u => {
                            const occupied = occupiedUnitIdsForDates.has(u.id) || usedByOtherRows.has(u.id);
                            const label = u.nickname || u.unit_number || `棟號 ${u.display_order}`;
                            return (
                              <SelectItem key={u.id} value={u.id} disabled={occupied}>
                                {label}{occupied ? "（已佔用）" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                {roomSelections[0]?.roomPrice > 0 && (
                  <div className="text-xs text-right text-muted-foreground">
                    小計：NT$ {roomSelections[0].roomPrice.toLocaleString()}（{exclusiveLabel}）
                  </div>
                )}
              </div>
            )}

            {/* Extra rooms in exclusive mode: 可加散客單間或另一棟包棟 */}
            {roomSelections.length > 1 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">額外加房</div>
                {roomSelections.slice(1).map((sel, idx) => {
                  const rt = roomTypes.find(r => r.id === sel.room_type_id);
                  const isExclusive = !!rt?.is_exclusive_package;
                  return (
                    <div key={sel.id} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{isExclusive ? exclusiveLabel : "散客房"} #{idx + 1}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRoomSelection(sel.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">房型 <span className="text-destructive">*</span></Label>
                          <Select value={sel.room_type_id} onValueChange={(value) => updateRoomSelection(sel.id, { room_type_id: value })}>
                            <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="選擇房型" /></SelectTrigger>
                            <SelectContent>
                              {roomTypes.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.is_exclusive_package ? `【${exclusiveLabel}】` : ""}{r.name} (最多{r.capacity}人)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">專案</Label>
                          {(() => {
                            const sharedTpl = sel.filteredTemplates.find(t => t.id === sel.template_id);
                            if (sel.filteredTemplates.length === 0) {
                              return <p className="text-xs text-muted-foreground py-2">無對應專案</p>;
                            }
                            return (
                              <div className="h-10 flex items-center text-sm text-muted-foreground">
                                {sharedTpl ? (
                                  <span>共用主方案：{sharedTpl.project_name || sharedTpl.template_name}</span>
                                ) : (
                                  <span className="text-destructive">此房型無對應主方案</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {!(isYunxiu && !isExclusive) && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">間數</Label>
                            <div className="flex items-center gap-1.5">
                              <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => changeRoomQuantity(sel.id, -1)} disabled={isExclusive || sel.quantity <= 1}>
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center text-sm font-medium">{sel.quantity}</span>
                              <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => changeRoomQuantity(sel.id, 1)} disabled={isExclusive}>
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* 棟號/房號 選擇（額外加房） */}
                      {(() => {
                        const unitsForType = allRoomUnits.filter(u => u.room_type_id === sel.room_type_id);
                        if (unitsForType.length === 0) return null;
                        const usedByOtherRows = new Set(
                          roomSelections.filter(o => o.id !== sel.id && o.room_unit_id).map(o => o.room_unit_id as string)
                        );
                        const disableSelect = !isExclusive && sel.quantity !== 1;
                        const labelText = isExclusive ? `${exclusiveLabel}棟號（可選）` : "房號（可選）";
                        return (
                          <div className="space-y-1.5">
                            <Label className="text-xs">{labelText}</Label>
                            <Select
                              value={sel.room_unit_id || "auto"}
                              onValueChange={(v) => updateRoomSelection(sel.id, { room_unit_id: v === "auto" ? null : v })}
                              disabled={disableSelect}
                            >
                              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="自動安排" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自動安排</SelectItem>
                                {unitsForType.map(u => {
                                  const occupied = occupiedUnitIdsForDates.has(u.id) || usedByOtherRows.has(u.id);
                                  const label = u.nickname || u.unit_number || (isExclusive ? `棟號 ${u.display_order}` : `房號 ${u.display_order}`);
                                  return (
                                    <SelectItem key={u.id} value={u.id} disabled={occupied}>
                                      {label}{occupied ? "（已佔用）" : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {disableSelect && (
                              <p className="text-[11px] text-muted-foreground">多間時不指定房號，由系統分配</p>
                            )}
                          </div>
                        );
                      })()}
                      {sel.roomPrice > 0 && (
                        <div className="text-xs text-right text-muted-foreground">小計：NT$ {sel.roomPrice.toLocaleString()} ({sel.quantity} 間)</div>
                      )}
                      {isExclusive && (
                        <div className="p-3 rounded-lg border border-dashed bg-background/50 space-y-2">
                          <div className="text-xs font-medium">{exclusiveLabel}房間配置</div>
                          {(() => {
                            const customBreakdown = getPackageBreakdown(sel.room_type_id);
                            return customBreakdown ? (
                            <>
                              <div className={`grid gap-2 ${customBreakdown.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                                {customBreakdown.map(bd => {
                                  const cur = extraExclusiveCustomCounts[sel.id]?.[bd.room_type_id] ?? 0;
                                  return (
                                    <div key={bd.room_type_id} className="space-y-1">
                                      <Label className="text-xs">{bd.name} 間數</Label>
                                      <Select
                                        value={String(cur)}
                                        onValueChange={(v) => setExtraExclusiveCustomCount(sel.id, bd.room_type_id, Number(v))}
                                      >
                                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {Array.from({ length: bd.count + 1 }, (_, i) => i).map(n => (
                                            <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                將以備註形式儲存：
                                {customBreakdown.map(bd => `${bd.name} ${extraExclusiveCustomCounts[sel.id]?.[bd.room_type_id] ?? 0} 間`).join("、")}
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">雙人房間數</Label>
                                  <Select
                                    value={String(extraExclusiveConfigs[sel.id]?.double ?? 0)}
                                    onValueChange={(v) => setExtraExclusiveConfig(sel.id, { double: Number(v) })}
                                  >
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: MAX_DOUBLE_ROOMS + 1 }, (_, i) => i).map(n => (
                                        <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">四人房間數</Label>
                                  <Select
                                    value={String(extraExclusiveConfigs[sel.id]?.quad ?? 0)}
                                    onValueChange={(v) => setExtraExclusiveConfig(sel.id, { quad: Number(v) })}
                                  >
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: MAX_QUAD_ROOMS + 1 }, (_, i) => i).map(n => (
                                        <SelectItem key={n} value={String(n)}>{n} 間</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">將以備註形式儲存：雙人房 {extraExclusiveConfigs[sel.id]?.double ?? 0} 間、四人房 {extraExclusiveConfigs[sel.id]?.quad ?? 0} 間</p>
                            </>
                          );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add buttons in exclusive mode */}
            {roomSelections.length > 0 && !isSensan && !isHakuna && (
              <div className="flex gap-2 justify-end">
                {(() => {
                  const exclusiveTotal = roomTypes.filter(r => r.is_exclusive_package).length;
                  const exclusiveAdded = roomSelections.filter(s => roomTypes.find(r => r.id === s.room_type_id)?.is_exclusive_package).length;
                  const showAddVilla = exclusiveTotal > 1 && exclusiveAdded < exclusiveTotal;
                  const hasNormalRoom = roomTypes.some(r => !r.is_exclusive_package);
                  return (
                    <>
                      {hasNormalRoom && (
                        <Button type="button" variant="outline" size="sm" onClick={() => addRoomSelection(false)} className="h-8 gap-1">
                          <Plus className="h-3.5 w-3.5" />新增散客房
                        </Button>
                      )}
                      {showAddVilla && (
                        <Button type="button" variant="outline" size="sm" onClick={() => addRoomSelection(true)} className="h-8 gap-1">
                          <Plus className="h-3.5 w-3.5" />再加一棟{exclusiveLabel}
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Normal mode: multi-room selection */}
        {bookingMode === "normal" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                共 {totalRoomCount} 間
              </Badge>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addRoomSelection(false)}
                  disabled={roomTypes.filter(r => !r.is_exclusive_package).length === 0}
                  className="h-8 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增散客房
                </Button>
              </div>
            </div>

            {roomSelections.length === 0 && (
              <div className="p-4 border rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
                請點擊「新增散客房」加入房型
              </div>
            )}

            {roomSelections.map((sel, index) => (
              <div key={sel.id} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">房間 {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRoomSelection(sel.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">房型 <span className="text-destructive">*</span></Label>
                    <Select
                      value={sel.room_type_id}
                      onValueChange={(value) => updateRoomSelection(sel.id, { room_type_id: value })}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="選擇房型" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.filter(rt => !rt.is_exclusive_package).map((rt) => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.name} (最多{rt.capacity}人)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">專案</Label>
                    {(() => {
                      const sharedTpl = sel.filteredTemplates.find(t => t.id === sel.template_id);
                      if (sel.filteredTemplates.length === 0) {
                        return <p className="text-xs text-muted-foreground py-2">無對應專案</p>;
                      }
                      return (
                        <div className="h-10 flex items-center text-sm text-muted-foreground">
                          {sharedTpl ? (
                            <span>共用主方案：{sharedTpl.project_name || sharedTpl.template_name}</span>
                          ) : (
                            <span className="text-destructive">此房型無對應主方案</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>


                  {!(isYunxiu && !roomTypes.find(r => r.id === sel.room_type_id)?.is_exclusive_package) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">間數</Label>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 w-10 p-0"
                          onClick={() => changeRoomQuantity(sel.id, -1)}
                          disabled={sel.quantity <= 1}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{sel.quantity}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 w-10 p-0"
                          onClick={() => changeRoomQuantity(sel.id, 1)}
                          disabled={!!roomTypes.find(r => r.id === sel.room_type_id)?.is_exclusive_package}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 房號選擇（散客房；該房型有配置房號時顯示） */}
                {(() => {
                  const rt = roomTypes.find(r => r.id === sel.room_type_id);
                  if (!rt || rt.is_exclusive_package) return null;
                  const unitsForType = allRoomUnits.filter(u => u.room_type_id === sel.room_type_id);
                  if (unitsForType.length === 0) return null;
                  const usedByOtherRows = new Set(
                    roomSelections
                      .filter(o => o.id !== sel.id && o.room_unit_id)
                      .map(o => o.room_unit_id as string)
                  );
                  const disableSelect = sel.quantity !== 1;
                  return (
                    <div className="space-y-1.5">
                      <Label className="text-xs">房號（可選）</Label>
                      <Select
                        value={sel.room_unit_id || "auto"}
                        onValueChange={(v) => updateRoomSelection(sel.id, { room_unit_id: v === "auto" ? null : v })}
                        disabled={disableSelect}
                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="自動安排" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自動安排</SelectItem>
                          {unitsForType.map((u) => {
                            const occupied = occupiedUnitIdsForDates.has(u.id) || usedByOtherRows.has(u.id);
                            const label = u.nickname || u.unit_number || `房號 ${u.display_order}`;
                            return (
                              <SelectItem key={u.id} value={u.id} disabled={occupied}>
                                {label}{occupied ? "（已佔用）" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {disableSelect && (
                        <p className="text-[11px] text-muted-foreground">多間時不指定房號，由系統分配</p>
                      )}
                    </div>
                  );
                })()}

                {sel.roomPrice > 0 && (
                  <div className="text-xs text-right text-muted-foreground">
                    小計：NT$ {sel.roomPrice.toLocaleString()} ({sel.quantity} 間)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Guest count */}
        <div className="p-3 border rounded-lg bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">總入住人數</Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={form.guest_count}
                onChange={(e) => setForm({...form, guest_count: parseInt(e.target.value) || 1})}
                className="h-10 text-sm"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        {/* Addons */}
        {addonSettings.length > 0 && (
          <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
            <Label className="text-sm">加購方案</Label>
            {addonSettings.map((addon) => {
              const selectedAddon = selectedAddons.find(a => a.addon_id === addon.id);
              const quantity = selectedAddon?.quantity || 0;
              
              return (
                <div key={addon.id} className="flex items-center justify-between p-2 bg-background rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{addon.addon_type === 'pet' ? '寵物方案' : addon.addon_type === 'meal' ? '餐食方案' : addon.addon_type}</div>
                    <div className="text-sm text-primary">
                      NT$ {addon.price_per_unit.toLocaleString()} / {addon.unit_label}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        const newAddons = quantity === 1
                          ? selectedAddons.filter(a => a.addon_id !== addon.id)
                          : selectedAddons.map(a => 
                              a.addon_id === addon.id ? { ...a, quantity: a.quantity - 1 } : a
                            );
                        setSelectedAddons(newAddons);
                      }}
                      disabled={quantity === 0}
                    >
                      -
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        if (quantity < addon.max_quantity) {
                          const existingIndex = selectedAddons.findIndex(a => a.addon_id === addon.id);
                          const newAddons = existingIndex >= 0
                            ? selectedAddons.map(a => 
                                a.addon_id === addon.id ? { ...a, quantity: a.quantity + 1 } : a
                              )
                            : [...selectedAddons, { addon_id: addon.id, quantity: 1 }];
                          setSelectedAddons(newAddons);
                        }
                      }}
                      disabled={quantity >= addon.max_quantity}
                    >
                      +
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {roomPrice > 0 && (
          <div className="text-sm text-right font-medium">
            房費合計：NT$ {roomPrice.toLocaleString()}
          </div>
        )}
      </div>

      {/* Discount Code Section */}
      <div className="space-y-2 pt-4 border-t">
        <Label className="flex items-center gap-2">
          <Tag className="h-4 w-4" />
          折扣碼
        </Label>
        
        {appliedDiscount ? (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Badge variant="secondary" className="text-sm">
              {appliedDiscount.code}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {appliedDiscount.type === "percentage"
                ? `${appliedDiscount.value}% 折扣`
                : `NT$ ${appliedDiscount.value.toLocaleString()} 折扣`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveDiscount}
              className="ml-auto h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              placeholder="輸入折扣碼"
              className="flex-1 h-12 text-base sm:h-10 sm:text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleApplyDiscount}
              disabled={isValidatingCode || !discountCode.trim()}
              className="h-12 sm:h-10 px-4"
            >
              {isValidatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "套用"}
            </Button>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <Label htmlFor="create-discount-amount">折扣金額 (NT$)</Label>
          <Input
            id="create-discount-amount"
            type="number"
            min={0}
            placeholder="0"
            value={manualDiscountStr !== null ? manualDiscountStr : (totals.discount > 0 ? String(totals.discount) : "")}
            onChange={(e) => {
              manualDiscountInputRef.current = e.target.value;
              setManualDiscountStr(e.target.value);
            }}
            className="h-12 text-base sm:h-10 sm:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {appliedDiscount ? "可手動覆寫折扣碼計算的金額" : "可直接輸入折扣金額（不需折扣碼）"}
          </p>
        </div>
      </div>

      {/* Price Summary */}
      {(() => {
        return (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">住宿天數</span>
              <span className="flex items-center gap-2">
                {isCheckingInventory && <Loader2 className="h-3 w-3 animate-spin" />}
                {calculateNights()} 晚
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">房價小計</span>
              <span>NT$ {totals.roomTotal.toLocaleString()}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm text-primary">
                <span>折扣</span>
                <span>- NT$ {totals.discount.toLocaleString()}</span>
              </div>
            )}
            {totals.addonTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">加購小計</span>
                <span>NT$ {totals.addonTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg pt-2 border-t">
              <span>總金額</span>
              <span className="text-primary">NT$ {totals.final.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className={cn("text-muted-foreground", form.balance_paid && "line-through")}>
                應付金額
              </span>
              <span className={cn(form.balance_paid && "line-through text-muted-foreground")}>
                NT$ {totals.final.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Inventory Warnings */}
      {inventoryWarnings.length > 0 && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <div className="font-medium mb-1">庫存警告</div>
            <ul className="text-sm space-y-1">
              {inventoryWarnings.map((warning, index) => (
                <li key={index}>
                  {warning.closed ? (
                    <span>
                      {format(parseISO(warning.date), "MM/dd")}{warning.roomName ? ` ${warning.roomName}` : ""}：當天已被鎖房（庫存未開放）
                    </span>
                  ) : warning.blocked ? (
                    <span>
                      {format(parseISO(warning.date), "MM/dd")}{warning.roomName ? ` ${warning.roomName}` : ""}：已被{warning.blockedBy ? `「${warning.blockedBy}」` : "其他訂單"}佔用
                    </span>
                  ) : (
                    <span>
                      {format(parseISO(warning.date), "MM/dd")}{warning.roomName ? ` ${warning.roomName}` : ""}：剩餘 <strong>{warning.available}</strong> 間，需 {warning.needed ?? 1} 間
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="text-xs mt-2 text-amber-700 dark:text-amber-300">
              無法建立超過庫存的訂單
            </div>
          </AlertDescription>

        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>訂單來源</Label>
          <Select value={form.order_source} onValueChange={(value) => setForm({...form, order_source: value})}>
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
              <SelectValue placeholder="現場訂房（預設）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line">Line@</SelectItem>
              <SelectItem value="agoda">Agoda</SelectItem>
              <SelectItem value="booking">Booking</SelectItem>
              <SelectItem value="trip">Trip</SelectItem>
               <SelectItem value="travel_agency">旅行社</SelectItem>
               <SelectItem value="kol">KOL互惠</SelectItem>
                <SelectItem value="points_starchain">星鏈會員</SelectItem>
                <SelectItem value="official_use">公務使用</SelectItem>
                 <SelectItem value="franchise_diff">加盟價差</SelectItem>
                 <SelectItem value="owner_provided">業主自帶</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>訂單狀態</Label>
          <Select value={form.order_status} onValueChange={(value) => setForm({...form, order_status: value})}>
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">待確認</SelectItem>
              <SelectItem value="confirmed">已確認</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isOlivia && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">標記為包棟</Label>
            <p className="text-xs text-muted-foreground">
              勾選後，入住期間內整棟其他房型自動鎖定（不可預訂）。
            </p>
          </div>
          <Switch
            checked={lockWholeBuilding}
            onCheckedChange={setLockWholeBuilding}
          />
        </div>
      )}


      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>付款方式</Label>
          <Select
            value={form.balance_payment_method}
            onValueChange={(value) => setForm({
              ...form,
              balance_payment_method: value,
              deposit_payment_method: value,
              // 切換非匯款時，清掉訂金狀態
              ...(value !== "bank_transfer"
                ? { deposit_paid: false, deposit_amount: 0 }
                : (form.deposit_amount || 0) === 0
                  ? { deposit_amount: Math.round(totals.final * (depositPct || 30) / 100) }
                  : {}),
            })}
          >
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
              <SelectValue placeholder="選擇付款方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credit_card">信用卡</SelectItem>
              <SelectItem value="line_pay">LINE Pay</SelectItem>
              <SelectItem value="atm">ATM 虛擬帳號</SelectItem>
              <SelectItem value="bank_transfer">匯款</SelectItem>
              <SelectItem value="cash">現金</SelectItem>
              <SelectItem value="monthly">月結</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.balance_payment_method !== "bank_transfer" ? (
          <div className="space-y-2">
            <Label>付款狀態</Label>
            <Select
              value={form.balance_paid ? "paid" : "unpaid"}
              onValueChange={(value) => setForm({ ...form, balance_paid: value === "paid", deposit_paid: value === "paid" })}
            >
              <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">未付款</SelectItem>
                <SelectItem value="paid">已付款</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>付款狀態</Label>
            <Select
              value={form.balance_paid ? "paid" : form.deposit_paid ? "deposit_paid" : "unpaid"}
              onValueChange={(value) => setForm({
                ...form,
                balance_paid: value === "paid",
                deposit_paid: value === "paid" || value === "deposit_paid",
                // 已付清：自動清空訂金欄位（後端會視為全付）
                ...(value === "paid" ? { deposit_amount: 0 } : {}),
              })}
            >
              <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">未付款</SelectItem>
                <SelectItem value="deposit_paid">已付訂金</SelectItem>
                <SelectItem value="paid">已付清</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {form.balance_payment_method === "bank_transfer" && !form.balance_paid && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg border border-border p-4 bg-muted/30">
          <div className="space-y-2">
            <Label>訂金比例（%）</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={depositPct}
              onChange={(e) => {
                const raw = e.target.value;
                const pct = raw === "" ? 0 : Math.max(0, Math.min(100, Number(raw) || 0));
                setDepositPct(pct);
                const amount = Math.round((totals.final * pct) / 100);
                setForm({ ...form, deposit_amount: amount });
              }}
              className="h-12 text-base sm:h-10 sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">預設 30%，可手動調整 0–100%</p>
          </div>
          <div className="space-y-2">
            <Label>訂金金額（NT$）</Label>
            <Input
              type="number"
              min={0}
              max={totals.final}
              value={form.deposit_amount}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                const capped = Math.max(0, Math.min(v, totals.final));
                setForm({ ...form, deposit_amount: capped });
                if (totals.final > 0) {
                  setDepositPct(Math.round((capped / totals.final) * 100));
                }
              }}
              className="h-12 text-base sm:h-10 sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">上限 NT$ {totals.final.toLocaleString()}</p>
          </div>
          <div className="space-y-2">
            <Label>尾款金額（NT$）</Label>
            <Input
              type="number"
              value={Math.max(0, totals.final - (form.deposit_amount || 0))}
              readOnly
              disabled
              className="h-12 text-base sm:h-10 sm:text-sm bg-muted"
            />
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-base font-semibold">押金</Label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">收取方式</Label>
            <Select
              value={form.security_deposit_method}
              onValueChange={(value: "cash" | "card") =>
                setForm({ ...form, security_deposit_method: value })
              }
            >
              <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">現場現金</SelectItem>
                <SelectItem value="card">線上綁卡</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">押金金額 (NT$)</Label>
            <Input
              type="number"
              min={0}
              step={100}
              value={form.security_deposit_amount}
              onChange={(e) =>
                setForm({ ...form, security_deposit_amount: Number(e.target.value) || 0 })
              }
              className="h-12 text-base sm:h-10 sm:text-sm"
            />
          </div>
        </div>
        {form.security_deposit_method === "card" && (
          <p className="text-xs text-muted-foreground">
            訂單建立後，請至訂單詳情頁的「押金管理」區塊請房客完成綁卡，系統會於入住前一天自動扣款。
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>備註</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({...form, notes: e.target.value})}
          rows={3}
          placeholder="輸入訂單備註..."
          className="text-base sm:text-sm min-h-[80px]"
        />
      </div>
    </div>
  );

  const footerButtons = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
        取消
      </Button>
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            建立中...
          </>
        ) : (
          "建立訂單"
        )}
      </Button>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-none !w-screen !h-screen !p-0 !gap-0 !rounded-none !border-0 !left-0 !top-0 !translate-x-0 !translate-y-0 flex flex-col bg-background"
      >
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-2xl">新增訂單</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6">
            {formContent}
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
          <div className="max-w-4xl mx-auto w-full flex justify-end gap-2">
            {footerButtons}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
