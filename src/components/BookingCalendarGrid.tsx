import { useState, useEffect, useMemo, useRef } from "react";
import { format, addDays, subDays, isToday, isWeekend, parseISO, differenceInDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Lock, Package, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getRoomOverride, isTemplateActiveForDates, type TemplateLike } from "@/utils/pricingTemplateHelpers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BookingCalendarGridProps {
  accommodationId: string;
}

interface RoomType {
  id: string;
  name: string;
  capacity: number | null;
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
  lock_whole_building?: boolean | null;
}

interface OrderRoom {
  id: string;
  order_id: string;
  room_type_id: string;
  quantity: number;
  room_unit_id: string | null;
  template_name: string | null;
}

interface RoomUnit {
  id: string;
  room_type_id: string;
  unit_number: string;
  nickname: string | null;
  display_order: number;
  is_active: boolean;
}

// A virtual entry representing one room slot on the calendar
interface CalendarEntry {
  id: string;
  orderId: string;
  orderRoomId: string | null;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  order_source: string;
  room_type_id: string;
  room_unit_id: string | null;
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

interface ExclusiveBreakdownItem {
  room_type_id?: string | null;
  custom_id?: string | null;
  name?: string | null;
  custom_name?: string | null;
  count?: number | string | null;
  capacity?: number | string | null;
  visible_in_booking_grid?: boolean | null;
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
  franchise_diff: "🤝",
  owner_provided: "🧳",
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
   franchise_diff: "加盟價差",
   owner_provided: "業主自帶",
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
  const [roomUnits, setRoomUnits] = useState<RoomUnit[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [holidays, setHolidays] = useState<Map<string, PublicHoliday>>(new Map());
  const [inventory, setInventory] = useState<Map<string, InventoryRecord>>(new Map());
  const [pricingTemplates, setPricingTemplates] = useState<TemplateLike[]>([]);
  const [expandedRoomTypes, setExpandedRoomTypes] = useState<Set<string>>(new Set());
  const [hiddenRoomTypeIds, setHiddenRoomTypeIds] = useState<Set<string>>(new Set());
  const [customRows, setCustomRows] = useState<Array<{ id: string; name: string; count: number; capacity: number }>>([]);
  const [packageRowsByRt, setPackageRowsByRt] = useState<Map<string, Array<{ id: string; name: string; count: number }>>>(new Map());
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

      const [roomTypesRes, ordersRes, holidaysRes, inventoryRes, templatesRes, accInfoRes] = await Promise.all([
        supabase
          .from("room_types")
          .select("id, name, capacity, room_count, is_exclusive_package, is_bound_to_exclusive, bound_exclusive_ids, package_contents")
          .eq("accommodation_id", accommodationId)
          .order("display_order"),
        supabase
          .from("orders")
          .select("id, order_number, guest_name, guest_phone, guest_count, check_in_date, check_out_date, order_status, order_source, room_type_id, notes, lock_whole_building")
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
          .is("pricing_template_id", null)
          .gte("date", startStr)
          .lte("date", endStr),
        supabase
          .from("pricing_templates")
          .select("id, accommodation_id, valid_from, valid_until, room_overrides, weekday_enabled, peak_enabled, weekend_enabled, extra_dates, excluded_dates")
          .eq("accommodation_id", accommodationId),
        supabase
          .from("accommodation_info")
          .select("exclusive_room_breakdown")
          .eq("id", accommodationId)
          .maybeSingle(),
      ]);

      // 1) 「其他自訂房型」（accommodation_info.exclusive_room_breakdown 的 custom_id 項目）作為虛擬列
      const accInfo = accInfoRes.data as { exclusive_room_breakdown?: unknown } | null;
      const breakdown: ExclusiveBreakdownItem[] = Array.isArray(accInfo?.exclusive_room_breakdown)
        ? (accInfo.exclusive_room_breakdown as ExclusiveBreakdownItem[])
        : [];
      const hidden = new Set<string>();
      const customs: Array<{ id: string; name: string; count: number; capacity: number }> = [];
      for (const it of breakdown) {
        if (!it) continue;
        // 舊資料相容：room_type_id 隱藏旗標
        if (it.room_type_id && it.visible_in_booking_grid === false) {
          hidden.add(it.room_type_id);
        }
        if (!it.room_type_id && it.custom_id && it.visible_in_booking_grid !== false) {
          customs.push({
            id: String(it.custom_id),
            name: String(it.custom_name || it.name || ""),
            count: Number(it.count) || 0,
            capacity: Number(it.capacity) || 0,
          });
        }
      }

      // 2) 包棟方案內含房間（room_types.package_contents），visible_in_booking_grid === true
      //    依「包棟房型」分組，顯示為該房型展開後的子列（不再合併到底部）
      const pkgRowsByRtId = new Map<string, Array<{ id: string; name: string; count: number }>>();
      for (const rt of (roomTypesRes.data || []) as any[]) {
        if (!rt?.is_exclusive_package) continue;
        const rows = Array.isArray(rt.package_contents) ? rt.package_contents : [];
        const list: Array<{ id: string; name: string; count: number }> = [];
        for (const row of rows) {
          if (!row || row.visible_in_booking_grid !== true) continue;
          const name = String(row.name || "").trim();
          const count = Math.max(0, Number(row.count) || 0);
          if (!name || count <= 0) continue;
          list.push({ id: String(row.id || `${rt.id}_${name}`), name, count });
        }
        if (list.length > 0) pkgRowsByRtId.set(rt.id, list);
      }
      setPackageRowsByRt(pkgRowsByRtId);

      setHiddenRoomTypeIds(hidden);
      setCustomRows(customs.filter(c => c.name && c.count > 0));


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
          .select("id, order_id, room_type_id, quantity, room_unit_id, template_name")
          .in("order_id", orderIds);
        fetchedOrderRooms = (orData || []) as OrderRoom[];
      }
      setOrderRooms(fetchedOrderRooms);

