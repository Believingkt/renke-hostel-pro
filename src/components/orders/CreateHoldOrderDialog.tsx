import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, AlertTriangle, Plus, Trash2, Minus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO, isAfter, isBefore, addMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAuditLog } from "@/hooks/use-audit-log";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RoomType {
  id: string;
  name: string;
  is_exclusive_package?: boolean;
}

interface ExtraSelection {
  id: string;
  room_type_id: string;
  quantity: number;
}

interface CreateHoldOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const YUNXIU_ACC_ID = "7690a606-6bac-4cd5-a3e7-2fa754b318e8";
const TIANSONG_ACC_ID = "4ee31aca-5641-4d05-80e2-1c67626be83d";
const AUTO_ASSIGN_ACC_IDS = new Set([YUNXIU_ACC_ID, TIANSONG_ACC_ID]);

export function CreateHoldOrderDialog({ open, onOpenChange, onSuccess }: CreateHoldOrderDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const { logAction } = useAuditLog();
  const isYunxiu = currentAccommodationId === YUNXIU_ACC_ID;
  const [isSaving, setIsSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [inventoryWarnings, setInventoryWarnings] = useState<{ roomName: string; date: string; available: number; blocked?: boolean; blockedBy?: string }[]>([]);
  const [isCheckingInventory, setIsCheckingInventory] = useState(false);
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [extraSelections, setExtraSelections] = useState<ExtraSelection[]>([]);

  const [form, setForm] = useState({
    check_in_date: "",
    check_out_date: "",
    room_type_id: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({ check_in_date: "", check_out_date: "", room_type_id: "", notes: "" });
      setInventoryWarnings([]);
      setUnavailableDates(new Set());
      setExtraSelections([]);
    }
  }, [open]);

  useEffect(() => {
    const fetchRoomTypes = async () => {
      if (!currentAccommodationId) return;
      const { data } = await supabase
        .from("room_types")
        .select("id, name, is_exclusive_package")
        .eq("accommodation_id", currentAccommodationId)
        .order("display_order");
      if (data) setRoomTypes(data);
    };
    fetchRoomTypes();
  }, [currentAccommodationId]);

  // Fetch unavailable dates when primary room type changes
  const fetchUnavailableDates = useCallback(async (roomTypeId: string) => {
    if (!roomTypeId || !currentAccommodationId) {
      setUnavailableDates(new Set());
      return;
    }

    setIsLoadingAvailability(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = addMonths(today, 6);

      const dates: string[] = [];
      const current = new Date(today);
      while (current <= endDate) {
        dates.push(format(current, "yyyy-MM-dd"));
        current.setDate(current.getDate() + 1);
      }

      const { data: inventoryData } = await supabase.rpc(
        'get_adjusted_room_inventory_batch',
        {
          p_room_type_id: roomTypeId,
          p_dates: dates,
          p_accommodation_id: currentAccommodationId,
        }
      );

      const blocked = new Set<string>();
      if (inventoryData) {
        for (const item of inventoryData) {
          if (item.is_blocked || item.available_rooms < 1) {
            blocked.add(item.date_value);
          }
        }
      }
      setUnavailableDates(blocked);
    } catch (err) {
      console.error("Error fetching availability:", err);
    } finally {
      setIsLoadingAvailability(false);
    }
  }, [currentAccommodationId]);

  useEffect(() => {
    fetchUnavailableDates(form.room_type_id);
  }, [form.room_type_id, fetchUnavailableDates]);

  // Aggregate all selections (primary + extras) → required count per room_type
  const allSelectionsKey = `${form.room_type_id}|${extraSelections.map(s => `${s.room_type_id}:${s.quantity}`).join(',')}`;

  // Check inventory when dates/rooms change (for warning display)
  useEffect(() => {
    const checkInventory = async () => {
      if (!form.room_type_id || !form.check_in_date || !form.check_out_date || !currentAccommodationId) {
        setInventoryWarnings([]);
        return;
      }

      setIsCheckingInventory(true);
      try {
        const start = new Date(form.check_in_date);
        const end = new Date(form.check_out_date);
        const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
        if (nights <= 0) return;

        const dates: string[] = [];
        for (let i = 0; i < nights; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          dates.push(format(d, "yyyy-MM-dd"));
        }

        // Build required-quantity map by room_type
        const requiredByRoom = new Map<string, number>();
        requiredByRoom.set(form.room_type_id, 1);
        for (const ex of extraSelections) {
          if (!ex.room_type_id) continue;
          requiredByRoom.set(ex.room_type_id, (requiredByRoom.get(ex.room_type_id) || 0) + ex.quantity);
        }

        const warnings: { roomName: string; date: string; available: number; blocked?: boolean; blockedBy?: string }[] = [];

        for (const [rtId, needed] of requiredByRoom.entries()) {
          const roomName = roomTypes.find(r => r.id === rtId)?.name || "房型";
          const { data: inventoryData } = await supabase.rpc(
            'get_adjusted_room_inventory_batch',
            {
              p_room_type_id: rtId,
              p_dates: dates,
              p_accommodation_id: currentAccommodationId,
            }
          );

          if (inventoryData) {
            for (const item of inventoryData) {
              if (item.is_blocked) {
                warnings.push({ roomName, date: item.date_value, available: 0, blocked: true, blockedBy: item.blocked_by_room_name });
              } else if (item.available_rooms < needed) {
                warnings.push({ roomName, date: item.date_value, available: item.available_rooms });
              }
            }
          }
        }
        setInventoryWarnings(warnings);
      } finally {
        setIsCheckingInventory(false);
      }
    };
    checkInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.check_in_date, form.check_out_date, allSelectionsKey, currentAccommodationId, roomTypes]);

  const addExtraSelection = useCallback((preferExclusive: boolean) => {
    const exclusive = roomTypes.filter(r => r.is_exclusive_package);
    const normal = roomTypes.filter(r => !r.is_exclusive_package);
    const usedIds = new Set<string>([form.room_type_id, ...extraSelections.map(s => s.room_type_id)]);
    let chosen: RoomType | undefined;
    if (preferExclusive) {
      chosen = exclusive.find(r => !usedIds.has(r.id)) || exclusive[0];
    } else {
      chosen = normal.find(r => !usedIds.has(r.id)) || normal[0];
    }
    if (!chosen) {
      toast({ title: "已沒有可加的房型", variant: "destructive" });
      return;
    }
    setExtraSelections(prev => [...prev, {
      id: crypto.randomUUID(),
      room_type_id: chosen!.id,
      quantity: 1,
    }]);
  }, [roomTypes, form.room_type_id, extraSelections, toast]);

  const updateExtraSelection = useCallback((selId: string, updates: Partial<ExtraSelection>) => {
    setExtraSelections(prev => prev.map(s => {
      if (s.id !== selId) return s;
      const merged = { ...s, ...updates };
      const rt = roomTypes.find(r => r.id === merged.room_type_id);
      if (rt?.is_exclusive_package) merged.quantity = 1;
      return merged;
    }));
  }, [roomTypes]);

  const removeExtraSelection = useCallback((selId: string) => {
    setExtraSelections(prev => prev.filter(s => s.id !== selId));
  }, []);

  const handleSave = async () => {
    if (!form.check_in_date || !form.check_out_date) {
      toast({ title: "請選擇入住和退房日期", variant: "destructive" });
      return;
    }
    if (!isAfter(parseISO(form.check_out_date), parseISO(form.check_in_date))) {
      toast({ title: "退房日期必須在入住日期之後", variant: "destructive" });
      return;
    }
    if (!form.room_type_id) {
      toast({ title: "請選擇房型", variant: "destructive" });
      return;
    }
    if (!currentAccommodationId) return;

    setIsSaving(true);
    try {
      const { data: orderNumber, error: numErr } = await supabase.rpc('generate_order_number');
      if (numErr) throw numErr;

      const { data: orderData, error } = await supabase.from("orders").insert({
        accommodation_id: currentAccommodationId,
        order_number: orderNumber,
        guest_name: "保留單",
        guest_phone: "00000000",
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        room_type_id: form.room_type_id,
        guest_count: 1,
        order_status: "hold",
        payment_status: "unpaid",
        total_price: 0,
        discount_amount: 0,
        final_price: 0,
        notes: form.notes.trim() || "【保留單】待補客人資訊",
        order_source: "manual",
      }).select('id').single();

      if (error) throw error;

      // 同步寫入 order_rooms — 主房型 + 額外加房（雲岫專屬）
      if (orderData?.id) {
        let orderRooms: {
          order_id: string;
          room_type_id: string;
          quantity: number;
          room_price: number;
          template_name: string | null;
          room_unit_id: string | null;
        }[] = [
          {
            order_id: orderData.id,
            room_type_id: form.room_type_id,
            quantity: 1,
            room_price: 0,
            template_name: null,
            room_unit_id: null,
          },
          ...extraSelections.map(ex => ({
            order_id: orderData.id,
            room_type_id: ex.room_type_id,
            quantity: ex.quantity,
            room_price: 0,
            template_name: null,
            room_unit_id: null,
          })),
        ];

        // 雲岫 / 天送：未指定房號時自動依序指派可用房號（含多件數，拆成多筆 quantity=1）
        if (AUTO_ASSIGN_ACC_IDS.has(currentAccommodationId)) {
          try {
            // 將 quantity>1 的列拆成多筆 quantity=1，以便逐間指派 room_unit_id
            const expanded: typeof orderRooms = [];
            for (const r of orderRooms) {
              if (r.quantity > 1 && !r.room_unit_id) {
                for (let i = 0; i < r.quantity; i++) {
                  expanded.push({ ...r, quantity: 1 });
                }
              } else {
                expanded.push(r);
              }
            }
            orderRooms = expanded;

            const roomTypeIds = Array.from(new Set(orderRooms.map(r => r.room_type_id)));
            if (roomTypeIds.length > 0) {
              const { data: unitsData } = await supabase
                .from("room_units" as any)
                .select("id, room_type_id, display_order")
                .in("room_type_id", roomTypeIds)
                .eq("is_active", true)
                .order("display_order", { ascending: true });

              const { data: occupiedData } = await supabase
                .from("order_rooms" as any)
                .select("room_unit_id, orders!inner(order_status, check_in_date, check_out_date)")
                .not("room_unit_id", "is", null)
                .in("orders.order_status", ["confirmed", "hold", "pending"])
                .lt("orders.check_in_date", form.check_out_date)
                .gt("orders.check_out_date", form.check_in_date);

              const occupied = new Set<string>((occupiedData as any[] || []).map(r => r.room_unit_id));
              const usedThisOrder = new Set<string>();

              const unitsByType = new Map<string, { id: string; room_type_id: string }[]>();
              for (const u of (unitsData as any[] || [])) {
                if (!unitsByType.has(u.room_type_id)) unitsByType.set(u.room_type_id, []);
                unitsByType.get(u.room_type_id)!.push(u);
              }

              for (const r of orderRooms) {
                if (r.room_unit_id || r.quantity !== 1) continue;
                const candidates = unitsByType.get(r.room_type_id) || [];
                const pick = candidates.find(c => !occupied.has(c.id) && !usedThisOrder.has(c.id));
                if (pick) {
                  r.room_unit_id = pick.id;
                  usedThisOrder.add(pick.id);
                }
              }
            }
          } catch (assignErr) {
            console.warn("[CreateHoldOrderDialog] auto-assign room_unit failed:", assignErr);
          }
        }

        const { error: roomsError } = await supabase.from("order_rooms").insert(orderRooms);
        if (roomsError) console.error("[CreateHoldOrderDialog] order_rooms insert failed:", roomsError);
      }

      await logAction({
        actionType: "create",
        actionCategory: "order",
        entityType: "order",
        entityId: orderData?.id || "",
        entityName: orderNumber,
        accommodationId: currentAccommodationId,
        details: {
          type: "hold",
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          extra_rooms: extraSelections.length,
        },
      });

      const totalRooms = 1 + extraSelections.reduce((s, e) => s + e.quantity, 0);
      toast({
        title: "保留單建立成功",
        description: `已為 ${form.check_in_date} ~ ${form.check_out_date} 建立保留單${totalRooms > 1 ? `（共 ${totalRooms} 間/棟）` : ""}`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating hold order:", error);
      toast({ title: "建立失敗", description: "無法建立保留單", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const isDateUnavailable = useCallback((date: Date) => {
    return unavailableDates.has(format(date, "yyyy-MM-dd"));
  }, [unavailableDates]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hasNormal = roomTypes.some(r => !r.is_exclusive_package);
  const hasExclusive = roomTypes.some(r => r.is_exclusive_package);

  const formContent = (
    <div className="space-y-4 py-4">
      {/* Room type first */}
      <div className="space-y-2">
        <Label>房型 <span className="text-destructive">*</span></Label>
        <Select value={form.room_type_id} onValueChange={(v) => setForm({ ...form, room_type_id: v, check_in_date: "", check_out_date: "" })}>
          <SelectTrigger className="h-12 sm:h-10">
            <SelectValue placeholder="選擇房型" />
          </SelectTrigger>
          <SelectContent>
            {roomTypes.map((rt) => (
              <SelectItem key={rt.id} value={rt.id}>
                {rt.is_exclusive_package ? "【包棟】" : ""}{rt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoadingAvailability && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入可預訂日期中...
        </div>
      )}

      {/* Dates - only enabled after room type selected */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>入住日期 <span className="text-destructive">*</span></Label>
          <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={!form.room_type_id || isLoadingAvailability}
                className={cn(
                  "w-full justify-start text-left font-normal h-12 sm:h-10",
                  form.check_in_date
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : ""
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
                      setForm({ ...form, check_in_date: newCheckIn, check_out_date: "" });
                    } else {
                      setForm({ ...form, check_in_date: newCheckIn });
                    }
                    setCheckInOpen(false);
                    setTimeout(() => setCheckOutOpen(true), 150);
                  }
                }}
                disabled={(date) => isBefore(date, today) || isDateUnavailable(date)}
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
                disabled={!form.room_type_id || isLoadingAvailability}
                className={cn(
                  "w-full justify-start text-left font-normal h-12 sm:h-10",
                  form.check_out_date
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : ""
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
                    setForm({ ...form, check_out_date: format(date, "yyyy-MM-dd") });
                    setCheckOutOpen(false);
                  }
                }}
                disabled={(date) => {
                  if (form.check_in_date) {
                    const checkIn = parseISO(form.check_in_date);
                    return isBefore(date, checkIn) || date.getTime() === checkIn.getTime();
                  }
                  return isBefore(date, today);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {!form.room_type_id && (
        <p className="text-sm text-muted-foreground">請先選擇房型，系統會自動顯示可預訂的日期</p>
      )}

      {/* 雲岫專屬：額外加房 */}
      {isYunxiu && form.room_type_id && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">額外加房（雲岫專屬）</Label>
            <div className="flex gap-2">
              {hasNormal && (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => addExtraSelection(false)}>
                  <Plus className="h-3.5 w-3.5" />散客房
                </Button>
              )}
              {hasExclusive && (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => addExtraSelection(true)}>
                  <Plus className="h-3.5 w-3.5" />包棟
                </Button>
              )}
            </div>
          </div>

          {extraSelections.length > 0 && (
            <div className="space-y-2">
              {extraSelections.map((sel, idx) => {
                const rt = roomTypes.find(r => r.id === sel.room_type_id);
                const isExc = !!rt?.is_exclusive_package;
                return (
                  <div key={sel.id} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {isExc ? "包棟" : "散客房"} #{idx + 1}
                      </span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeExtraSelection(sel.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">房型</Label>
                        <Select value={sel.room_type_id} onValueChange={(v) => updateExtraSelection(sel.id, { room_type_id: v })}>
                          <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {roomTypes.map(r => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.is_exclusive_package ? "【包棟】" : ""}{r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!isExc && (
                        <div className="space-y-1">
                          <Label className="text-xs">間數</Label>
                          <div className="flex items-center gap-1.5">
                            <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" disabled={sel.quantity <= 1} onClick={() => updateExtraSelection(sel.id, { quantity: sel.quantity - 1 })}>
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{sel.quantity}</span>
                            <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => updateExtraSelection(sel.id, { quantity: sel.quantity + 1 })}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isCheckingInventory && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          檢查庫存中...
        </div>
      )}

      {inventoryWarnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            以下日期庫存不足：
            {inventoryWarnings.map((w, i) => (
              <div key={`${w.roomName}-${w.date}-${i}`}>
                {w.roomName} {w.date} - {w.blocked ? `被 ${w.blockedBy} 鎖定` : `剩餘 ${w.available} 間`}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>備註</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="可記錄保留原因等資訊"
          className="min-h-[80px]"
        />
      </div>

      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-700">
        💡 保留單會佔用庫存但不需要填寫客人資訊。之後可透過「編輯訂單」補填客人資訊並將狀態改為「已確認」。
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>新增保留單</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="max-h-[70vh] px-4">
            {formContent}
          </ScrollArea>
          <DrawerFooter>
            <Button onClick={handleSave} disabled={isSaving} className="w-full h-12">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              建立保留單
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full h-12">
              取消
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增保留單</DialogTitle>
        </DialogHeader>
        {formContent}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            建立保留單
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
