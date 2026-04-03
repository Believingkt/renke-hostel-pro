import { useEffect, useState } from "react";
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
import { CalendarIcon, Tag, X, AlertTriangle, Loader2, Ban, Trash2 } from "lucide-react";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
}

interface PricingTemplate {
  id: string;
  template_name: string;
  meal_plans: any;
  project_name: string | null;
  price: number | null;
  weekday_price: number | null;
  weekend_price: number | null;
  room_type_id: string | null;
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

interface EditOrderDialogProps {
  open: boolean;
  order: Order | null;
  onOpenChange: (open: boolean) => void;
  onSave: (form: { 
    order_status: string; 
    payment_status: string;
    deposit_payment_method: string;
    balance_payment_method: string;
    deposit_amount: number;
    notes: string;
    check_in_date: string;
    check_out_date: string;
    room_type_id: string;
    guest_count: number;
    total_price: number;
    discount_amount: number;
    final_price: number;
    discount_code: string | null;
    meal_plan: string | null;
    meal_plan_details: { addon_id: string; quantity: number }[] | null;
    custom_addon_details?: any[] | null;
    guest_name: string;
    guest_phone: string;
    guest_email: string;
  }) => Promise<void>;
  onCancel?: (orderId: string) => Promise<void>;
  onDelete?: (orderId: string) => Promise<void>;
}

export function EditOrderDialog({ open, order, onOpenChange, onSave, onCancel, onDelete }: EditOrderDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "delete" | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [pricingTemplates, setPricingTemplates] = useState<PricingTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<PricingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [addonSettings, setAddonSettings] = useState<AddonSetting[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [calculatedPrice, setCalculatedPrice] = useState({ total: 0, discount: 0, final: 0 });
  const [inventoryWarnings, setInventoryWarnings] = useState<{ date: string; available: number; blocked?: boolean; blockedBy?: string }[]>([]);
  const [isCheckingInventory, setIsCheckingInventory] = useState(false);
  const [manualTotalPriceStr, setManualTotalPriceStr] = useState<string | null>(null);
  const [manualDiscountStr, setManualDiscountStr] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; type: "percentage" | "amount"; value: number } | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    order_status: "",
    deposit_payment_method: "",
    balance_payment_method: "",
    notes: "",
    check_in_date: "",
    check_out_date: "",
    room_type_id: "",
    guest_count: 2,
    meal_plan: "2_meals",
    selected_addons: [] as { addon_id: string; quantity: number }[],
    deposit_paid: false,
    balance_paid: false,
    guest_name: "",
    guest_phone: "",
    guest_email: "",
  });

  // Fetch room types, public holidays, templates, and addons
  useEffect(() => {
    const fetchData = async () => {
      if (!currentAccommodationId) return;
      
      const [roomTypesResult, holidaysResult, addonsResult, templatesResult] = await Promise.all([
        supabase
          .from("room_types")
          .select("id, name, capacity")
          .eq("accommodation_id", currentAccommodationId)
          .order("display_order"),
        supabase
          .from("public_holidays")
          .select("holiday_date")
          .eq("accommodation_id", currentAccommodationId),
        supabase
          .from("addon_settings")
          .select("id, addon_type, description, price_per_unit, unit_label, enabled, max_quantity")
          .eq("accommodation_id", currentAccommodationId)
          .eq("enabled", true),
        supabase
          .from("pricing_templates")
          .select("id, template_name, meal_plans, project_name, room_type_id, price, weekday_price, weekend_price")
          .eq("accommodation_id", currentAccommodationId)
          .order("display_order")
      ]);

      if (!roomTypesResult.error && roomTypesResult.data) {
        setRoomTypes(roomTypesResult.data);
      }

      if (holidaysResult.data) {
        setPublicHolidays(holidaysResult.data.map(h => h.holiday_date));
      }

      if (!addonsResult.error && addonsResult.data) {
        setAddonSettings(addonsResult.data);
      }

      if (!templatesResult.error && templatesResult.data) {
        setPricingTemplates(templatesResult.data);
      }
    };

    fetchData();
  }, [currentAccommodationId]);

  // Filter templates by room_type_id
  useEffect(() => {
    if (!editForm.room_type_id) {
      setFilteredTemplates([]);
      setSelectedTemplateId("");
      return;
    }

    if (pricingTemplates.length === 0) {
      setFilteredTemplates([]);
      setSelectedTemplateId("");
      return;
    }

    const filtered = pricingTemplates.filter(t => t.room_type_id === editForm.room_type_id);
    const result = filtered.length > 0
      ? filtered
      : pricingTemplates.filter(t => !t.room_type_id);
    const finalList = result.length > 0 ? result : pricingTemplates;

    setFilteredTemplates(finalList);
    
    // Try to match current meal_plan to a template
    const currentMatch = finalList.find(t => t.template_name === editForm.meal_plan);
    if (currentMatch) {
      setSelectedTemplateId(currentMatch.id);
    } else {
      setSelectedTemplateId(finalList[0]?.id || "");
      setEditForm(prev => ({ ...prev, meal_plan: finalList[0]?.template_name || "" }));
    }
  }, [editForm.room_type_id, pricingTemplates]);

  // 當 order 變化時更新表單
  useEffect(() => {
    if (!order) return;

    const loadOrderAddons = async () => {
      let selectedAddons: { addon_id: string; quantity: number }[] = [];

      // Always prefer custom_addon_details as the source of truth (updated by both EditOrder and PriceEdit dialogs)
      const { data } = await supabase
        .from("orders")
        .select("custom_addon_details")
        .eq("id", order.id)
        .single();

      if (data?.custom_addon_details && Array.isArray(data.custom_addon_details) && (data.custom_addon_details as any[]).length > 0) {
        // Fetch addon settings to match by addon_type
        const { data: addons } = await supabase
          .from("addon_settings")
          .select("id, addon_type")
          .eq("accommodation_id", currentAccommodationId || "");

        if (addons) {
          const addonMap = new Map(addons.map(a => [a.addon_type, a.id]));
          selectedAddons = (data.custom_addon_details as any[])
            .filter((d: any) => d && d.addon_type && d.count > 0)
            .map((d: any) => ({
              addon_id: addonMap.get(d.addon_type) || "",
              quantity: d.count,
            }))
            .filter(a => a.addon_id);
        }
      } else if (order.meal_plan_details && Array.isArray(order.meal_plan_details)) {
        // Fallback to meal_plan_details for legacy data
        selectedAddons = order.meal_plan_details as { addon_id: string; quantity: number }[];
      }

      // Determine deposit_paid and balance_paid from existing payment_status and paid_amount
      const depositAmount = Math.round((order.final_price || 0) * 0.3);
      const paidAmount = (order as any).paid_amount || 0;

      const depositPaid = order.payment_status === 'deposit_paid' || order.payment_status === 'paid' || paidAmount >= depositAmount;
      const balancePaid = order.payment_status === 'paid' || paidAmount >= (order.final_price || 0);

      setEditForm({
        order_status: order.order_status,
        deposit_payment_method: (order as any).deposit_payment_method || "",
        balance_payment_method: (order as any).balance_payment_method || "",
        notes: order.notes || "",
        check_in_date: order.check_in_date,
        check_out_date: order.check_out_date,
        room_type_id: order.room_types?.id || "",
        guest_count: order.guest_count,
        meal_plan: order.meal_plan || "2_meals",
        selected_addons: selectedAddons,
        deposit_paid: depositPaid,
        balance_paid: balancePaid,
        guest_name: order.guest_name,
        guest_phone: order.guest_phone,
        guest_email: order.guest_email || "",
      });

      // 載入現有的折扣碼
      if (order.discount_code) {
        setDiscountCode(order.discount_code);
        setAppliedDiscount({
          code: order.discount_code,
          type: order.discount_amount && order.total_price
            ? (order.discount_amount / order.total_price > 1 ? "amount" : "percentage")
            : "amount",
          value: order.discount_amount || 0
        });
      } else {
        setDiscountCode("");
        setAppliedDiscount(null);
      }

      // Initialize manual overrides from saved order values
      setManualTotalPriceStr(String(order.total_price));
      setManualDiscountStr(String(order.discount_amount));
    };

    loadOrderAddons();
  }, [order, currentAccommodationId]);

  // Helper functions for price calculation
  const isSaturday = (date: Date) => date.getDay() === 6;
  
  const isPublicHoliday = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return publicHolidays.includes(dateStr);
  };
  
  const isWeekend = (date: Date) => isSaturday(date) || isPublicHoliday(date);

  const calculateNights = () => {
    if (!editForm.check_in_date || !editForm.check_out_date) return 0;
    const start = new Date(editForm.check_in_date);
    const end = new Date(editForm.check_out_date);
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const calculateDiscount = (total: number) => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === "percentage") {
      return Math.round(total * (appliedDiscount.value / 100));
    }
    return appliedDiscount.value;
  };

  const calculatePrice = async () => {
    if (!editForm.room_type_id || !editForm.check_in_date || !editForm.check_out_date) {
      return { total: 0, discount: 0, final: 0 };
    }

    const nights = calculateNights();
    if (nights === 0) return { total: 0, discount: 0, final: 0 };

    let total = 0;

    // Use selected template price if available
    const selectedTemplate = pricingTemplates.find(t => t.id === selectedTemplateId)
      || filteredTemplates.find(t => t.id === selectedTemplateId);

    if (selectedTemplate && selectedTemplate.price != null && selectedTemplate.price > 0) {
      total = selectedTemplate.price * nights;
    } else {
      // Fallback: sum inventory prices based on template meal type
      let priceColumn = 'price';
      if (selectedTemplate) {
        const name = selectedTemplate.template_name || selectedTemplate.project_name || '';
        if (name.includes('三食') || name.includes('3食')) priceColumn = 'price_3_meals';
        else if (name.includes('二食') || name.includes('2食') || name.includes('兩食')) priceColumn = 'price_2_meals';
      }

      const start = new Date(editForm.check_in_date);
      for (let i = 0; i < nights; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        const dateStr = format(currentDate, "yyyy-MM-dd");

        const { data: priceData } = await supabase
          .from("room_inventory_pricing")
          .select("price, price_2_meals, price_3_meals")
          .eq("room_type_id", editForm.room_type_id)
          .eq("date", dateStr)
          .maybeSingle();

        if (priceData) {
          const selectedPrice = (priceData as any)[priceColumn];
          total += (selectedPrice != null && selectedPrice > 0) ? selectedPrice : (priceData.price ?? 0);
        }
      }
    }

    const discount = calculateDiscount(total);
    const final = Math.max(0, total - discount);

    return { total, discount, final };
  };

  // Check inventory and recalculate price when dates, room type, or discount change
  useEffect(() => {
    const checkInventoryAndPrice = async () => {
      if (!editForm.room_type_id || !editForm.check_in_date || !editForm.check_out_date || !currentAccommodationId) {
        setCalculatedPrice({ total: 0, discount: 0, final: 0 });
        setInventoryWarnings([]);
        return;
      }

      setIsCheckingInventory(true);
      
      try {
        const nights = calculateNights();
        if (nights === 0) {
          setCalculatedPrice({ total: 0, discount: 0, final: 0 });
          setInventoryWarnings([]);
          return;
        }

        // Generate date array for batch query
        const dates: string[] = [];
        const start = new Date(editForm.check_in_date);
        for (let i = 0; i < nights; i++) {
          const currentDate = new Date(start);
          currentDate.setDate(start.getDate() + i);
          dates.push(format(currentDate, "yyyy-MM-dd"));
        }

        // Check inventory using batch function
        const { data: inventoryData, error: inventoryError } = await supabase.rpc(
          'get_adjusted_room_inventory_batch',
          {
            p_room_type_id: editForm.room_type_id,
            p_dates: dates,
            p_accommodation_id: currentAccommodationId
          }
        );

        if (inventoryError) {
          console.error("Error checking inventory:", inventoryError);
        }

        // Check for insufficient inventory (exclude current order's dates if same room type)
        const warnings: { date: string; available: number; blocked?: boolean; blockedBy?: string }[] = [];
        if (inventoryData) {
          for (const item of inventoryData) {
            // For edit mode, we need to account for the current order
            // If the order is for the same room type, we have 1 room already "reserved"
            const isCurrentOrderRoom = order?.room_types?.id === editForm.room_type_id;
            const isDateInCurrentOrder = order && item.date_value >= order.check_in_date && item.date_value < order.check_out_date;
            const adjustedAvailable = (isCurrentOrderRoom && isDateInCurrentOrder) ? item.available_rooms + 1 : item.available_rooms;

            if (item.is_blocked && !(isCurrentOrderRoom && isDateInCurrentOrder)) {
              warnings.push({
                date: item.date_value,
                available: 0,
                blocked: true,
                blockedBy: item.blocked_by_room_name
              });
            } else if (adjustedAvailable < 1) {
              warnings.push({
                date: item.date_value,
                available: adjustedAvailable
              });
            }
          }
        }
        setInventoryWarnings(warnings);

        // Calculate price
        const newPrice = await calculatePrice();
        setCalculatedPrice(newPrice);
      } finally {
        setIsCheckingInventory(false);
      }
    };

    checkInventoryAndPrice();
  }, [editForm.check_in_date, editForm.check_out_date, editForm.room_type_id, selectedTemplateId, appliedDiscount, currentAccommodationId, order, pricingTemplates]);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !currentAccommodationId) {
      toast({
        title: "請輸入折扣代碼",
        variant: "destructive",
      });
      return;
    }

    setIsValidatingCode(true);
    
    try {
      const { data, error } = await supabase.rpc('validate_discount_code', {
        p_code: discountCode.trim().toUpperCase(),
        p_accommodation_id: currentAccommodationId,
        p_order_amount: calculatedPrice.total,
        p_room_type_id: editForm.room_type_id || null,
        p_check_in_date: editForm.check_in_date || null
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
          description: `已套用 ${
            result.discount_type === "percentage"
              ? `${result.discount_value}% 折扣`
              : `NT$ ${result.discount_value} 折扣`
          }`,
        });
      } else {
        toast({
          title: "折扣代碼無效",
          description: result.message,
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

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    toast({
      title: "已移除折扣",
      description: "折扣代碼已清除",
    });
  };

  const handleSave = async () => {
    // Validate dates
    if (!editForm.check_in_date || !editForm.check_out_date) {
      toast({
        title: "日期錯誤",
        description: "請選擇入住和退房日期",
        variant: "destructive",
      });
      return;
    }

    const checkInDate = parseISO(editForm.check_in_date);
    const checkOutDate = parseISO(editForm.check_out_date);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      toast({
        title: "日期錯誤",
        description: "日期格式不正確",
        variant: "destructive",
      });
      return;
    }

    if (!isAfter(checkOutDate, checkInDate)) {
      toast({
        title: "日期錯誤",
        description: "退房日期必須在入住日期之後",
        variant: "destructive",
      });
      return;
    }

    if (!editForm.room_type_id) {
      toast({
        title: "房型錯誤",
        description: "請選擇房型",
        variant: "destructive",
      });
      return;
    }

    if (!editForm.meal_plan) {
      toast({
        title: "專案錯誤",
        description: "請選擇專案",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Calculate deposit and balance amounts
      const addonTotal = editForm.selected_addons.reduce((sum, selectedAddon) => {
        const addon = addonSettings.find(a => a.id === selectedAddon.addon_id);
        return sum + (addon ? addon.price_per_unit * selectedAddon.quantity : 0);
      }, 0);
      const effectiveTotal = manualTotalPriceStr !== null ? Math.max(0, parseInt(manualTotalPriceStr) || 0) : calculatedPrice.total;
      const effectiveDiscount = manualDiscountStr !== null ? Math.max(0, parseInt(manualDiscountStr) || 0) : calculatedPrice.discount;
      const totalFinal = Math.max(0, effectiveTotal - effectiveDiscount + addonTotal);
      const depositAmount = Math.round(totalFinal * 0.3);
      
      // Determine payment_status based on deposit_paid and balance_paid
      let payment_status = "unpaid";
      if (editForm.deposit_paid && editForm.balance_paid) {
        payment_status = "paid";
      } else if (editForm.deposit_paid) {
        payment_status = "deposit_paid";
      }
      
      // Build custom_addon_details for persistence
      const customAddonDetails = editForm.selected_addons
        .filter(sa => sa.quantity > 0)
        .map(sa => {
          const addon = addonSettings.find(a => a.id === sa.addon_id);
          return addon ? {
            addon_type: addon.addon_type,
            count: sa.quantity,
            price_per_unit: addon.price_per_unit,
            total: addon.price_per_unit * sa.quantity,
            unit_label: addon.unit_label,
          } : null;
        })
        .filter(Boolean);

      await onSave({
        order_status: editForm.order_status,
        payment_status,
        deposit_payment_method: editForm.deposit_payment_method,
        balance_payment_method: editForm.balance_payment_method,
        deposit_amount: depositAmount,
        notes: editForm.notes,
        check_in_date: editForm.check_in_date,
        check_out_date: editForm.check_out_date,
        room_type_id: editForm.room_type_id,
        guest_count: editForm.guest_count,
        total_price: effectiveTotal,
        discount_amount: effectiveDiscount,
        final_price: totalFinal,
        discount_code: appliedDiscount?.code || null,
        meal_plan: editForm.meal_plan || null,
        meal_plan_details: editForm.selected_addons.length > 0 ? editForm.selected_addons : null,
        custom_addon_details: customAddonDetails.length > 0 ? customAddonDetails : null,
        guest_name: editForm.guest_name,
        guest_phone: editForm.guest_phone,
        guest_email: editForm.guest_email,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!order) return null;

  const formContent = (
    <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>訂單編號</Label>
            <Input value={order.order_number} disabled className="h-12 text-base sm:h-10 sm:text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>訂購人 <span className="text-destructive">*</span></Label>
              <Input 
                value={editForm.guest_name} 
                onChange={(e) => setEditForm({...editForm, guest_name: e.target.value})}
                placeholder="請輸入訂購人姓名"
                className="h-12 text-base sm:h-10 sm:text-sm" 
              />
            </div>
            <div className="space-y-2">
              <Label>聯絡電話 <span className="text-destructive">*</span></Label>
              <Input 
                value={editForm.guest_phone} 
                onChange={(e) => setEditForm({...editForm, guest_phone: e.target.value})}
                placeholder="請輸入聯絡電話"
                className="h-12 text-base sm:h-10 sm:text-sm" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>電子信箱</Label>
            <Input 
              value={editForm.guest_email} 
              onChange={(e) => setEditForm({...editForm, guest_email: e.target.value})}
              placeholder="請輸入電子信箱（選填）"
              type="email"
              className="h-12 text-base sm:h-10 sm:text-sm" 
            />
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
                      editForm.check_in_date 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                        : "bg-background text-foreground hover:bg-primary hover:text-primary-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editForm.check_in_date ? format(parseISO(editForm.check_in_date), "yyyy/MM/dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editForm.check_in_date ? parseISO(editForm.check_in_date) : undefined}
                    onSelect={(date) => {
                      if (date && !isNaN(date.getTime())) {
                        const newCheckIn = format(date, "yyyy-MM-dd");
                        if (editForm.check_out_date && !isAfter(parseISO(editForm.check_out_date), date)) {
                          setEditForm({...editForm, check_in_date: newCheckIn, check_out_date: ""});
                        } else {
                          setEditForm({...editForm, check_in_date: newCheckIn});
                        }
                        setCheckInOpen(false);
                        setTimeout(() => setCheckOutOpen(true), 150);
                      }
                    }}
                    disabled={(date) => isBefore(date, new Date(new Date().setHours(0, 0, 0, 0)))}
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
                      editForm.check_out_date 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                        : "bg-background text-foreground hover:bg-primary hover:text-primary-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editForm.check_out_date ? format(parseISO(editForm.check_out_date), "yyyy/MM/dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editForm.check_out_date ? parseISO(editForm.check_out_date) : undefined}
                    onSelect={(date) => {
                      if (date && !isNaN(date.getTime())) {
                        if (editForm.check_in_date && isAfter(date, parseISO(editForm.check_in_date))) {
                          setEditForm({...editForm, check_out_date: format(date, "yyyy-MM-dd")});
                          setCheckOutOpen(false);
                        } else {
                          toast({
                            title: "日期錯誤",
                            description: "退房日期必須在入住日期之後",
                            variant: "destructive",
                          });
                        }
                      }
                    }}
                    disabled={(date) => {
                      if (!editForm.check_in_date) return true;
                      return !isAfter(date, parseISO(editForm.check_in_date));
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>房型 <span className="text-destructive">*</span></Label>
              <Select value={editForm.room_type_id} onValueChange={(value) => setEditForm({...editForm, room_type_id: value})}>
                <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name} (最多{room.capacity}人)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>入住人數 <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={editForm.guest_count}
                onChange={(e) => setEditForm({...editForm, guest_count: parseInt(e.target.value) || 1})}
                className="h-12 text-base sm:h-10 sm:text-sm"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* 專案選擇 */}
          <div className="space-y-2">
            <Label>專案 <span className="text-destructive">*</span></Label>
            <Select 
              value={selectedTemplateId} 
              onValueChange={(value) => {
                setSelectedTemplateId(value);
                const template = filteredTemplates.find(t => t.id === value);
                if (template) {
                  setEditForm(prev => ({ ...prev, meal_plan: template.template_name }));
                }
              }}
              disabled={filteredTemplates.length === 0}
            >
              <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                <SelectValue placeholder={filteredTemplates.length === 0 ? "請先選擇房型" : "選擇專案"} />
              </SelectTrigger>
              <SelectContent>
                {filteredTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.template_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 加購方案選擇 */}
          {addonSettings.length > 0 && (
            <div className="space-y-3">
              <Label>加購方案</Label>
              <div className="space-y-2">
                {addonSettings.map((addon) => {
                  const selectedAddon = editForm.selected_addons.find(a => a.addon_id === addon.id);
                  const quantity = selectedAddon?.quantity || 0;
                  
                  return (
                    <div key={addon.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{addon.addon_type === 'pet' ? '寵物方案' : addon.addon_type === 'meal' ? '餐食方案' : addon.addon_type}</div>
                        {addon.description && (
                          <div className="text-xs text-muted-foreground truncate">{addon.description}</div>
                        )}
                        <div className="text-xs text-primary">
                          NT$ {addon.price_per_unit.toLocaleString()} / {addon.unit_label}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            if (quantity > 0) {
                              const newAddons = quantity === 1
                                ? editForm.selected_addons.filter(a => a.addon_id !== addon.id)
                                : editForm.selected_addons.map(a => 
                                    a.addon_id === addon.id ? { ...a, quantity: a.quantity - 1 } : a
                                  );
                              setEditForm({ ...editForm, selected_addons: newAddons });
                            }
                          }}
                          disabled={quantity === 0}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            if (quantity < addon.max_quantity) {
                              const existingIndex = editForm.selected_addons.findIndex(a => a.addon_id === addon.id);
                              const newAddons = existingIndex >= 0
                                ? editForm.selected_addons.map(a => 
                                    a.addon_id === addon.id ? { ...a, quantity: a.quantity + 1 } : a
                                  )
                                : [...editForm.selected_addons, { addon_id: addon.id, quantity: 1 }];
                              setEditForm({ ...editForm, selected_addons: newAddons });
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
              {(() => {
                const addonSubtotal = editForm.selected_addons.reduce((sum, sa) => {
                  const a = addonSettings.find(x => x.id === sa.addon_id);
                  return sum + (a ? a.price_per_unit * sa.quantity : 0);
                }, 0);
                return addonSubtotal > 0 ? (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-sm font-medium text-muted-foreground">加購小計</span>
                    <span className="font-medium">NT$ {addonSubtotal.toLocaleString()}</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Discount Code Section - moved after addons */}
          <div className="space-y-2 pt-4 border-t">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              折扣碼
            </Label>
            {appliedDiscount ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm py-2 px-3">
                  {appliedDiscount.code} - 
                  {appliedDiscount.type === "percentage" 
                    ? ` ${appliedDiscount.value}% 折扣` 
                    : ` NT$ ${appliedDiscount.value} 折扣`}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveDiscount}
                  className="h-10 w-10 sm:h-8 sm:w-8 p-0 touch-manipulation"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="輸入折扣代碼"
                  className="flex-1 h-12 text-base sm:h-10 sm:text-sm"
                  disabled={isValidatingCode}
                  inputMode="text"
                />
                <Button
                  type="button"
                  onClick={handleApplyDiscount}
                  disabled={isValidatingCode || !discountCode.trim()}
                  variant="outline"
                  className="h-12 sm:h-10 touch-manipulation"
                >
                  {isValidatingCode ? "驗證中..." : "套用"}
                </Button>
              </div>
            )}
          </div>

          {/* Price Display - moved after discount code */}
          {calculatedPrice.total > 0 && (() => {
            const addonTotal = editForm.selected_addons.reduce((sum, selectedAddon) => {
              const addon = addonSettings.find(a => a.id === selectedAddon.addon_id);
              return sum + (addon ? addon.price_per_unit * selectedAddon.quantity : 0);
            }, 0);
            const effectiveTotal = manualTotalPriceStr !== null ? Math.max(0, parseInt(manualTotalPriceStr) || 0) : calculatedPrice.total;
            const effectiveDiscount = manualDiscountStr !== null ? Math.max(0, parseInt(manualDiscountStr) || 0) : calculatedPrice.discount;
            const totalFinal = Math.max(0, effectiveTotal - effectiveDiscount + addonTotal);
            const depositAmount = Math.round(totalFinal * 0.3);
            const balanceAmount = totalFinal - depositAmount;
            
            return (
            <div className="space-y-2 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">住宿天數</span>
                <span className="font-medium flex items-center gap-2">
                  {isCheckingInventory && <Loader2 className="h-3 w-3 animate-spin" />}
                  {calculateNights()} 晚
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-total-price">房費金額</Label>
                <Input
                  id="edit-total-price"
                  type="number"
                  min={0}
                  value={manualTotalPriceStr !== null ? manualTotalPriceStr : String(calculatedPrice.total)}
                  onChange={(e) => setManualTotalPriceStr(e.target.value)}
                  className="h-12 text-base sm:h-10 sm:text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-discount-amount">折扣金額</Label>
                <Input
                  id="edit-discount-amount"
                  type="number"
                  min={0}
                  value={manualDiscountStr !== null ? manualDiscountStr : String(calculatedPrice.discount)}
                  onChange={(e) => setManualDiscountStr(e.target.value)}
                  className="h-12 text-base sm:h-10 sm:text-sm"
                />
              </div>
              <div className="flex justify-between items-center py-3 bg-primary/5 px-4 rounded-lg">
                <span className="font-semibold">總金額</span>
                <span className="font-bold text-lg text-primary">
                  NT$ {totalFinal.toLocaleString()}
                </span>
              </div>
              
              {/* Deposit and Balance Display */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">訂金 (30%)</span>
                  <span className={cn(
                    "font-medium",
                    editForm.deposit_paid && "line-through text-muted-foreground"
                  )}>
                    NT$ {depositAmount.toLocaleString()}
                    {editForm.deposit_paid && <span className="ml-2 text-primary no-underline">已付</span>}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">尾款 (70%)</span>
                  <span className={cn(
                    "font-medium",
                    editForm.balance_paid && "line-through text-muted-foreground"
                  )}>
                    NT$ {balanceAmount.toLocaleString()}
                    {editForm.balance_paid && <span className="ml-2 text-primary no-underline">已付</span>}
                  </span>
                </div>
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
                          {format(parseISO(warning.date), "MM/dd")}：已被 <strong>{warning.blockedBy}</strong> 預訂封鎖
                        </span>
                      ) : (
                        <span>
                          {format(parseISO(warning.date), "MM/dd")}：剩餘 <strong>{warning.available}</strong> 間
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="text-xs mt-2 text-amber-700 dark:text-amber-300">
                  仍可儲存變更，但請確認實際房況
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>訂單狀態</Label>
            <Select value={editForm.order_status} onValueChange={(value) => setEditForm({...editForm, order_status: value})}>
              <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hold">保留中</SelectItem>
                <SelectItem value="pending">待確認</SelectItem>
                <SelectItem value="confirmed">已確認</SelectItem>
                <SelectItem value="checked_in">已入住</SelectItem>
                <SelectItem value="checked_out">已退房</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>訂金支付狀態</Label>
              <Select 
                value={editForm.deposit_paid ? "paid" : "unpaid"} 
                onValueChange={(value) => {
                  const isPaid = value === "paid";
                  setEditForm({
                    ...editForm, 
                    deposit_paid: isPaid,
                    // If deposit is not paid, balance cannot be paid
                    balance_paid: isPaid ? editForm.balance_paid : false
                  });
                }}
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

            <div className="space-y-2">
              <Label>尾款支付狀態</Label>
              <Select 
                value={editForm.balance_paid ? "paid" : "unpaid"} 
                onValueChange={(value) => {
                  const isPaid = value === "paid";
                  setEditForm({
                    ...editForm, 
                    balance_paid: isPaid,
                    // If balance is paid, deposit must also be paid
                    deposit_paid: isPaid ? true : editForm.deposit_paid
                  });
                }}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>訂金付款方式</Label>
              <Select value={editForm.deposit_payment_method} onValueChange={(value) => setEditForm({...editForm, deposit_payment_method: value})}>
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

            <div className="space-y-2">
              <Label>尾款付款方式</Label>
              <Select value={editForm.balance_payment_method} onValueChange={(value) => setEditForm({...editForm, balance_payment_method: value})}>
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

          <div className="space-y-2">
            <Label>備註</Label>
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
              rows={4}
              placeholder="輸入訂單備註..."
              className="text-base sm:text-sm min-h-[120px]"
            />
          </div>
        </div>
      );

  const handleCancelOrder = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      await onCancel?.(order.id);
      onOpenChange(false);
    } finally {
      setIsCancelling(false);
      setConfirmAction(null);
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    setIsDeleting(true);
    try {
      await onDelete?.(order.id);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  };

  const isCancelled = order?.order_status === "cancelled";

  const footerButtons = (
    <div className="flex flex-col gap-3 w-full">
      {/* Confirm action alert */}
      {confirmAction && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {confirmAction === "cancel" ? "確定要取消此訂單嗎？此操作無法復原。" : "確定要刪除此訂單嗎？此操作無法復原。"}
            </span>
            <div className="flex gap-2 ml-4">
              <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)}>
                返回
              </Button>
              <Button 
                size="sm" 
                variant="destructive" 
                onClick={confirmAction === "cancel" ? handleCancelOrder : handleDeleteOrder}
                disabled={isCancelling || isDeleting}
              >
                {isCancelling || isDeleting ? "處理中..." : "確定"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-2 w-full">
        {/* Left side: danger actions */}
        <div className="flex gap-2 sm:mr-auto">
          {onCancel && !isCancelled && (
            <Button 
              variant="outline" 
              onClick={() => setConfirmAction("cancel")}
              disabled={isSaving || isValidating || !!confirmAction}
              className="h-12 sm:h-10 text-destructive border-destructive/30 hover:bg-destructive/10 touch-manipulation"
            >
              <Ban className="h-4 w-4 mr-1" />
              取消訂單
            </Button>
          )}
          {onDelete && (
            <Button 
              variant="outline" 
              onClick={() => setConfirmAction("delete")}
              disabled={isSaving || isValidating || !!confirmAction}
              className="h-12 sm:h-10 text-destructive border-destructive/30 hover:bg-destructive/10 touch-manipulation"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              刪除訂單
            </Button>
          )}
        </div>

        {/* Right side: save actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={isSaving || isValidating}
            className="h-12 sm:h-10 w-full sm:w-auto touch-manipulation"
          >
            關閉
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isValidating}
            className="h-12 sm:h-10 w-full sm:w-auto touch-manipulation"
          >
            {isValidating ? "驗證中..." : isSaving ? "儲存變更中..." : "儲存變更"}
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh]">
          <DrawerHeader>
            <DrawerTitle>編輯訂單</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4">
            {formContent}
          </div>
          <DrawerFooter className="pt-4">
            {footerButtons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯訂單</DialogTitle>
        </DialogHeader>
        {formContent}
        <DialogFooter>
          {footerButtons}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