      // Fetch room units for this accommodation
      const { data: unitData } = await supabase
        .from("room_units")
        .select("id, room_type_id, unit_number, nickname, display_order, is_active")
        .eq("accommodation_id", accommodationId)
        .eq("is_active", true)
        .order("display_order");
      setRoomUnits((unitData || []) as RoomUnit[]);

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
                orderRoomId: room.id,
                order_number: order.order_number,
                guest_name: order.guest_name,
                guest_phone: order.guest_phone,
                guest_count: order.guest_count,
                check_in_date: order.check_in_date,
                check_out_date: order.check_out_date,
                order_status: order.order_status,
                order_source: order.order_source,
                room_type_id: room.room_type_id,
                room_unit_id: room.quantity === 1 ? room.room_unit_id : null,
                notes: order.notes,
              });
            }
          }
        } else {
          // Single-room order: use the order's room_type_id
          entries.push({
            id: order.id,
            orderId: order.id,
            orderRoomId: null,
            order_number: order.order_number,
            guest_name: order.guest_name,
            guest_phone: order.guest_phone,
            guest_count: order.guest_count,
            check_in_date: order.check_in_date,
            check_out_date: order.check_out_date,
            order_status: order.order_status,
            order_source: order.order_source,
            room_type_id: order.room_type_id,
            room_unit_id: null,
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
      setPricingTemplates((templatesRes.data || []) as TemplateLike[]);
    } catch (error) {
      console.error("載入資料失敗:", error);
      toast.error("載入資料失敗");
    } finally {
      setLoading(false);
    }
  };

  // Get available rooms for a room type on a date
  // 以「庫存設定」為主：取 base 與所有 active 專案 override 中的最大值
  const getAvailableRooms = (roomTypeId: string, dateStr: string): number => {
    const inv = inventory.get(`${roomTypeId}_${dateStr}`);
    let base = 0;
    if (inv) {
      if (inv.is_available === false) base = 0;
      else base = inv.available_rooms;
    }
    let effective = base;
    for (const t of pricingTemplates) {
      if (!isTemplateActiveForDates(t, [dateStr])) continue;
      const ov = getRoomOverride(t, roomTypeId);
      if (ov?.available_rooms != null && ov.available_rooms > effective) {
        effective = ov.available_rooms;
      }
    }
    return effective;
  };

  // Get booked count for a room type on a date (using calendar entries for accurate multi-room counting)
  const getBookedCount = (roomTypeId: string, dateStr: string): number => {
    return calendarEntries.filter(e => {
      if (e.room_type_id !== roomTypeId) return false;
      return e.check_in_date <= dateStr && e.check_out_date > dateStr;
    }).length;
  };

  // 「共用包棟」(is_exclusive_package && is_bound_to_exclusive) 的訂單會鎖定其他共用包棟與所有綁定包棟的散客房型。
  // 獨立包棟 (is_exclusive_package && !is_bound_to_exclusive) 不會影響其他房型。
  const sharedExclusiveBookedDates = useMemo(() => {
    const blockedDates = new Set<string>();
    const sharedExclusiveTypes = roomTypes.filter(r => r.is_exclusive_package && r.is_bound_to_exclusive);
    for (const dateStr of dateStrings) {
      const hasBooking = sharedExclusiveTypes.some(et =>
        calendarEntries.some(e => e.room_type_id === et.id && e.check_in_date <= dateStr && e.check_out_date > dateStr)
      );
      if (hasBooking) blockedDates.add(dateStr);
    }
    return blockedDates;
  }, [roomTypes, calendarEntries, dateStrings]);

  // 反向：散客房型 (is_bound_to_exclusive && !is_exclusive_package) 有訂單時，
  // 會鎖定它所綁定的包棟房型。bound_exclusive_ids 為 null/空 → 視為綁定全部共用包棟。
  const exclusiveBlockedByBoundRoom = useMemo(() => {
    const map = new Map<string, Set<string>>(); // exclusiveRoomTypeId -> dates
    const boundRooms = roomTypes.filter(r => !r.is_exclusive_package && r.is_bound_to_exclusive);
    const allSharedExclusiveIds = roomTypes
      .filter(r => r.is_exclusive_package && r.is_bound_to_exclusive)
      .map(r => r.id);
    for (const room of boundRooms) {
      const targets = (room.bound_exclusive_ids && room.bound_exclusive_ids.length > 0)
        ? room.bound_exclusive_ids
        : allSharedExclusiveIds;
      for (const dateStr of dateStrings) {
        const hasBooking = calendarEntries.some(e =>
          e.room_type_id === room.id && e.check_in_date <= dateStr && e.check_out_date > dateStr
        );
        if (!hasBooking) continue;
        for (const exId of targets) {
          if (!map.has(exId)) map.set(exId, new Set());
          map.get(exId)!.add(dateStr);
        }
      }
    }
    return map;
  }, [roomTypes, calendarEntries, dateStrings]);

  // 整棟保留/包棟旗標：任何訂單 lock_whole_building = true → 該日所有房型整列鎖（不分包棟/散客）
  const wholeBuildingLockedDates = useMemo(() => {
    const blocked = new Set<string>();
    for (const dateStr of dateStrings) {
      const hit = orders.some(o =>
        o.lock_whole_building === true &&
        o.order_status !== 'cancelled' &&
        o.check_in_date <= dateStr && o.check_out_date > dateStr
      );
      if (hit) blocked.add(dateStr);
    }
    return blocked;
  }, [orders, dateStrings]);

  const isBlockedByExclusive = (roomTypeId: string, dateStr: string): boolean => {
    // 整棟保留 → 任何房型該日都鎖
    if (wholeBuildingLockedDates.has(dateStr)) return true;
    const rt = roomTypes.find(r => r.id === roomTypeId);
    if (!rt) return false;
    if (rt.is_exclusive_package) {
      if (!rt.is_bound_to_exclusive) return false; // 獨立包棟不受影響
      // 被其他共用包棟鎖,或被綁定的散客房間訂單鎖
      if (sharedExclusiveBookedDates.has(dateStr)) return true;
      return exclusiveBlockedByBoundRoom.get(rt.id)?.has(dateStr) === true;
    }
    // 散客房型：綁定包棟 → 被共用包棟訂單鎖
    return rt.is_bound_to_exclusive === true && sharedExclusiveBookedDates.has(dateStr);
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

  // 解析「包棟訂單」notes 內【包棟/包區房間配置】。
  // 必須依房型 + 日期對齊，資料來源與上方房型日曆同樣使用 calendarEntries，避免房間配置列錯抓到其他包棟房型的日期。
  const exclusiveConfigByRoomTypeDate = useMemo(() => {
    const result = new Map<string, Map<string, Map<string, number>>>();
    const exclusiveTypeIds = new Set(roomTypes.filter(r => r.is_exclusive_package).map(r => r.id));
    const pkgLineRegex = /【\s*(?:包區|包棟)\s*房間配置\s*】\s*([^\n]+)/g;
    const partRegex = /([\u4e00-\u9fff\w]+?)\s*(\d+)\s*間/g;

    const addNotesToConfig = (notes: string | null, cfg: Map<string, number>) => {
      if (!notes) return;
      const lineRe = new RegExp(pkgLineRegex.source, 'g');
      let lm: RegExpExecArray | null;
      while ((lm = lineRe.exec(notes)) !== null) {
        const partRe = new RegExp(partRegex.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = partRe.exec(lm[1])) !== null) {
          const name = m[1].trim();
          const n = parseInt(m[2], 10) || 0;
          if (name) cfg.set(name, (cfg.get(name) || 0) + n);
        }
      }
    };

    for (const roomTypeId of exclusiveTypeIds) {
      const byDate = new Map<string, Map<string, number>>();
      for (const dateStr of dateStrings) {
        const cfg = new Map<string, number>();
        const parsedOrderIds = new Set<string>();
        for (const entry of calendarEntries) {
          if (entry.room_type_id !== roomTypeId) continue;
          if (entry.check_in_date > dateStr || entry.check_out_date <= dateStr) continue;
          if (parsedOrderIds.has(entry.orderId)) continue;
          parsedOrderIds.add(entry.orderId);
          addNotesToConfig(entry.notes, cfg);
        }
        if (cfg.size > 0) byDate.set(dateStr, cfg);
      }
      if (byDate.size > 0) result.set(roomTypeId, byDate);
    }

    return result;
  }, [calendarEntries, roomTypes, dateStrings]);

  const exclusiveConfigByDate = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const byDate of exclusiveConfigByRoomTypeDate.values()) {
      for (const [dateStr, cfg] of byDate.entries()) {
        const merged = result.get(dateStr) || new Map<string, number>();
        cfg.forEach((count, name) => merged.set(name, (merged.get(name) || 0) + count));
        result.set(dateStr, merged);
      }
    }
    return result;
  }, [exclusiveConfigByRoomTypeDate]);
  const toggleRoomType = (id: string) => {
    setExpandedRoomTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Assign / unassign a calendar entry to a specific room unit
  const assignEntryToUnit = async (entry: CalendarEntry, newUnitId: string | null) => {
    try {
      if (entry.orderRoomId) {
        const { error } = await supabase
          .from("order_rooms")
          .update({ room_unit_id: newUnitId })
          .eq("id", entry.orderRoomId);
        if (error) throw error;
      } else {
        // Single-room order without order_rooms row → create one to hold the unit assignment
        const { error } = await supabase.from("order_rooms").insert({
          order_id: entry.orderId,
          room_type_id: entry.room_type_id,
          quantity: 1,
          room_unit_id: newUnitId,
        });
        if (error) throw error;
      }
      toast.success(newUnitId ? "已指派房間" : "已取消指派");
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "指派失敗");
    }
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
      const natural = available / dayCount;
      return Math.max(natural, 48);
    }
    // Fallback before measurement
    return dayCount <= 7 ? 120 : dayCount <= 15 ? 80 : 48;
  })();
  const GRID_MIN_WIDTH = LEFT_COL_WIDTH + DAY_COL_MIN_WIDTH * dayCount;
  const gridStyle = { width: GRID_MIN_WIDTH, minWidth: GRID_MIN_WIDTH };
  const dayColumnStyle = {
    width: DAY_COL_MIN_WIDTH,
    minWidth: DAY_COL_MIN_WIDTH,
    maxWidth: DAY_COL_MIN_WIDTH,
    flexBasis: DAY_COL_MIN_WIDTH,
  };
  const DAYS_ROW_WIDTH = DAY_COL_MIN_WIDTH * dayCount;
  const daysRowStyle = { width: DAYS_ROW_WIDTH, minWidth: DAYS_ROW_WIDTH };

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
              <div style={gridStyle}>
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
                <div className="shrink-0 flex flex-col" style={daysRowStyle}>
                  <div className="flex">

                    {dates.map((date, i) => {
                      const dateStr = dateStrings[i];
                      const holiday = holidays.get(dateStr);
                      const dayOfWeek = date.getDay();
                      const isSat = dayOfWeek === 6;
                      const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                      const isWorkOnWeekend = holiday?.holiday_type === "work_on_weekend";
                      // 依專案規範：僅週六與國定假日為假日，週日視為平日
                      const isRed = (isSat || isHoliday) && !isWorkOnWeekend;

                      return (
                        <div
                          key={dateStr}
                          className={cn(
                            "shrink-0 text-center py-2 border-r last:border-r-0 text-sm",
                            isToday(date) && "bg-primary/10 font-bold",
                            isRed && "text-destructive",
                          )}
                          style={dayColumnStyle}
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
            <div style={gridStyle}>
            {/* Room type rows */}
          {roomTypes.filter(rt => !hiddenRoomTypeIds.has(rt.id)).map(roomType => {
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
                  <div className="flex shrink-0" style={daysRowStyle}>

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
                            "shrink-0 border-r last:border-r-0 p-2 text-center text-sm overflow-hidden",
                            isRedDay && "bg-destructive/5",
                            isToday(date) && "bg-primary/5",
                          )}
                          style={{
                            ...dayColumnStyle,
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
                      const YUNXIU_ACC_ID = "7690a606-6bac-4cd5-a3e7-2fa754b318e8";
                      const TIANSONG_ACC_ID = "4ee31aca-5641-4d05-80e2-1c67626be83d";
                      const OLIVIA_ACC_ID = "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8";
                      const isYunxiu = accommodationId === YUNXIU_ACC_ID;
                      const isTiansong = accommodationId === TIANSONG_ACC_ID;
                      const isOlivia = accommodationId === OLIVIA_ACC_ID;
                      const rtUnits = roomUnits.filter(u => u.room_type_id === roomType.id);
                      // 雲岫 / 奧莉薇雅：僅散客房型用單位顯示
                      // 天送：散客與包棟皆用單位顯示（房號 / 棟號）
                      const useUnits = rtUnits.length > 0 && (
                        (isYunxiu && !roomType.is_exclusive_package) ||
                        (isOlivia && !roomType.is_exclusive_package) ||
                        isTiansong
                      );

                      type SlotMeta = { unitId: string | null; label: string; nickname?: string | null };
                      const slots: { meta: SlotMeta; entries: CalendarEntry[] }[] = [];

                      if (useUnits) {
                        // One row per unit
                        for (const u of rtUnits) {
                          const entries = rtEntries.filter(e => e.room_unit_id === u.id);
                          slots.push({
                            meta: { unitId: u.id, label: u.unit_number, nickname: u.nickname },
                            entries,
                          });
                        }
                        // Unassigned bucket — split with overlap-avoidance like before
                        const unassigned = rtEntries
                          .filter(e => !e.room_unit_id)
                          .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
                        const unassignedRows: CalendarEntry[][] = [];
                        unassigned.forEach(entry => {
                          let placed = false;
                          for (const row of unassignedRows) {
                            const last = row[row.length - 1];
                            if (last.check_out_date <= entry.check_in_date) {
                              row.push(entry);
                              placed = true;
                              break;
                            }
                          }
                          if (!placed) unassignedRows.push([entry]);
                        });
                        if (unassignedRows.length === 0 && unassigned.length === 0) {
                          // no unassigned bucket needed
                        } else {
                          unassignedRows.forEach((row, idx) => {
                            slots.push({
                              meta: { unitId: null, label: idx === 0 ? "未指派" : `未指派 ${idx + 1}` },
                              entries: row,
                            });
                          });
                        }
                      } else {
                        // Legacy behavior: pack overlapping entries into multiple rows
                        const sortedEntries = [...rtEntries].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
                        const roomSlots: CalendarEntry[][] = [];
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
                          if (!placed) roomSlots.push([entry]);
                        });
                        const minRows = Math.max(roomCount, roomSlots.length, 1);
                        for (let i = 0; i < minRows; i++) {
                          slots.push({
                            meta: { unitId: null, label: roomCount > 0 ? `${i + 1}` : `#${i + 1}` },
                            entries: roomSlots[i] || [],
                          });
                        }
                      }

                      return slots.map((slot, slotIdx) => (
                        <div key={`${slot.meta.unitId ?? 'na'}-${slotIdx}`} className="flex border-b last:border-b-0">
                          <div
                            className="shrink-0 border-r p-2 pl-8 text-sm flex items-center gap-1 sticky left-0 bg-card z-20"
                            style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                          >
                            <span className={cn(
                              "font-medium",
                              slot.meta.unitId === null && useUnits ? "text-muted-foreground italic" : "text-foreground"
                            )}>
                              {slot.meta.label}
                            </span>
                            {slot.meta.nickname && (
                              <span className="text-xs text-muted-foreground truncate">· {slot.meta.nickname}</span>
                            )}
                          </div>
                          <div className="flex shrink-0 relative" style={{ ...daysRowStyle, minHeight: 48 }}>
                            {/* Background date cells */}
                            {dates.map((date, i) => {
                              const dateStr = dateStrings[i];
                              const holiday = holidays.get(dateStr);
                              const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                              const isSatSun = isWeekend(date);
                              const isRedDay = (isSatSun || isHoliday) && holiday?.holiday_type !== "work_on_weekend";
                              const blockedByExclusive = isBlockedByExclusive(roomType.id, dateStr);
                              const isLast = i === dates.length - 1;
                              return (
                                <div
                                  key={dateStr}
                                  className={cn(
                                     "shrink-0",
                                     !isLast && "border-r",
                                    isRedDay && "bg-destructive/5",
                                    isToday(date) && "bg-primary/5",
                                  )}
                                  style={{
                                     ...dayColumnStyle,
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
                            {slot.entries.map(entry => {
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

                              const leftPx = startIdx * DAY_COL_MIN_WIDTH;
                              const widthPx = span * DAY_COL_MIN_WIDTH;
                              const isClippedLeft = checkInDate < dateStrings[0];
                              const isClippedRight = checkOutDate > format(addDays(parseISO(dateStrings[dateStrings.length - 1]), 1), "yyyy-MM-dd");

                              const tooltipText = (() => {
                                let tip = `${entry.guest_name} | ${getSourceLabel(entry.order_source)}`;

                                // 收集該訂單所有房間（包棟顯示房型，散客顯示房間號 + 包棟配置）
                                const orderAllRooms = orderRooms.filter(or => or.order_id === entry.orderId);
                                const pkgLines = entry.notes
                                  ? (entry.notes.match(/【\s*(?:包區|包棟)\s*房間配置\s*】[^\n]+/g) || [])
                                  : [];
                                let pkgIdx = 0;
                                const lines: string[] = [];

                                if (orderAllRooms.length > 0) {
                                  for (const or of orderAllRooms) {
                                    const rt = roomTypes.find(r => r.id === or.room_type_id);
                                    if (!rt) continue;
                                    if (rt.is_exclusive_package) {
                                      for (let q = 0; q < or.quantity; q++) {
                                        lines.push(`房型:${rt.name}${entry.guest_count ? `(${entry.guest_count}人)` : ''}`);
                                        if (or.template_name) lines.push(`專案:${or.template_name}`);
                                        if (pkgLines[pkgIdx]) lines.push(pkgLines[pkgIdx]);
                                        pkgIdx++;
                                      }
                                    } else {
                                      // 散客房：依 quantity 列出指派的房間
                                      if (or.quantity === 1 && or.room_unit_id) {
                                        const u = roomUnits.find(x => x.id === or.room_unit_id);
                                        lines.push(u ? `房間:${u.unit_number}${u.nickname ? `(${u.nickname})` : ''}` : `房型:${rt.name}`);
                                      } else {
                                        // 多間散客或未指派
                                        for (let q = 0; q < or.quantity; q++) {
                                          lines.push(`房型:${rt.name}`);
                                        }
                                      }
                                    }
                                  }
                                } else {
                                  // 單房舊訂單 fallback
                                  const unit = rtUnits.find(u => u.id === entry.room_unit_id);
                                  if (unit) {
                                    lines.push(`房間:${unit.unit_number}${unit.nickname ? `(${unit.nickname})` : ''}`);
                                  } else {
                                    lines.push(`房型:${roomType.name}`);
                                  }
                                  if (pkgLines.length > 0) lines.push(...pkgLines);
                                }

                                if (lines.length > 0) tip += `\n${lines.join("\n")}`;
                                return tip;
                              })();

                              // Compute eligible units (no overlap with other entries on this room type)
                              const eligibleUnits = useUnits
                                ? rtUnits.filter(u => {
                                    if (u.id === entry.room_unit_id) return true;
                                    const conflict = rtEntries.some(other =>
                                      other.id !== entry.id &&
                                      other.room_unit_id === u.id &&
                                      other.check_in_date < entry.check_out_date &&
                                      other.check_out_date > entry.check_in_date
                                    );
                                    return !conflict;
                                  })
                                : [];

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
                                          "rounded-md flex items-center justify-center px-2 gap-1 text-xs overflow-hidden",
                                          "hover:brightness-95 transition-all",
                                          isClippedLeft && "rounded-l-none border-l-0",
                                          isClippedRight && "rounded-r-none border-r-0",
                                        )}
                                        style={{
                                          left: leftPx,
                                          width: widthPx,
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
                                        {useUnits && (
                                          <Select
                                            value={entry.room_unit_id || "__none__"}
                                            onValueChange={(v) => assignEntryToUnit(entry, v === "__none__" ? null : v)}
                                          >
                                            <SelectTrigger
                                              onClick={(e) => e.stopPropagation()}
                                              className="ml-auto h-5 px-1.5 py-0 text-[10px] bg-background/70 border-foreground/20 shrink-0 w-auto gap-1"
                                            >
                                              <SelectValue placeholder="指派" />
                                            </SelectTrigger>
                                            <SelectContent onClick={(e) => e.stopPropagation()}>
                                              <SelectItem value="__none__">未指派</SelectItem>
                                              {eligibleUnits.map(u => (
                                                <SelectItem key={u.id} value={u.id}>
                                                  {u.unit_number}{u.nickname ? ` · ${u.nickname}` : ''}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-sm whitespace-pre-line max-w-xs">
                                      {tooltipText}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
          })}
          </div>
                        </div>
                      ));
                    })()}

                    {/* 包棟內房間組成（依房型分組顯示，僅資訊用，不可預訂） */}
                    {(packageRowsByRt.get(roomType.id) || []).map(pr => (
                      <div key={`pkgrow_${roomType.id}_${pr.id}`} className="flex border-b last:border-b-0 hover:bg-muted/20">
                        <div
                          className="shrink-0 border-r p-2 pl-10 text-sm flex items-center gap-1 sticky left-0 bg-card z-20"
                          style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                        >
                          <span className="font-medium text-foreground truncate">{pr.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{pr.count}間</span>
                        </div>
                        <div className="flex shrink-0" style={daysRowStyle}>

                          {dates.map((date, i) => {
                            const dateStr = dateStrings[i];
                            const holiday = holidays.get(dateStr);
                            const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                            const isSatSun = isWeekend(date);
                            const isRedDay = (isSatSun || isHoliday) && holiday?.holiday_type !== "work_on_weekend";
                            const cfg = exclusiveConfigByRoomTypeDate.get(roomType.id)?.get(dateStr);
                            const hasExclusiveBooking = exclusiveBookedDates.get(roomType.id)?.has(dateStr) === true;
                            const hasExclusiveOrder = hasExclusiveBooking || !!cfg;
                            const lockedCount = cfg ? (cfg.get(pr.name) ?? 0) : (hasExclusiveBooking ? pr.count : 0);
                            const remaining = Math.max(0, pr.count - lockedCount);
                            return (
                              <div
                                key={dateStr}
                                className={cn(
                                   "shrink-0 border-r last:border-r-0 p-2 text-center text-sm overflow-hidden",
                                  isRedDay && "bg-destructive/5",
                                  isToday(date) && "bg-primary/5",
                                )}
                                style={{
                                   ...dayColumnStyle,
                                  ...(hasExclusiveOrder
                                    ? {
                                        backgroundColor: "hsl(var(--muted) / 0.28)",
                                        backgroundImage:
                                          "repeating-linear-gradient(-45deg, transparent, transparent 6px, hsl(var(--border) / 0.8) 6px, hsl(var(--border) / 0.8) 8px)",
                                      }
                                    : {}),
                                }}
                              >
                                {hasExclusiveOrder ? (
                                  <span className="inline-flex items-center justify-center gap-0.5 text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    <span className="font-medium">{remaining}/{pr.count}</span>
                                  </span>
                                ) : (
                                  <span className="font-medium text-foreground">{pr.count}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}

          {/* 自訂房型虛擬列（僅顯示間數，不可預訂） */}
          {customRows.map(cr => (
            <div key={`custom_${cr.id}`} className="flex border-b hover:bg-muted/20">
              <div
                className="shrink-0 border-r p-2 flex items-center gap-1 sticky left-0 bg-card z-20"
                style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              >
                <span className="w-4" />
                <span className="font-semibold text-sm truncate">{cr.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{cr.count}間</span>
              </div>
              <div className="flex shrink-0" style={daysRowStyle}>
                {dates.map((date, i) => {
                  const dateStr = dateStrings[i];
                  const holiday = holidays.get(dateStr);
                  const isHoliday = holiday && (holiday.holiday_type === "holiday" || holiday.holiday_type === "compensatory_day_off");
                  const isSatSun = isWeekend(date);
                  const isRedDay = (isSatSun || isHoliday) && holiday?.holiday_type !== "work_on_weekend";
                  const cfg = exclusiveConfigByDate.get(dateStr);
                  const hasExclusiveOrder = !!cfg;
                  const lockedCount = cfg?.get(cr.name) ?? 0;
                  const remaining = Math.max(0, cr.count - lockedCount);
                  return (
                    <div
                      key={dateStr}
                      className={cn(
                        "shrink-0 border-r last:border-r-0 p-2 text-center text-sm overflow-hidden",
                        isRedDay && "bg-destructive/5",
                        isToday(date) && "bg-primary/5",
                      )}
                      style={{
                        ...dayColumnStyle,
                        ...(hasExclusiveOrder
                          ? {
                              backgroundColor: "hsl(var(--muted) / 0.28)",
                              backgroundImage:
                                "repeating-linear-gradient(-45deg, transparent, transparent 6px, hsl(var(--border) / 0.8) 6px, hsl(var(--border) / 0.8) 8px)",
                            }
                          : {}),
                      }}
                    >
                      {hasExclusiveOrder ? (
                        <span className="inline-flex items-center justify-center gap-0.5 text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          <span className="font-medium">{remaining}/{cr.count}</span>
                        </span>
                      ) : (
                        <span className="font-medium text-foreground">{cr.count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
