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
import { CalendarIcon, Tag, X, Loader2, User, Phone, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAuditLog } from "@/hooks/use-audit-log";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
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
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  const [addonSettings, setAddonSettings] = useState<AddonSetting[]>([]);
  const [pricingTemplates, setPricingTemplates] = useState<PricingTemplate[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [roomPrice, setRoomPrice] = useState(0);
  const [inventoryWarnings, setInventoryWarnings] = useState<{ date: string; available: number; blocked?: boolean; blockedBy?: string }[]>([]);
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

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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
      });
      setSelectedAddons([]);
      setDiscountCode("");
      setAppliedDiscount(null);
      setRoomPrice(0);
      setNameSuggestions([]);
      setPhoneSuggestions([]);
      setShowNameSuggestions(false);
      setShowPhoneSuggestions(false);
    }
  }, [open, initialData]);

  // Fetch room types, public holidays, and customers
  useEffect(() => {
    const fetchData = async () => {
      if (!currentAccommodationId) return;
      
      const [roomTypesResult, holidaysResult, customersResult, addonsResult, templatesResult] = await Promise.all([
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
          .select("id, template_name, meal_plans, project_name")
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
        // Set default meal_plan to first template if available
        if (templatesResult.data.length > 0) {
          setSelectedTemplateId(templatesResult.data[0].id);
          setForm(prev => ({ ...prev, meal_plan: templatesResult.data[0].template_name }));
        }
      }
    };

    fetchData();
  }, [currentAccommodationId]);

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

  // Check inventory and calculate price
  useEffect(() => {
    const checkInventoryAndPrice = async () => {
      if (!form.room_type_id || !form.check_in_date || !form.check_out_date || !currentAccommodationId) {
        setRoomPrice(0);
        setInventoryWarnings([]);
        return;
      }

      setIsCheckingInventory(true);
      
      try {
        const nights = calculateNights();
        if (nights === 0) {
          setRoomPrice(0);
          setInventoryWarnings([]);
          return;
        }

        const dates: string[] = [];
        const start = new Date(form.check_in_date);
        for (let i = 0; i < nights; i++) {
          const currentDate = new Date(start);
          currentDate.setDate(start.getDate() + i);
          dates.push(format(currentDate, "yyyy-MM-dd"));
        }

        // Check inventory
        const { data: inventoryData } = await supabase.rpc(
          'get_adjusted_room_inventory_batch',
          {
            p_room_type_id: form.room_type_id,
            p_dates: dates,
            p_accommodation_id: currentAccommodationId
          }
        );

        const warnings: typeof inventoryWarnings = [];
        if (inventoryData) {
          for (const item of inventoryData) {
            if (item.is_blocked) {
              warnings.push({
                date: item.date_value,
                available: 0,
                blocked: true,
                blockedBy: item.blocked_by_room_name,
              });
            } else if (item.available_rooms < 1) {
              warnings.push({
                date: item.date_value,
                available: item.available_rooms,
              });
            }
          }
        }
        setInventoryWarnings(warnings);

        // Determine which price column to use based on selected template's meal_plans
        const selectedTemplate = pricingTemplates.find(t => t.id === selectedTemplateId);
        let priceColumn = 'price';
        if (selectedTemplate?.meal_plans && Array.isArray(selectedTemplate.meal_plans)) {
          const mealCount = selectedTemplate.meal_plans.length;
          if (mealCount === 3) priceColumn = 'price_3_meals';
          else if (mealCount === 2) priceColumn = 'price_2_meals';
        }

        // Calculate price
        let total = 0;
        for (const dateStr of dates) {
          const { data: priceData } = await supabase
            .from("room_inventory_pricing")
            .select("price, price_2_meals, price_3_meals")
            .eq("room_type_id", form.room_type_id)
            .eq("date", dateStr)
            .maybeSingle();
          
          if (priceData) {
            const selectedPrice = (priceData as any)[priceColumn] ?? priceData.price;
            if (selectedPrice) total += selectedPrice;
          }
        }
        setRoomPrice(total);
      } finally {
        setIsCheckingInventory(false);
      }
    };

    checkInventoryAndPrice();
  }, [form.check_in_date, form.check_out_date, form.room_type_id, selectedTemplateId, currentAccommodationId, pricingTemplates]);

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
    const subtotal = roomPrice + addonTotal;
    const discount = calculateDiscount(subtotal);
    const final_ = Math.max(0, subtotal - discount);
    return { roomTotal: roomPrice, addonTotal, subtotal, discount, final: final_ };
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
    if (!form.room_type_id) {
      toast({ title: "房型錯誤", description: "請選擇房型", variant: "destructive" });
      return;
    }
    if (!form.meal_plan) {
      toast({ title: "專案錯誤", description: "請選擇專案", variant: "destructive" });
      return;
    }
    if (!currentAccommodationId) {
      toast({ title: "系統錯誤", description: "無法取得住宿資訊", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const totals = getTotals();
      const depositAmount = Math.round(totals.final * 0.3);
      const balanceAmount = totals.final - depositAmount;

      let paymentStatus = "unpaid";
      let paidAmount = 0;
      if (form.deposit_paid && form.balance_paid) {
        paymentStatus = "paid";
        paidAmount = totals.final;
      } else if (form.deposit_paid) {
        paymentStatus = "deposit_paid";
        paidAmount = depositAmount;
      }

      const { data: orderNumber, error: orderNumberError } = await supabase.rpc('generate_order_number');
      if (orderNumberError) throw orderNumberError;

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
        room_type_id: form.room_type_id,
        guest_count: form.guest_count,
        order_status: form.order_status,
        payment_status: paymentStatus,
        deposit_payment_method: form.deposit_payment_method || null,
        balance_payment_method: form.balance_payment_method || null,
        deposit_amount: depositAmount,
        paid_amount: paidAmount,
        notes: form.notes.trim() || null,
        total_price: roomPrice + totals.addonTotal,
        discount_amount: totals.discount,
        final_price: totals.final,
        discount_code: appliedDiscount?.code || null,
        meal_plan: form.meal_plan || null,
        meal_plan_details: selectedAddons.length > 0 ? selectedAddons : null,
        confirmed_at: form.order_status === "confirmed" ? new Date().toISOString() : null,
        order_source: form.order_source || "manual",
      }).select('id').single();

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

      {/* Room Type Selection */}
      <div className="space-y-3 pt-2">
        <Label className="text-base font-semibold">房型選擇</Label>
        <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">房型 <span className="text-destructive">*</span></Label>
              <Select
                value={form.room_type_id}
                onValueChange={(value) => setForm({...form, room_type_id: value})}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name} (最多{rt.capacity}人)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">入住人數</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={form.guest_count}
                onChange={(e) => setForm({...form, guest_count: parseInt(e.target.value) || 1})}
                className="h-10 text-sm"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">專案 <span className="text-destructive">*</span></Label>
            <Select
              value={selectedTemplateId}
              onValueChange={(value) => {
                setSelectedTemplateId(value);
                const template = pricingTemplates.find(t => t.id === value);
                setForm({...form, meal_plan: template?.template_name || value});
              }}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="選擇專案" />
              </SelectTrigger>
              <SelectContent>
                {pricingTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.project_name || template.template_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Addons */}
          {addonSettings.length > 0 && (
            <div className="space-y-2">
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
            <div className="text-xs text-right text-muted-foreground">
              小計：NT$ {roomPrice.toLocaleString()}
            </div>
          )}
        </div>
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
        const depositAmount = Math.round(totals.final * 0.3);
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
            {totals.addonTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">加購小計</span>
                <span>NT$ {totals.addonTotal.toLocaleString()}</span>
              </div>
            )}
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm text-primary">
                <span>折扣</span>
                <span>- NT$ {totals.discount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg pt-2 border-t">
              <span>總金額</span>
              <span className="text-primary">NT$ {totals.final.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className={cn("text-muted-foreground", form.deposit_paid && "line-through")}>
                訂金 (30%)
              </span>
              <span className={cn(form.deposit_paid && "line-through text-muted-foreground")}>
                NT$ {depositAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className={cn("text-muted-foreground", form.balance_paid && "line-through")}>
                尾款 (70%)
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
              仍可建立訂單，但請確認實際房況
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div className="space-y-2">
          <Label>尾款支付狀態</Label>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div className="space-y-2">
          <Label>尾款付款方式</Label>
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

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>新增訂單</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="flex-1 px-4 overflow-y-auto">
            {formContent}
          </ScrollArea>
          <DrawerFooter className="flex-row justify-end gap-2 border-t pt-4">
            {footerButtons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-visible">
        <DialogHeader>
          <DialogTitle>新增訂單</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-1 -mx-1 py-1">
          {formContent}
        </div>
        <DialogFooter className="border-t pt-4">
          {footerButtons}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
