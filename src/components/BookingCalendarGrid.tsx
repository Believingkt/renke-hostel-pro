import { useState, useEffect, useMemo, useRef } from "react";
import { format, addDays, subDays, isToday, isWeekend, parseISO, differenceInDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Lock, Package, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BookingCalendarGridProps {
  accommodationId: string;
}

interface RoomType {
  id: string;
  name: string;
  room_count: number | null;
  is_exclusive_package: boolean;
  is_bound_to_exclusive: boolean;
  bound_exclusive_ids: string[] | null;
}

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  order_source: string;
  room_type_id: string;
  notes: string | null;
}

interface OrderRoom {
  id: string;
  order_id: string;
  room_type_id: string;
  quantity: number;
}

// A virtual entry representing one room slot on the calendar
interface CalendarEntry {
  id: string;
  orderId: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  order_source: string;
  room_type_id: string;
  notes: string | null;
}

interface PublicHoliday {
  holiday_date: string;
  holiday_name: string;
  holiday_type: string;
}

interface InventoryRecord {
  date: string;
  room_type_id: string;
  available_rooms: number;
  is_available: boolean | null;
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const SOURCE_ICONS: Record<string, string> = {
  website: "🌐",
  manual: "📋",
  line: "💬",
  agoda: "🅰️",
  booking: "📘",
  trip: "✈️",
  travel_agency: "🏢",
  kol: "💗",
  points_starchain: "⭐",
  official_use: "🏛️",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "官網訂房",
  manual: "現場訂房",
  line: "Line@",
  agoda: "Agoda",
  booking: "Booking",
  trip: "Trip",
   travel_agency: "旅行社",
   kol: "KOL互惠",
   points_starchain: "星鏈會員",
   official_use: "公務使用",
};

const getSourceLabel = (source: string, paymentMethod?: string) => {
  if (source === "manual" && paymentMethod) {
    return `手動訂單(${paymentMethod})`;
  }
  return SOURCE_LABELS[source] || source || "官網訂房";
};

export function BookingCalendarGrid({ accommodationId }: BookingCalendarGridProps) {
  const navigate = useNavigate();
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef(false);
  const [startDate, setStartDate] = useState(() => {
    const saved = sessionStorage.getItem('bookingCalendar_startDate');
    if (saved) {
      const d = new Date(saved);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [dayCount, setDayCount] = useState(() => {
    const saved = sessionStorage.getItem('bookingCalendar_dayCount');
    return saved ? Number(saved) || 7 : 7;
  });

  // Persist startDate and dayCount to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('bookingCalendar_startDate', startDate.toISOString());
  }, [startDate]);

  useEffect(() => {
    sessionStorage.setItem('bookingCalendar_dayCount', String(dayCount));
  }, [dayCount]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderRooms, setOrderRooms] = useState<OrderRoom[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [holidays, setHolidays] = useState<Map<string, PublicHoliday>>(new Map());
  const [inventory, setInventory] = useState<Map<string, InventoryRecord>>(new Map());
  const [expandedRoomTypes, setExpandedRoomTypes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Generate date columns
  const dates = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(startDate, i));
  }, [startDate, dayCount]);

  const dateStrings = useMemo(() => dates.map(d => format(d, "yyyy-MM-dd")), [dates]);

  // Load data
  useEffect(() => {
    if (!accommodationId) return;
    loadData();
  }, [accommodationId, startDate, dayCount]);

  // Auto-expand all room types on first load
  useEffect(() => {
    if (roomTypes.length > 0 && expandedRoomTypes.size === 0) {
      setExpandedRoomTypes(new Set(roomTypes.map(r => r.id)));
    }
  }, [roomTypes]);

  const loadData = async () => {
    try {
      setLoading(true);
      const endDate = addDays(startDate, dayCount - 1);
      const startStr = format(startDate, "yyyy-MM-dd");
      const endStr = format(endDate, "yyyy-MM-dd");

      const [roomTypesRes, ordersRes, holidaysRes, inventoryRes] = await Promise.all([
        supabase
          .from("room_types")
          .select("id, name, room_count, is_exclusive_package, is_bound_to_exclusive, bound_exclusive_ids")
          .eq("accommodation_id", accommodationId)
          .order("display_order"),
        supabase
          .from("orders")
          .select("id, order_number, guest_name, guest_phone, check_in_date, check_out_date, order_status, order_source, room_type_id, notes")
          .eq("accommodation_id", accommodationId)
          .in("order_status", ["hold", "pending", "confirmed", "checked_in"])
          .gte("check_out_date", startStr)
          .lte("check_in_date", endStr),
        supabase
          .from("public_holidays")
          .select("holiday_date, holiday_name, holiday_type")
          .eq("accommodation_id", accommodationId)
          .gte("holiday_date", startStr)
          .lte("holiday_date", endStr),
        supabase
          .from("room_inventory_pricing")
          .select("date, room_type_id, available_rooms, is_available")
          .in("room_type_id", (await supabase.from("room_types").select("id").eq("accommodation_id", accommodationId)).data?.map(r => r.id) || [])
          .gte("date", startStr)
          .lte("date", endStr),
      ]);

      if (roomTypesRes.error) throw roomTypesRes.error;
      setRoomTypes(roomTypesRes.data || []);

      const fetchedOrders = ordersRes.data || [];
      setOrders(fetchedOrders);

      // Fetch order_rooms for multi-room orders
      const orderIds = fetchedOrders.map(o => o.id);
      let fetchedOrderRooms: OrderRoom[] = [];
      if (orderIds.length > 0) {
        const { data: orData } = await supabase
          .from("order_rooms")
          .select("id, order_id, room_type_id, quantity")
          .in("order_id", orderIds);
        fetchedOrderRooms = orData || [];
      }
      setOrderRooms(fetchedOrderRooms);

      // Build calendar entries: expand multi-room orders
      const entries: CalendarEntry[] = [];
      const ordersWithRooms = new Set(fetchedOrderRooms.map(or => or.order_id));

      for (const order of fetchedOrders) {
        if (ordersWithRooms.has(order.id)) {
          // Multi-room order: create one entry per quantity per room type
          const rooms = fetchedOrderRooms.filter(or => or.order_id === order.id);
          for (const room of rooms) {
            for (let q = 0; q < room.quantity; q++) {
              entries.push({
                id: `${order.id}_${room.id}_${q}`,
                orderId: order.id,
                order_number: order.order_number,
                guest_name: order.guest_name,
                guest_phone: order.guest_phone,
                check_in_date: order.check_in_date,
                check_out_date: order.check_out_date,
                order_status: order.order_status,
                order_source: order.order_source,
                room_type_id: room.room_type_id,
                notes: order.notes,
              });
            }
          }
        } else {
          // Single-room order: use the order's room_type_id
          entries.push({
            id: order.id,
            orderId: order.id,
            order_number: order.order_number,
            guest_name: order.guest_name,
            guest_phone: order.guest_phone,
            check_in_date: order.check_in_date,
            check_out_date: order.check_out_date,
            order_status: order.order_status,
            order_source: order.order_source,
            room_type_id: order.room_type_id,
            notes: order.notes,
          });
        }
      }
      setCalendarEntries(entries);

      const holidayMap = new Map<string, PublicHoliday>();
      holidaysRes.data?.forEach(h => holidayMap.set(h.holiday_date, h));
      setHolidays(holidayMap);

      const invMap = new Map<string, InventoryRecord>();
      inventoryRes.data?.forEach(inv => {
        invMap.set(`${inv.room_type_id}_${inv.date}`, inv);
      });
      setInventory(invMap);
    } catch (error) {
      console.error("載入資料失敗:", error);
      toast.error("載入資料失敗");
    } finally {
      setLoading(false);
    }
  };

  // Get available rooms for a room type on a date
  const getAvailableRooms = (roomTypeId: string, dateStr: string): number => {
    const inv = inventory.get(`${roomTypeId}_${dateStr}`);
    if (!inv) return 0; // No inventory record = 0
    if (inv.is_available === false) return 0;
    return inv.available_rooms;
  };

  // Get booked count for a room type on a date (using calendar entries for accurate multi-room counting)
  const getBookedCount = (roomTypeId: string, dateStr: string): number => {
    return calendarEntries.filter(e => {
      if (e.room_type_id !== roomTypeId) return false;
      return e.check_in_date <= dateStr && e.check_out_date > dateStr;
    }).length;
  };

  // Check if a date is blocked because an exclusive package is booked
  // Check if ANY exclusive package has a booking on this date (applies to ALL room types)
  const isDateBlockedByAnyExclusive = useMemo(() => {
    const blockedDates = new Set<string>();
    const exclusiveTypes = roomTypes.filter(r => r.is_exclusive_package);
    for (const dateStr of dateStrings) {
      const hasExclusiveBooking = exclusiveTypes.some(et =>
        calendarEntries.some(e => e.room_type_id === et.id && e.check_in_date <= dateStr && e.check_out_date > dateStr)
      );
      if (hasExclusiveBooking) blockedDates.add(dateStr);
    }
    return blockedDates;
  }, [roomTypes, calendarEntries, dateStrings]);

  const isBlockedByExclusive = (_roomTypeId: string, dateStr: string): boolean => {
    return isDateBlockedByAnyExclusive.has(dateStr);
  };

  // Get the set of dates where an exclusive package room type has bookings
  const exclusiveBookedDates = useMemo(() => {
    const map = new Map<string, Set<string>>(); // exclusiveRoomTypeId -> Set of dateStrings
    const exclusiveTypes = roomTypes.filter(r => r.is_exclusive_package);
    for (const et of exclusiveTypes) {
      const bookedDates = new Set<string>();
      for (const dateStr of dateStrings) {
        const hasBooking = calendarEntries.some(e => e.room_type_id === et.id && e.check_in_date <= dateStr && e.check_out_date > dateStr);
        if (hasBooking) bookedDates.add(dateStr);
      }
      if (bookedDates.size > 0) map.set(et.id, bookedDates);
    }
    return map;
  }, [roomTypes, calendarEntries, dateStrings]);
  const toggleRoomType = (id: string) => {
    setExpandedRoomTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setStartDate(today);
  };

  const goPrev = () => setStartDate(prev => subDays(prev, dayCount));
  const goNext = () => setStartDate(prev => addDays(prev, dayCount));

  // Column width – responsive: measure container and distribute evenly
  const LEFT_COL_WIDTH = 200;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const DAY_COL_MIN_WIDTH = (() => {
    if (containerWidth > 0) {
      const available = containerWidth - LEFT_COL_WIDTH;
      const natural = Math.floor(available / dayCount);
      // Floor: never go below 48px per cell
      return Math.max(natural, 48);
    }
    // Fallback before measurement
    return dayCount <= 7 ? 120 : dayCount <= 15 ? 80 : 48;
  })();
  const GRID_MIN_WIDTH = LEFT_COL_WIDTH + DAY_COL_MIN_WIDTH * dayCount;

  const syncHorizontalScroll = (source: "header" | "body") => {
    if (isSyncingScrollRef.current) return;

    const sourceEl = source === "header" ? headerScrollRef.current : bodyScrollRef.current;
    const targetEl = source === "header" ? bodyScrollRef.current : headerScrollRef.current;

    if (!sourceEl || !targetEl) return;

    isSyncingScrollRef.current = true;
    targetEl.scrollLeft = sourceEl.scrollLeft;

    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  if (loading && roomTypes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (roomTypes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
        <div className="text-center space-y-2">
          <Package className="h-16 w-16 mx-auto opacity-20" />
          <p className="text-lg font-medium">尚無房型資料</p>
          <p className="text-sm">請先前往房型管理新增房型</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={goToToday} className="h-9">
          今日
        </Button>
        <div className="flex items-center border rounded-md">
          <Button variant="ghost" size="sm" onClick={goPrev} className="h-9 px-2">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 px-3 min-w-[120px] font-medium">
                {format(startDate, "yyyy/MM/dd")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  if (date) {
                    date.setHours(0, 0, 0, 0);
                    setStartDate(date);
                  }
                }}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={goNext} className="h-9 px-2">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center border rounded-md overflow-hidden">
          {[3, 7, 15, 30].map(d => (
            <Button
              key={d}
              variant={dayCount === d ? "default" : "ghost"}
              size="sm"
              onClick={() => setDayCount(d)}
              className={cn("h-9 rounded-none px-3", dayCount === d && "bg-foreground text-background hover:bg-foreground/90")}
            >
              {d} 天
            </Button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div ref={containerRef} className="border rounded-lg bg-card relative">
        <div className="sticky top-0 z-40 border-b bg-card shadow-sm">
          <div
            ref={headerScrollRef}
            onScroll={() => syncHorizontalScroll("header")}
            className="overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain]"
          >
            <div style={{ minWidth: GRID_MIN_WIDTH }}>
              <div className="flex border-b bg-card">
                <div
                  className="shrink-0 border-r sticky left-0 bg-card z-30"
                  style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                />
                <div className="flex-1 text-center text-sm font-semibold py-1 text-muted-foreground">
                  {format(dates[Math.floor(dates.length / 2)], "yyyy/MM")}
                </div>
              </div>

              <div className="flex bg-muted/30">
                <div
                  className="shrink-0 border-r p-2 flex items-center font-medium text-sm text-muted-foreground sticky left-0 bg-background z-30"
                  style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  客房類別
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="flex">
                    {dates.map((date, i) => {
                      const dateStr = dateStrings[i];
                      const holiday = holidays.get(dateStr);
                      const dayOfWeek = date.getDay();
                      const isSat = dayOfWeek === 6;
                      const isSun = dayOfWeek === 0;
                      const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                      const isWorkOnWeekend = holiday?.holiday_type === "work_on_weekend";
                      const isRed = (isSat || isSun || isHoliday) && !isWorkOnWeekend;

                      return (
                        <div
                          key={dateStr}
                          className={cn(
                            "flex-1 text-center py-2 border-r last:border-r-0 text-sm",
                            isToday(date) && "bg-primary/10 font-bold",
                            isRed && "text-destructive",
                          )}
                          style={{ minWidth: DAY_COL_MIN_WIDTH }}
                        >
                          <span>{DAY_LABELS[dayOfWeek]} {date.getDate()}</span>
                          {holiday && (
                            <span className={cn(
                              "ml-1 text-xs px-1 rounded",
                              isHoliday ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                            )}>
                              {holiday.holiday_name.length > 2 ? holiday.holiday_name.slice(0, 2) : holiday.holiday_name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          ref={bodyScrollRef}
          onScroll={() => syncHorizontalScroll("body")}
          className="overflow-x-auto overflow-y-visible [overscroll-behavior-x:contain]"
        >
          <div style={{ minWidth: GRID_MIN_WIDTH }}>
            {/* Room type rows */}
          {roomTypes.map(roomType => {
            const isExpanded = expandedRoomTypes.has(roomType.id);
            const roomCount = roomType.room_count || 0;

            // Get all calendar entries for this room type in the date range
            const rtEntries = calendarEntries.filter(e => e.room_type_id === roomType.id);

            return (
              <div key={roomType.id}>
                {/* Room type header row - shows available rooms */}
                <div className="flex border-b hover:bg-muted/20">
                  <div
                    className="shrink-0 border-r p-2 flex items-center gap-1 cursor-pointer sticky left-0 bg-card z-20 hover:bg-muted/50"
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    onClick={() => toggleRoomType(roomType.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm truncate">{roomType.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{roomCount > 0 ? `${roomCount}${roomType.is_exclusive_package ? '棟' : '間'}` : ""}</span>
                  </div>
                  {/* Available rooms per date */}
                  <div className="flex flex-1">
                    {dates.map((date, i) => {
                      const dateStr = dateStrings[i];
                      const available = getAvailableRooms(roomType.id, dateStr);
                      const booked = getBookedCount(roomType.id, dateStr);
                      const remaining = Math.max(0, available - booked);
                      const isSoldOut = available > 0 && remaining === 0;
                      const noInventory = available === 0;
                      const blockedByExclusive = isBlockedByExclusive(roomType.id, dateStr);
                      const holiday = holidays.get(dateStr);
                      const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                      const isSatSun = isWeekend(date);
                      const isRedDay = (isSatSun || isHoliday) && holiday?.holiday_type !== "work_on_weekend";

                      return (
                        <div
                          key={dateStr}
                          className={cn(
                            "flex-1 border-r last:border-r-0 p-2 text-center text-sm",
                            isRedDay && "bg-destructive/5",
                            isToday(date) && "bg-primary/5",
                          )}
                          style={{
                            minWidth: DAY_COL_MIN_WIDTH,
                            ...(blockedByExclusive
                              ? {
                                  backgroundColor: "hsl(var(--muted) / 0.28)",
                                  backgroundImage:
                                    "repeating-linear-gradient(-45deg, transparent, transparent 6px, hsl(var(--border) / 0.8) 6px, hsl(var(--border) / 0.8) 8px)",
                                }
                              : {}),
                          }}
                        >
                          {blockedByExclusive ? (
                            <span className="flex items-center justify-center gap-0.5 text-muted-foreground">
                              <Lock className="h-3 w-3" /> 0
                            </span>
                          ) : noInventory ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : isSoldOut ? (
                            <span className="flex items-center justify-center gap-0.5 text-muted-foreground">
                              <Lock className="h-3 w-3" /> 0
                            </span>
                          ) : (
                            <span className={cn(
                              "font-medium",
                              remaining === 0 ? "text-destructive" : remaining <= 1 && available > 1 ? "text-orange-500" : "text-foreground"
                            )}>
                              {remaining}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded: show order rows */}
                {isExpanded && (
                  <>

                    {/* Individual booking rows - group orders into "rooms" */}
                    {(() => {
                      const roomSlots: CalendarEntry[][] = [];
                      const sortedEntries = [...rtEntries].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
                      
                      sortedEntries.forEach(entry => {
                        let placed = false;
                        for (const slot of roomSlots) {
                          const lastEntry = slot[slot.length - 1];
                          if (lastEntry.check_out_date <= entry.check_in_date) {
                            slot.push(entry);
                            placed = true;
                            break;
                          }
                        }
                        if (!placed) {
                          roomSlots.push([entry]);
                        }
                      });

                      const minRows = Math.max(roomCount, roomSlots.length, 1);

                      const slotRows = Array.from({ length: minRows }, (_, slotIdx) => {
                        const slotEntries = roomSlots[slotIdx] || [];
                        
                        return (
                          <div key={slotIdx} className="flex border-b last:border-b-0">
                            <div
                              className="shrink-0 border-r p-2 pl-8 text-sm flex items-center gap-1 sticky left-0 bg-card z-20"
                              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                            >
                              <span className="text-muted-foreground">
                                {roomCount > 0 ? `${slotIdx + 1}` : `#${slotIdx + 1}`}
                              </span>
                            </div>
                            <div className="flex flex-1 relative" style={{ minHeight: 48 }}>
                              {/* Background date cells */}
                              {dates.map((date, i) => {
                                const dateStr = dateStrings[i];
                                const holiday = holidays.get(dateStr);
                                const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                                const isSatSun = isWeekend(date);
                                const isRedDay = (isSatSun || isHoliday) && holiday?.holiday_type !== "work_on_weekend";
                                const blockedByExclusive = isBlockedByExclusive(roomType.id, dateStr);
                                return (
                                  <div
                                    key={dateStr}
                                    className={cn(
                                      "flex-1 border-r last:border-r-0",
                                      isRedDay && "bg-destructive/5",
                                      isToday(date) && "bg-primary/5",
                                    )}
                                    style={{
                                      minWidth: DAY_COL_MIN_WIDTH,
                                      ...(blockedByExclusive
                                        ? {
                                            backgroundColor: "hsl(var(--muted) / 0.28)",
                                            backgroundImage:
                                              "repeating-linear-gradient(-45deg, transparent, transparent 6px, hsl(var(--border) / 0.8) 6px, hsl(var(--border) / 0.8) 8px)",
                                          }
                                        : {}),
                                    }}
                                  />
                                );
                              })}

                              {/* Order cards positioned absolutely */}
                              {slotEntries.map(entry => {
                                const checkInDate = entry.check_in_date;
                                const checkOutDate = entry.check_out_date;
                                
                                const visibleStart = checkInDate < dateStrings[0] ? dateStrings[0] : checkInDate;
                                const visibleEnd = checkOutDate > dateStrings[dateStrings.length - 1]
                                  ? format(addDays(parseISO(dateStrings[dateStrings.length - 1]), 1), "yyyy-MM-dd")
                                  : checkOutDate;
                                
                                const startIdx = dateStrings.indexOf(visibleStart);
                                if (startIdx === -1) return null;
                                
                                const endIdx = dateStrings.indexOf(visibleEnd);
                                const span = endIdx === -1 ? dateStrings.length - startIdx : endIdx - startIdx;
                                
                                if (span <= 0) return null;

                                const leftPercent = (startIdx / dayCount) * 100;
                                const widthPercent = (span / dayCount) * 100;
                                const isClippedLeft = checkInDate < dateStrings[0];
                                const isClippedRight = checkOutDate > format(addDays(parseISO(dateStrings[dateStrings.length - 1]), 1), "yyyy-MM-dd");

                                const tooltipText = (() => {
                                  let tip = `${entry.guest_name} | ${entry.check_in_date} ~ ${entry.check_out_date} | ${getSourceLabel(entry.order_source)}`;
                                  if (entry.notes) {
                                    const match = entry.notes.match(/【包區房間配置】(.+)/);
                                    if (match) tip += `\n${match[0]}`;
                                  }
                                  return tip;
                                })();

                                return (
                                  <TooltipProvider key={entry.id} delayDuration={100}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={cn(
                                            "absolute top-1 bottom-1 z-[5] cursor-pointer",
                                            entry.order_status === 'hold'
                                              ? "border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                                              : entry.order_status === 'confirmed'
                                                ? "border border-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200"
                                                : entry.order_status === 'checked_in'
                                                  ? "border border-violet-300 bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200"
                                                  : "border border-amber-300 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
                                            "rounded-md flex items-center px-2 gap-1 text-xs overflow-hidden",
                                            "hover:brightness-95 transition-all",
                                            isClippedLeft && "rounded-l-none border-l-0",
                                            isClippedRight && "rounded-r-none border-r-0",
                                          )}
                                          style={{
                                            left: `${leftPercent}%`,
                                            width: `${widthPercent}%`,
                                          }}
                                          onClick={() => navigate(`/admin/orders/${entry.orderId}`, { state: { from: '/admin/room-inventory' } })}
                                        >
                                          <span className="shrink-0">{SOURCE_ICONS[entry.order_source] || "📋"}</span>
                                          <span className="font-medium truncate">{entry.guest_name}</span>
                                          {span >= 2 && entry.order_source !== 'website' && entry.order_source !== 'manual' && (
                                            <span className="text-muted-foreground truncate hidden sm:inline">
                                              {getSourceLabel(entry.order_source)}
                                            </span>
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="text-base whitespace-pre-line max-w-xs">
                                        {tooltipText}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });

                      return slotRows;
                    })()}
                  </>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>
      {/* 來源圖示說明 */}
      <div className="px-3 py-2.5 border rounded-lg bg-muted/30 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">圖示說明：</span>
        {Object.entries(SOURCE_ICONS).map(([key, icon]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span>{icon}</span>
            <span>{SOURCE_LABELS[key] || key}</span>
          </span>
        ))}
      </div>
      {/* 訂單狀態色塊說明 */}
      <div className="px-3 py-2.5 border rounded-lg bg-muted/30 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">訂單色塊：</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-3 rounded border-2 border-dashed border-blue-400 bg-blue-50" />
          <span>保留單</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-3 rounded border border-amber-300 bg-amber-100" />
          <span>待確認</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-3 rounded border border-emerald-300 bg-emerald-100" />
          <span>已確認</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-3 rounded border border-violet-300 bg-violet-100" />
          <span>已入住</span>
        </span>
      </div>
      {/* 庫存數字顏色說明 */}
      <div className="px-3 py-2.5 border rounded-lg bg-muted/30 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">庫存說明：</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-foreground">3</span>
          <span>庫存充足</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-orange-500">1</span>
          <span>庫存偏低</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Lock className="h-3 w-3" />0</span>
          <span>已售完</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground/40">—</span>
          <span>未設定庫存</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium"><Lock className="h-3 w-3" />包區</span>
          <span>包區已預訂（連動鎖房）</span>
        </span>
      </div>
    </div>
  );
}
