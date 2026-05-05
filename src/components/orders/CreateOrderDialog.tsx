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

interface RoomSelection {
  id: string;
  room_type_id: string;
  template_id: string;
  template_name: string;
  quantity: number;
  roomPrice: number;
  filteredTemplates: PricingTemplate[];
}

interface InventoryWarning {
  date: string;
  roomTypeId?: string;
  roomName?: string;
  available: number;
  needed?: number;
  blocked?: boolean;
  blockedBy?: string;
}

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
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
  const [useDeposit, setUseDeposit] = useState(true);
  const [depositPct, setDepositPct] = useState(30);
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

  // Multi-room selections
  const [roomSelections, setRoomSelections] = useState<RoomSelection[]>([]);
  // 哈庫納馬塔塔：7 間房（最多 2 雙人房 + 4 四人房，加上 1 額外房型）
  const HAKUNA_ACC_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
  const SENSAN_ACC_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
  const isHakuna = currentAccommodationId === HAKUNA_ACC_ID;
  const isSensan = currentAccommodationId === SENSAN_ACC_ID;
  // 只有森山寫照保留「包區」用語，其餘民宿一律使用「包棟」
  const exclusiveLabel = isSensan ? "包區" : "包棟";
  const MAX_TOTAL_ROOMS = isHakuna ? 7 : 6;
  const MAX_DOUBLE_ROOMS = isHakuna ? 2 : 3;
  const MAX_QUAD_ROOMS = isHakuna ? 4 : 3;

  // Booking mode: "exclusive" (包棟) or "normal" (非包棟) or "" (not yet selected)
  const [bookingMode, setBookingMode] = useState<"" | "exclusive" | "normal">("");
  const [exclusiveDoubleRooms, setExclusiveDoubleRooms] = useState(0);
  const [exclusiveQuadRooms, setExclusiveQuadRooms] = useState(0);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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
        notes: "",
        order_source: "",
        security_deposit_method: "cash",
        security_deposit_amount: 5000,
      });
      setSelectedAddons([]);
      setDiscountCode("");
      setAppliedDiscount(null);
      setRoomPrice(0);
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
          .eq("enabled", true),
        supabase
          .from("pricing_templates")
          .select("id, template_name, meal_plans, project_name, room_type_id, price, weekday_price, peak_price, weekend_price")
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

      const { data: bs } = await supabase
        .from("booking_settings")
        .select("use_deposit, deposit_percentage")
        .eq("accommodation_id", currentAccommodationId)
        .maybeSingle();
      if (bs) {
        setUseDeposit(bs.use_deposit !== false);
        setDepositPct(bs.deposit_percentage ?? 30);
      }
    };

    fetchData();
  }, [currentAccommodationId]);

  // Helper: get templates for a room_type_id
  const getTemplatesForRoomType = useCallback((roomTypeId: string) => {
    if (!roomTypeId || pricingTemplates.length === 0) return [];
    const filtered = pricingTemplates.filter(t => (t as any).room_type_id === roomTypeId);
    const result = filtered.length > 0 ? filtered : pricingTemplates.filter(t => !(t as any).room_type_id);
    return result.length > 0 ? result : pricingTemplates;
  }, [pricingTemplates]);

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
  // 包區(Exclusive Package) 佔用全部 6 間額度
  const getEffectiveQuantity = useCallback((sel: RoomSelection) => {
    const rt = roomTypes.find(r => r.id === sel.room_type_id);
    return rt?.is_exclusive_package ? MAX_TOTAL_ROOMS : sel.quantity;
  }, [roomTypes]);
  const totalRoomCount = roomSelections.reduce((sum, s) => sum + getEffectiveQuantity(s), 0);
  const hasExclusivePackage = roomSelections.some(s => roomTypes.find(r => r.id === s.room_type_id)?.is_exclusive_package);

  const addRoomSelection = useCallback(() => {
    if (totalRoomCount >= MAX_TOTAL_ROOMS) return;
    const id = crypto.randomUUID();
    const normalRoomTypes = roomTypes.filter(r => !r.is_exclusive_package);
    const defaultRoomType = normalRoomTypes[0];
    if (!defaultRoomType) return;
    const templates = getTemplatesForRoomType(defaultRoomType.id);
    setRoomSelections(prev => [...prev, {
      id,
      room_type_id: defaultRoomType.id,
      template_id: templates[0]?.id || "",
      template_name: templates[0]?.template_name || "",
      quantity: 1,
      roomPrice: 0,
      filteredTemplates: templates,
    }]);
  }, [roomTypes, totalRoomCount, getTemplatesForRoomType]);

  const removeRoomSelection = useCallback((selId: string) => {
    setRoomSelections(prev => prev.filter(s => s.id !== selId));
  }, []);

  const updateRoomSelection = useCallback((selId: string, updates: Partial<RoomSelection>) => {
    setRoomSelections(prev => {
      // If changing to an exclusive package, remove all other selections
      if (updates.room_type_id) {
        const newRt = roomTypes.find(r => r.id === updates.room_type_id);
        if (newRt?.is_exclusive_package) {
          const templates = getTemplatesForRoomType(updates.room_type_id);
          const sel = prev.find(s => s.id === selId);
          return [{
            ...(sel || prev[0]),
            ...updates,
            quantity: 1,
            filteredTemplates: templates,
            template_id: templates[0]?.id || "",
            template_name: templates[0]?.template_name || "",
          }];
        }
      }
      return prev.map(s => {
        if (s.id !== selId) return s;
        const updated = { ...s, ...updates };
        if (updates.room_type_id && updates.room_type_id !== s.room_type_id) {
          const templates = getTemplatesForRoomType(updates.room_type_id);
          updated.filteredTemplates = templates;
          updated.template_id = templates[0]?.id || "";
          updated.template_name = templates[0]?.template_name || "";
        }
        return updated;
      });
    });
  }, [getTemplatesForRoomType, roomTypes]);

  const changeRoomQuantity = useCallback((selId: string, delta: number) => {
    setRoomSelections(prev => {
      const sel = prev.find(s => s.id === selId);
      if (!sel) return prev;
      const rt = roomTypes.find(r => r.id === sel.room_type_id);
      if (rt?.is_exclusive_package) return prev; // 包區不可調整數量
      const newQty = sel.quantity + delta;
      const otherTotal = prev.reduce((sum, s) => {
        if (s.id === selId) return sum;
        const srt = roomTypes.find(r => r.id === s.room_type_id);
        return sum + (srt?.is_exclusive_package ? MAX_TOTAL_ROOMS : s.quantity);
      }, 0);
      if (newQty < 1 || otherTotal + newQty > MAX_TOTAL_ROOMS) return prev;
      return prev.map(s => s.id === selId ? { ...s, quantity: newQty } : s);
    });
  }, [roomTypes]);

  // Calculate room prices for all selections
  const roomSelectionsKey = roomSelections.map(s => `${s.room_type_id}-${s.template_id}-${s.quantity}`).join(',');
  useEffect(() => {
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

      let totalPrice = 0;
      const updatedSelections = [...roomSelections];

      for (const sel of updatedSelections) {
        const template = pricingTemplates.find(t => t.id === sel.template_id);
        // 統一使用解析器：優先用「該專案在該日的覆寫價」，再 fallback 到 template / base row
        // 三段式：平日(週一至週四) / 旺日(週五、週日) / 假日(週六及國定假日)
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
        const selPrice = perRoom * sel.quantity;
        sel.roomPrice = selPrice;
        totalPrice += selPrice;
      }

      setRoomSelections(updatedSelections);
      setRoomPrice(totalPrice);
    };

    calcPrices();
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
    toast({ title: "已移除折扣", description: "折扣代碼已清除" });
  };

  // Calculate totals
  const getTotals = () => {
    const addonTotal = selectedAddons.reduce((sum, a) => {
      const addon = addonSettings.find(ad => ad.id === a.addon_id);
      return sum + (addon ? addon.price_per_unit * a.quantity : 0);
    }, 0);
    // Use roomSelections prices directly to avoid stale roomPrice state
    const actualRoomTotal = roomSelections.reduce((sum, sel) => sum + sel.roomPrice, 0);
    const discount = calculateDiscount(actualRoomTotal);
    const subtotal = actualRoomTotal + addonTotal;
    const final_ = Math.max(0, actualRoomTotal - discount + addonTotal);
    return { roomTotal: actualRoomTotal, addonTotal, subtotal, discount, final: final_ };
  };

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
      const nights = calculateNights();
      if (nights > 0) {
        const dates: string[] = [];
        const start = new Date(form.check_in_date);
        for (let i = 0; i < nights; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          dates.push(format(d, "yyyy-MM-dd"));
        }
        for (const sel of roomSelections) {
          const template = pricingTemplates.find(t => t.id === sel.template_id);
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
          sel.roomPrice = perRoom * sel.quantity;
        }
      }
      const totals = getTotals();
      const depositAmount = useDeposit ? Math.round(totals.final * (depositPct / 100)) : 0;
      const balanceAmount = totals.final - depositAmount;

      let paymentStatus = "unpaid";
      let paidAmount = 0;
      if (!useDeposit) {
        if (form.balance_paid) {
          paymentStatus = "paid";
          paidAmount = totals.final;
        }
      } else if (form.deposit_paid && form.balance_paid) {
        paymentStatus = "paid";
        paidAmount = totals.final;
      } else if (form.deposit_paid) {
        paymentStatus = "deposit_paid";
        paidAmount = depositAmount;
      }

      const { data: orderNumber, error: orderNumberError } = await supabase.rpc('generate_order_number');
      if (orderNumberError) throw orderNumberError;

      // Use first room selection as primary room_type_id
      const primaryRoom = roomSelections[0];

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
          if (bookingMode === 'exclusive' && (exclusiveDoubleRooms > 0 || exclusiveQuadRooms > 0)) {
            const roomDetail = `【${exclusiveLabel}房間配置】雙人房 ${exclusiveDoubleRooms} 間、四人房 ${exclusiveQuadRooms} 間`;
            note = note ? `${roomDetail}\n${note}` : roomDetail;
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
              return {
                addon_type: addon?.addon_type || '',
                count: a.quantity,
                price_per_unit: addon?.price_per_unit || 0,
                total: (addon?.price_per_unit || 0) * a.quantity,
                unit_label: addon?.unit_label || '',
              };
            })
          : null,
        confirmed_at: form.order_status === "confirmed" ? new Date().toISOString() : null,
        order_source: form.order_source || "manual",
        deposit_required_amount: form.security_deposit_amount,
        deposit_method: form.security_deposit_method,
        deposit_status: "pending",
      }).select('id').single();

      if (error) throw error;

      // Insert order_rooms
      if (orderData?.id && roomSelections.length > 0) {
        const orderRooms = roomSelections.map(sel => ({
          order_id: orderData.id,
          room_type_id: sel.room_type_id,
          quantity: sel.quantity,
          room_price: sel.roomPrice,
          template_id: sel.template_id || null,
          template_name: sel.template_name || null,
        }));
        const { error: roomsError } = await supabase.from("order_rooms").insert(orderRooms);
        if (roomsError) {
          await supabase.from("orders").delete().eq("id", orderData.id);
          throw roomsError;
        }
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

      toast({
        title: "新增成功",
        description: `訂單 ${orderNumber} 已建立`,
      });

      onSuccess();
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
                          if (roomSelections[0]) {
                            setRoomSelections([{
                              ...roomSelections[0],
                              template_id: value,
                              template_name: template?.template_name || "",
                            }]);
                          }
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
                {roomSelections[0]?.roomPrice > 0 && (
                  <div className="text-xs text-right text-muted-foreground">
                    小計：NT$ {roomSelections[0].roomPrice.toLocaleString()}（{exclusiveLabel}）
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Normal mode: multi-room selection */}
        {bookingMode === "normal" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                共 {totalRoomCount} / {MAX_TOTAL_ROOMS} 間
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRoomSelection}
                disabled={totalRoomCount >= MAX_TOTAL_ROOMS || roomTypes.filter(r => !r.is_exclusive_package).length === 0}
                className="h-8 gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                新增房間
              </Button>
            </div>

            {roomSelections.length === 0 && (
              <div className="p-4 border rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
                請點擊「新增房間」加入房型
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
                        {roomTypes.filter(r => !r.is_exclusive_package).map((rt) => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.name} (最多{rt.capacity}人)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">專案</Label>
                    {sel.filteredTemplates.length > 0 ? (
                      <Select
                        value={sel.template_id}
                        onValueChange={(value) => {
                          const template = sel.filteredTemplates.find(t => t.id === value);
                          updateRoomSelection(sel.id, {
                            template_id: value,
                            template_name: template?.template_name || "",
                          });
                        }}
                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="選擇專案" />
                        </SelectTrigger>
                        <SelectContent>
                          {sel.filteredTemplates.map((template) => (
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
                        disabled={totalRoomCount >= MAX_TOTAL_ROOMS}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

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
            <Label className="text-xs">加購方案</Label>
            {addonSettings.map((addon) => {
              const selectedAddon = selectedAddons.find(a => a.addon_id === addon.id);
              const quantity = selectedAddon?.quantity || 0;
              
              return (
                <div key={addon.id} className="flex items-center justify-between p-2 bg-background rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs">{addon.addon_type === 'pet' ? '寵物方案' : addon.addon_type === 'meal' ? '餐食方案' : addon.addon_type}</div>
                    <div className="text-xs text-primary">
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
                    <span className="w-6 text-center text-xs font-medium">{quantity}</span>
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
      </div>

      {/* Price Summary */}
      {(() => {
        const depositAmount = useDeposit ? Math.round(totals.final * (depositPct / 100)) : 0;
        const balanceAmount = totals.final - depositAmount;
        
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
            {useDeposit && (
              <div className="flex justify-between text-sm">
                <span className={cn("text-muted-foreground", form.deposit_paid && "line-through")}>
                  訂金 ({depositPct}%)
                </span>
                <span className={cn(form.deposit_paid && "line-through text-muted-foreground")}>
                  NT$ {depositAmount.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className={cn("text-muted-foreground", form.balance_paid && "line-through")}>
                {useDeposit ? `尾款 (${100 - depositPct}%)` : "應付金額"}
              </span>
              <span className={cn(form.balance_paid && "line-through text-muted-foreground")}>
                NT$ {balanceAmount.toLocaleString()}
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
            <div className="font-medium mb-1">庫存不足警告</div>
            <ul className="text-sm space-y-1">
              {inventoryWarnings.map((warning, index) => (
                <li key={index}>
                  {warning.blocked ? (
                    <span>
                      {format(parseISO(warning.date), "MM/dd")}{warning.roomName ? ` ${warning.roomName}` : ""}：已關閉或無庫存
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

      <div className={cn("grid grid-cols-1 gap-4", useDeposit && "sm:grid-cols-2")}>
        {useDeposit && (
          <div className="space-y-2">
            <Label>訂金支付狀態</Label>
            <Select 
              value={form.deposit_paid ? "paid" : "unpaid"} 
              onValueChange={(value) => setForm({...form, deposit_paid: value === "paid"})}
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
        )}

        <div className="space-y-2">
          <Label>{useDeposit ? "尾款支付狀態" : "付款狀態"}</Label>
          <Select 
            value={form.balance_paid ? "paid" : "unpaid"} 
            onValueChange={(value) => setForm({...form, balance_paid: value === "paid"})}
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
      </div>

      <div className={cn("grid grid-cols-1 gap-4", useDeposit && "sm:grid-cols-2")}>
        {useDeposit && (
          <div className="space-y-2">
            <Label>訂金付款方式</Label>
            <Select value={form.deposit_payment_method} onValueChange={(value) => setForm({...form, deposit_payment_method: value})}>
              <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                <SelectValue placeholder="選擇付款方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit_card">信用卡</SelectItem>
                <SelectItem value="line_pay">LINE Pay</SelectItem>
                <SelectItem value="bank_transfer">轉帳匯款</SelectItem>
                <SelectItem value="cash">現金</SelectItem>
                <SelectItem value="monthly">月結</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>{useDeposit ? "尾款付款方式" : "付款方式"}</Label>
          <Select value={form.balance_payment_method} onValueChange={(value) => setForm({...form, balance_payment_method: value})}>
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
              <SelectValue placeholder="選擇付款方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credit_card">信用卡</SelectItem>
              <SelectItem value="line_pay">LINE Pay</SelectItem>
              <SelectItem value="bank_transfer">轉帳匯款</SelectItem>
              <SelectItem value="cash">現金</SelectItem>
              <SelectItem value="monthly">月結</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-base font-semibold">押金</Label>
          <span className="text-xs text-muted-foreground">入住前一天扣款</span>
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
