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
import { CalendarIcon, Tag, X, Loader2, User, Phone, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO, isAfter, isBefore, addDays } from "date-fns";
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

interface RoomEntry {
  id: string; // unique key for React
  room_type_id: string;
  meal_plan: string;
  guest_count: number;
  selected_addons: { addon_id: string; quantity: number }[];
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

let roomEntryCounter = 0;
const createRoomEntry = (roomTypeId = "", mealPlan = "2_meals"): RoomEntry => ({
  id: `room-${++roomEntryCounter}`,
  room_type_id: roomTypeId,
  meal_plan: mealPlan,
  guest_count: 2,
  selected_addons: [],
});

export function CreateOrderDialog({ open, onOpenChange, onSuccess, initialData }: CreateOrderDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const { logAction } = useAuditLog();
  const [isSaving, setIsSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  const [addonSettings, setAddonSettings] = useState<AddonSetting[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [roomPrices, setRoomPrices] = useState<Map<string, number>>(new Map());
  const [inventoryWarnings, setInventoryWarnings] = useState<{ date: string; available: number; blocked?: boolean; blockedBy?: string; roomTypeName?: string }[]>([]);
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
  
  // Room entries - multiple room types
  const [roomEntries, setRoomEntries] = useState<RoomEntry[]>([createRoomEntry()]);

  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    check_in_date: "",
    check_out_date: "",
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
        check_in_date: initialData?.check_in_date || "",
        check_out_date: initialData?.check_out_date || "",
        order_status: "confirmed",
        deposit_payment_method: "",
        balance_payment_method: "",
        deposit_paid: false,
        balance_paid: false,
        notes: "",
        order_source: "",
      });
      setRoomEntries([createRoomEntry(initialData?.room_type_id || "")]);
      setDiscountCode("");
      setAppliedDiscount(null);
      setRoomPrices(new Map());
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
      
      const [roomTypesResult, holidaysResult, customersResult, addonsResult] = await Promise.all([
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
          .eq("enabled", true)
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

  // Check inventory and calculate price for all room entries
  useEffect(() => {
    const checkInventoryAndPrice = async () => {
      const validRooms = roomEntries.filter(r => r.room_type_id);
      if (validRooms.length === 0 || !form.check_in_date || !form.check_out_date || !currentAccommodationId) {
        setRoomPrices(new Map());
        setInventoryWarnings([]);
        return;
      }

      setIsCheckingInventory(true);
      
      try {
        const nights = calculateNights();
        if (nights === 0) {
          setRoomPrices(new Map());
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

        const newPrices = new Map<string, number>();
        const allWarnings: typeof inventoryWarnings = [];

        for (const room of validRooms) {
          // Check inventory
          const { data: inventoryData } = await supabase.rpc(
            'get_adjusted_room_inventory_batch',
            {
              p_room_type_id: room.room_type_id,
              p_dates: dates,
              p_accommodation_id: currentAccommodationId
            }
          );

          const roomTypeName = roomTypes.find(rt => rt.id === room.room_type_id)?.name || "";

          if (inventoryData) {
            for (const item of inventoryData) {
              if (item.is_blocked) {
                allWarnings.push({
                  date: item.date_value,
                  available: 0,
                  blocked: true,
                  blockedBy: item.blocked_by_room_name,
                  roomTypeName,
                });
              } else if (item.available_rooms < 1) {
                allWarnings.push({
                  date: item.date_value,
                  available: item.available_rooms,
                  roomTypeName,
                });
              }
            }
          }

          // Calculate price
          let total = 0;
          for (const dateStr of dates) {
            const { data: priceData } = await supabase
              .from("room_inventory_pricing")
              .select("price")
              .eq("room_type_id", room.room_type_id)
              .eq("date", dateStr)
              .maybeSingle();
            
            if (priceData?.price) {
              total += priceData.price;
            }
          }
          newPrices.set(room.id, total);
        }

        setRoomPrices(newPrices);
        setInventoryWarnings(allWarnings);
      } finally {
        setIsCheckingInventory(false);
      }
    };

    checkInventoryAndPrice();
  }, [form.check_in_date, form.check_out_date, roomEntries.map(r => r.room_type_id).join(','), currentAccommodationId]);

  // Room entry management
  const addRoomEntry = () => {
    setRoomEntries(prev => [...prev, createRoomEntry()]);
  };

  const removeRoomEntry = (id: string) => {
    if (roomEntries.length <= 1) return;
    setRoomEntries(prev => prev.filter(r => r.id !== id));
    setRoomPrices(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const updateRoomEntry = (id: string, updates: Partial<RoomEntry>) => {
    setRoomEntries(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !currentAccommodationId) {
      toast({ title: "請輸入折扣代碼", variant: "destructive" });
      return;
    }

    setIsValidatingCode(true);
    try {
      const totalRoomPrice = Array.from(roomPrices.values()).reduce((s, p) => s + p, 0);
      const firstRoom = roomEntries.find(r => r.room_type_id);
      
      const { data, error } = await supabase.rpc('validate_discount_code', {
        p_code: discountCode.trim().toUpperCase(),
        p_accommodation_id: currentAccommodationId,
        p_order_amount: totalRoomPrice,
        p_room_type_id: firstRoom?.room_type_id || null,
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
    const roomTotal = Array.from(roomPrices.values()).reduce((s, p) => s + p, 0);
    const addonTotal = roomEntries.reduce((sum, room) => {
      return sum + room.selected_addons.reduce((s, a) => {
        const addon = addonSettings.find(ad => ad.id === a.addon_id);
        return s + (addon ? addon.price_per_unit * a.quantity : 0);
      }, 0);
    }, 0);
    const subtotal = roomTotal + addonTotal;
    const discount = calculateDiscount(subtotal);
    const final_ = Math.max(0, subtotal - discount);
    return { roomTotal, addonTotal, subtotal, discount, final: final_ };
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

    const validRooms = roomEntries.filter(r => r.room_type_id);
    if (validRooms.length === 0) {
      toast({ title: "房型錯誤", description: "請至少選擇一個房型", variant: "destructive" });
      return;
    }
    for (const room of validRooms) {
      if (!room.meal_plan) {
        const name = roomTypes.find(rt => rt.id === room.room_type_id)?.name || "";
        toast({ title: "專案錯誤", description: `請為 ${name} 選擇專案`, variant: "destructive" });
        return;
      }
    }
    if (!currentAccommodationId) {
      toast({ title: "系統錯誤", description: "無法取得住宿資訊", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const totals = getTotals();
      const isMultiRoom = validRooms.length > 1;
      const createdOrderIds: string[] = [];
      const createdOrderNumbers: string[] = [];

      for (let i = 0; i < validRooms.length; i++) {
        const room = validRooms[i];
        const roomPrice = roomPrices.get(room.id) || 0;
        const roomAddonTotal = room.selected_addons.reduce((sum, a) => {
          const addon = addonSettings.find(ad => ad.id === a.addon_id);
          return sum + (addon ? addon.price_per_unit * a.quantity : 0);
        }, 0);
        const roomSubtotal = roomPrice + roomAddonTotal;

        // For multi-room: distribute discount proportionally
        let roomDiscount = 0;
        if (appliedDiscount && totals.subtotal > 0) {
          roomDiscount = Math.round(totals.discount * (roomSubtotal / totals.subtotal));
        }
        const roomFinal = Math.max(0, roomSubtotal - roomDiscount);
        const depositAmount = Math.round(roomFinal * 0.3);
        const balanceAmount = roomFinal - depositAmount;

        let paymentStatus = "unpaid";
        let paidAmount = 0;
        if (form.deposit_paid && form.balance_paid) {
          paymentStatus = "paid";
          paidAmount = roomFinal;
        } else if (form.deposit_paid) {
          paymentStatus = "deposit_paid";
          paidAmount = depositAmount;
        }

        const { data: orderNumber, error: orderNumberError } = await supabase.rpc('generate_order_number');
        if (orderNumberError) throw orderNumberError;

        const roomTypeName = roomTypes.find(rt => rt.id === room.room_type_id)?.name || "";
        const multiRoomNote = isMultiRoom 
          ? `【聯合訂單 ${i + 1}/${validRooms.length}】${roomTypeName}\n` 
          : "";
        const notesText = `${multiRoomNote}${form.notes.trim()}`.trim() || null;

        const { data: orderData, error } = await supabase.from("orders").insert({
          accommodation_id: currentAccommodationId,
          order_number: orderNumber,
          guest_name: form.guest_name.trim(),
          guest_phone: form.guest_phone.trim(),
          guest_email: form.guest_email.trim() || null,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          room_type_id: room.room_type_id,
          guest_count: room.guest_count,
          order_status: form.order_status,
          payment_status: paymentStatus,
          deposit_payment_method: form.deposit_payment_method || null,
          balance_payment_method: form.balance_payment_method || null,
          deposit_amount: depositAmount,
          paid_amount: paidAmount,
          notes: notesText,
          total_price: roomPrice + roomAddonTotal,
          discount_amount: roomDiscount,
          final_price: roomFinal,
          discount_code: appliedDiscount?.code || null,
          meal_plan: room.meal_plan || null,
          meal_plan_details: room.selected_addons.length > 0 ? room.selected_addons : null,
          confirmed_at: form.order_status === "confirmed" ? new Date().toISOString() : null,
          order_source: form.order_source || "manual",
        }).select('id').single();

        if (error) throw error;
        if (orderData?.id) createdOrderIds.push(orderData.id);
        createdOrderNumbers.push(orderNumber);

        // KOL Webhook
        if (appliedDiscount && orderData?.id) {
          try {
            await supabase.functions.invoke('kol-webhook', { body: { order_id: orderData.id } });
          } catch { /* ignore */ }
        }
      }

      // Update or create customer record (once)
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
            visit_count: 1,
            first_order_date: form.check_in_date,
          })
          .select("id")
          .single();
        customerId = newCustomer?.id || null;
      }

      // Link all orders to customer
      if (customerId && createdOrderIds.length > 0) {
        await supabase
          .from("orders")
          .update({ customer_id: customerId })
          .in("id", createdOrderIds);
      }

      // Log the action
      for (let i = 0; i < createdOrderIds.length; i++) {
        await logAction({
          actionType: "create",
          actionCategory: "order",
          entityType: "order",
          entityId: createdOrderIds[i],
          entityName: createdOrderNumbers[i],
          accommodationId: currentAccommodationId,
          details: { guest_name: form.guest_name, check_in: form.check_in_date, check_out: form.check_out_date }
        });
      }

      toast({
        title: "新增成功",
        description: isMultiRoom 
          ? `已建立 ${validRooms.length} 筆訂單：${createdOrderNumbers.join("、")}` 
          : `訂單 ${createdOrderNumbers[0]} 已建立`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating order:", error);
      toast({ title: "新增失敗", description: "無法建立訂單，請稍後再試", variant: "destructive" });
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

      {/* Room Entries */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">房型選擇</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRoomEntry}
            className="h-8 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            新增房型
          </Button>
        </div>

        {roomEntries.map((room, index) => {
          const roomPrice = roomPrices.get(room.id) || 0;
          const roomTypeName = roomTypes.find(rt => rt.id === room.room_type_id)?.name;

          return (
            <div key={room.id} className="p-3 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">房型 {index + 1}</span>
                {roomEntries.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRoomEntry(room.id)}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">房型 <span className="text-destructive">*</span></Label>
                  <Select
                    value={room.room_type_id}
                    onValueChange={(value) => updateRoomEntry(room.id, { room_type_id: value })}
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
                    value={room.guest_count}
                    onChange={(e) => updateRoomEntry(room.id, { guest_count: parseInt(e.target.value) || 1 })}
                    className="h-10 text-sm"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">專案 <span className="text-destructive">*</span></Label>
                <Select
                  value={room.meal_plan}
                  onValueChange={(value) => updateRoomEntry(room.id, { meal_plan: value })}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="選擇專案" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2_meals">一泊二食</SelectItem>
                    <SelectItem value="3_meals">一泊三食</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Addons per room */}
              {addonSettings.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">加購方案</Label>
                  {addonSettings.map((addon) => {
                    const selectedAddon = room.selected_addons.find(a => a.addon_id === addon.id);
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
                                ? room.selected_addons.filter(a => a.addon_id !== addon.id)
                                : room.selected_addons.map(a => 
                                    a.addon_id === addon.id ? { ...a, quantity: a.quantity - 1 } : a
                                  );
                              updateRoomEntry(room.id, { selected_addons: newAddons });
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
                                const existingIndex = room.selected_addons.findIndex(a => a.addon_id === addon.id);
                                const newAddons = existingIndex >= 0
                                  ? room.selected_addons.map(a => 
                                      a.addon_id === addon.id ? { ...a, quantity: a.quantity + 1 } : a
                                    )
                                  : [...room.selected_addons, { addon_id: addon.id, quantity: 1 }];
                                updateRoomEntry(room.id, { selected_addons: newAddons });
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
          );
        })}
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
            {roomEntries.filter(r => r.room_type_id).length > 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">房型數量</span>
                <span>{roomEntries.filter(r => r.room_type_id).length} 間</span>
              </div>
            )}
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
            {roomEntries.filter(r => r.room_type_id).length > 1 && (
              <div className="text-xs text-muted-foreground mt-1">
                ※ 將建立 {roomEntries.filter(r => r.room_type_id).length} 筆獨立訂單
              </div>
            )}
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
                  {warning.roomTypeName && <span className="font-medium">[{warning.roomTypeName}] </span>}
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
              <SelectItem value="checked_in">已入住</SelectItem>
              <SelectItem value="checked_out">已退房</SelectItem>
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
          roomEntries.filter(r => r.room_type_id).length > 1 
            ? `建立 ${roomEntries.filter(r => r.room_type_id).length} 筆訂單` 
            : "建立訂單"
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
