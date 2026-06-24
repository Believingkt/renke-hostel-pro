import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, getDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Hotel } from 'lucide-react';
import { buildPricingMap } from '@/utils/revenueByMonth';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface OccupancyRevenueTableProps {
  accommodationId: string;
  selectedYear: number;
}

interface DayTypeStats {
  rooms: number;
  available: number;
  occupancyRate: number;
  revenue: number;
}

interface DailyDetail {
  date: string;
  dayLabel: string;
  dayType: DayType;
  roomsSold: number;
  exclusiveSold: number;
  standardSold: number;
  revenue: number;
  avgPrice: number;
  hasOfficial: boolean;
  hasKol: boolean;
}

type SegmentKey = 'all' | 'exclusive' | 'standard';

interface SegmentRow {
  segment: SegmentKey;
  weekday: DayTypeStats;
  friSun: DayTypeStats;
  holiday: DayTypeStats;
  avgOccupancy: number;
  totalRevenue: number;
  capacityPerDay: number;
}

interface MonthRow {
  monthKey: string;
  label: string;
  segments: SegmentRow[];   // length 1 (all) or 2 (exclusive + standard)
  dailyDetails: DailyDetail[];
  totalRevenue: number;
}

type DayType = 'weekday' | 'friSun' | 'holiday';

function classifyDay(date: Date, holidaySet: Set<string>): DayType {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dow = getDay(date);
  if (holidaySet.has(dateStr)) return 'holiday';
  if (dow === 6) return 'holiday';
  if (dow === 5 || dow === 0) return 'friSun';
  return 'weekday';
}

function pickDailyPrice(
  inv: { price: number; price_2_meals: number | null; price_3_meals: number | null },
  mealPlan: string | null
): number {
  if (mealPlan === '3_meals' || mealPlan === '三餐') return inv.price_3_meals ?? inv.price;
  if (mealPlan === '2_meals' || mealPlan === '二餐' || mealPlan === '兩餐') return inv.price_2_meals ?? inv.price;
  return inv.price;
}

const SEGMENT_LABEL: Record<SegmentKey, string> = {
  all: '全部',
  exclusive: '包棟',
  standard: '散客',
};

// Paginated fetch helper to bypass PostgREST's default 1000-row cap.
async function fetchAllPaginated<T>(
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Safety cap to avoid runaway loops
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export const OccupancyRevenueTable = ({ accommodationId, selectedYear }: OccupancyRevenueTableProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ['occupancy-revenue-table', accommodationId, selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear - 1}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      const [roomTypesRes, holidaysRes, accRes, ordersAll] = await Promise.all([
        supabase.from('room_types').select('id, name, room_count, is_exclusive_package').eq('accommodation_id', accommodationId),
        supabase.from('public_holidays')
          .select('holiday_date, holiday_type')
          .eq('accommodation_id', accommodationId)
          .gte('holiday_date', startDate)
          .lte('holiday_date', endDate),
        supabase.from('accommodation_info').select('daily_capacity, daily_villa_capacity, daily_room_capacity, name').eq('id', accommodationId).maybeSingle(),
        // Orders: stay-range overlap = check_in <= endDate AND check_out >= startDate (both AND)
        fetchAllPaginated<any>(() =>
          supabase.from('orders')
            .select('id, check_in_date, check_out_date, room_type_id, final_price, meal_plan, order_status, order_source')
            .eq('accommodation_id', accommodationId)
            .in('order_status', ['confirmed', 'hold'])
            .lte('check_in_date', endDate)
            .gte('check_out_date', startDate)
            .order('id', { ascending: true })
        ),
      ]);
      const dailyCap = Number((accRes.data as any)?.daily_capacity) > 0 ? Number((accRes.data as any).daily_capacity) : 6;
      const dailyVillaCap = Number((accRes.data as any)?.daily_villa_capacity) > 0 ? Number((accRes.data as any).daily_villa_capacity) : 0;
      const dailyRoomCap = Number((accRes.data as any)?.daily_room_capacity) > 0 ? Number((accRes.data as any).daily_room_capacity) : 0;
      const accName: string = (accRes.data as any)?.name || '';

      if (roomTypesRes.error) throw roomTypesRes.error;

      const orders = ordersAll;
      const orderIds = orders.map((o: any) => o.id);

      const roomTypeIds = (roomTypesRes.data || []).map(rt => rt.id);

      // Fetch inventory pricing + order_rooms in parallel, both paginated and scoped.
      const CHUNK = 300;
      const [inventoryData, orderRoomsAll] = await Promise.all([
        roomTypeIds.length > 0
          ? fetchAllPaginated<any>(() =>
              supabase
                .from('room_inventory_pricing')
                .select('room_type_id, date, price, price_2_meals, price_3_meals')
                .in('room_type_id', roomTypeIds)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: true })
            )
          : Promise.resolve([] as any[]),
        (async () => {
          if (orderIds.length === 0) return [] as any[];
          const out: any[] = [];
          for (let i = 0; i < orderIds.length; i += CHUNK) {
            const slice = orderIds.slice(i, i + CHUNK);
            const batch = await fetchAllPaginated<any>(() =>
              supabase.from('order_rooms')
                .select('order_id, room_type_id, quantity')
                .in('order_id', slice)
                .order('order_id', { ascending: true })
            );
            out.push(...batch);
          }
          return out;
        })(),
      ]);

      const orderRoomsMap = new Map<string, { room_type_id: string; quantity: number }[]>();
      orderRoomsAll.forEach((or: any) => {
        if (!orderRoomsMap.has(or.order_id)) orderRoomsMap.set(or.order_id, []);
        orderRoomsMap.get(or.order_id)!.push({ room_type_id: or.room_type_id, quantity: or.quantity });
      });

      if (typeof window !== 'undefined') {
        // Lightweight diagnostics for verification; harmless in production.
        // eslint-disable-next-line no-console
        console.debug('[OccupancyRevenueTable] fetch counts', {
          accommodationId,
          selectedYear,
          orders: orders.length,
          orderRooms: orderRoomsAll.length,
          inventory: inventoryData.length,
        });
      }

      return {
        roomTypes: roomTypesRes.data || [],
        orders,
        holidays: holidaysRes.data || [],
        inventoryData,
        orderRoomsMap,
        dailyCap,
        dailyVillaCap,
        dailyRoomCap,
        accName,
      };
    },
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000,
  });

  const tableData = useMemo(() => {
    if (!data) return null;

    const { roomTypes, orders, holidays, inventoryData, orderRoomsMap, dailyCap, dailyVillaCap, dailyRoomCap, accName } = data;

    const exclusiveRoomTypeIds = new Set(roomTypes.filter(rt => rt.is_exclusive_package).map(rt => rt.id));
    const exclusiveRoomCount = roomTypes.filter(rt => rt.is_exclusive_package).reduce((s, rt) => s + (rt.room_count || 0), 0);
    const standardRoomCount = roomTypes.filter(rt => !rt.is_exclusive_package).reduce((s, rt) => s + (rt.room_count || 0), 0);

    // Split mode:
    //  1) 管理員在「房型與包棟設定」設定了「每日可售包棟數/散客房數」→ 啟用 split 並以該值為容量上限
    //  2) 沿用既有的雲岫硬編碼分流（向下相容）
    const isYunxiu = (accName || '').includes('雲岫');
    const isSensan = (accName || '').includes('森山');
    const adminSplit = dailyVillaCap > 0 || dailyRoomCap > 0;
    const splitMode = adminSplit || (isYunxiu && exclusiveRoomCount > 0 && standardRoomCount > 0);
    // 管理員啟用分流時，包棟訂單一律視為 1 棟（不分內含房數）
    const villaAsSingleUnit = adminSplit;

    let exclusiveCap: number;
    let standardCap: number;
    if (adminSplit) {
      exclusiveCap = dailyVillaCap;
      standardCap = dailyRoomCap;
    } else if (splitMode) {
      exclusiveCap = exclusiveRoomCount;
      standardCap = standardRoomCount;
    } else {
      exclusiveCap = 0;
      standardCap = 0;
    }
    let allCapacity: number;
    if (splitMode) {
      allCapacity = exclusiveCap + standardCap;
    } else {
      const total = roomTypes.reduce((s, rt) => s + (rt.room_count || 0), 0);
      allCapacity = Math.min(total, dailyCap);
    }
    if (allCapacity === 0) return null;

    const segmentCapacity: Record<SegmentKey, number> = {
      all: allCapacity,
      exclusive: exclusiveCap,
      standard: standardCap,
    };

    const pricingMap = buildPricingMap(inventoryData);

    const holidaySet = new Set<string>();
    holidays.forEach(h => holidaySet.add(h.holiday_date));

    // 啟用的分段
    const activeSegments: SegmentKey[] = splitMode ? ['exclusive', 'standard'] : ['all'];

    type Bucket = {
      soldByType: Record<DayType, number>;
      revenueByType: Record<DayType, number>;
      availableByType: Record<DayType, number>;
    };
    const emptyBucket = (): Bucket => ({
      soldByType: { weekday: 0, friSun: 0, holiday: 0 },
      revenueByType: { weekday: 0, friSun: 0, holiday: 0 },
      availableByType: { weekday: 0, friSun: 0, holiday: 0 },
    });

    const monthsWithData = new Map<string, MonthRow>();

    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(selectedYear, month, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const daysInMonth = monthEnd.getDate();

      const dayTypeCounts: Record<DayType, number> = { weekday: 0, friSun: 0, holiday: 0 };
      for (let d = 0; d < daysInMonth; d++) {
        const day = addDays(monthStart, d);
        dayTypeCounts[classifyDay(day, holidaySet)]++;
      }

      const buckets: Record<SegmentKey, Bucket> = {
        all: emptyBucket(), exclusive: emptyBucket(), standard: emptyBucket(),
      };
      activeSegments.forEach(seg => {
        const cap = segmentCapacity[seg];
        buckets[seg].availableByType.weekday = dayTypeCounts.weekday * cap;
        buckets[seg].availableByType.friSun = dayTypeCounts.friSun * cap;
        buckets[seg].availableByType.holiday = dayTypeCounts.holiday * cap;
      });

      const dailyRoomsSold: Record<string, number> = {};
      const dailyExclusiveSold: Record<string, number> = {};
      const dailyStandardSold: Record<string, number> = {};
      const dailyRevenue: Record<string, number> = {};
      const dailyHasOfficial: Record<string, boolean> = {};
      const dailyHasKol: Record<string, boolean> = {};
      for (let d = 0; d < daysInMonth; d++) {
        const dateStr = format(addDays(monthStart, d), 'yyyy-MM-dd');
        dailyRoomsSold[dateStr] = 0;
        dailyExclusiveSold[dateStr] = 0;
        dailyStandardSold[dateStr] = 0;
        dailyRevenue[dateStr] = 0;
        dailyHasOfficial[dateStr] = false;
        dailyHasKol[dateStr] = false;
      }

      orders.forEach(order => {
        if (!order.check_in_date || !order.check_out_date) return;
        const checkIn = new Date(order.check_in_date);
        const checkOut = new Date(order.check_out_date);
        const nights = Math.max(1, differenceInDays(checkOut, checkIn));

        const orderRooms = orderRoomsMap.get(order.id) || [];

        // 將 order_rooms 拆成 exclusive / standard 兩堆
        let exclusiveQty = 0;
        let standardQty = 0;
        if (orderRooms.length > 0) {
          orderRooms.forEach(or => {
            const isExc = exclusiveRoomTypeIds.has(or.room_type_id);
            if (isExc) exclusiveQty += or.quantity || 1;
            else standardQty += or.quantity || 1;
          });
        } else if (order.room_type_id) {
          // fallback：訂單沒拆 order_rooms
          const isExc = exclusiveRoomTypeIds.has(order.room_type_id);
          if (isExc) exclusiveQty = 1; else standardQty = 1;
        } else {
          standardQty = 1;
        }

        const totalQty = exclusiveQty + standardQty;
        if (totalQty === 0) return;

        // 逐晚累計
        const dailyEntries: { dayType: DayType; dateStr: string }[] = [];
        for (let i = 0; i < nights; i++) {
          const day = addDays(checkIn, i);
          if (format(day, 'yyyy-MM') !== monthKey) continue;
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayType = classifyDay(day, holidaySet);

          // 森山：包棟訂單一筆即視為整館滿房（allCapacity 間），散客則一間一間照算
          const sensanExclusiveFull = isSensan && exclusiveQty > 0;
          // 管理員啟用分流（adminSplit）時，任何包棟訂單一律算 1 棟
          const villaUnitQty = villaAsSingleUnit && exclusiveQty > 0 ? 1 : exclusiveQty;
          const effectiveTotalQty = sensanExclusiveFull
            ? allCapacity
            : (villaAsSingleUnit ? villaUnitQty + standardQty : totalQty);
          const effectiveExclusiveQty = sensanExclusiveFull ? allCapacity : villaUnitQty;
          const effectiveStandardQty = sensanExclusiveFull ? 0 : standardQty;

          if (splitMode) {
            if (effectiveExclusiveQty > 0) {
              buckets.exclusive.soldByType[dayType] += effectiveExclusiveQty;
            }
            if (effectiveStandardQty > 0) {
              buckets.standard.soldByType[dayType] += effectiveStandardQty;
            }
          } else {
            buckets.all.soldByType[dayType] += effectiveTotalQty;
          }
          dailyRoomsSold[dateStr] = (dailyRoomsSold[dateStr] || 0) + effectiveTotalQty;
          dailyExclusiveSold[dateStr] = (dailyExclusiveSold[dateStr] || 0) + effectiveExclusiveQty;
          dailyStandardSold[dateStr] = (dailyStandardSold[dateStr] || 0) + effectiveStandardQty;
          if (order.order_source === 'official_use') dailyHasOfficial[dateStr] = true;
          if (order.order_source === 'kol') dailyHasKol[dateStr] = true;
          dailyEntries.push({ dayType, dateStr });
        }

        // 營業額分攤（hold 與 official_use/業主自帶 均計入；僅 KOL 不計營收）
        if (dailyEntries.length > 0) {
          const isKol = order.order_source === 'kol';
          const isOfficial = order.order_source === 'official_use';
          const orderFinalPrice = isKol ? 0 : (Number(order.final_price) || 0);
          const totalOrderNights = Math.max(1, differenceInDays(checkOut, checkIn));
          const dailyShare = orderFinalPrice / totalOrderNights;

          // 在 split 模式下，依間數比例切分到 exclusive / standard
          const excShare = splitMode && totalQty > 0 ? dailyShare * (exclusiveQty / totalQty) : 0;
          const stdShare = splitMode && totalQty > 0 ? dailyShare * (standardQty / totalQty) : 0;

          dailyEntries.forEach(({ dayType, dateStr }) => {
            if (splitMode) {
              buckets.exclusive.revenueByType[dayType] += excShare;
              buckets.standard.revenueByType[dayType] += stdShare;
            } else {
              buckets.all.revenueByType[dayType] += dailyShare;
            }
            dailyRevenue[dateStr] = (dailyRevenue[dateStr] || 0) + dailyShare;
            if (isOfficial) dailyHasOfficial[dateStr] = true;
          });
        }
      });

      const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
      const dailyDetails: DailyDetail[] = [];
      for (let d = 0; d < daysInMonth; d++) {
        const day = addDays(monthStart, d);
        const dateStr = format(day, 'yyyy-MM-dd');
        const dow = getDay(day);
        const dayType = classifyDay(day, holidaySet);
        const sold = dailyRoomsSold[dateStr] || 0;
        const rev = dailyRevenue[dateStr] || 0;
        dailyDetails.push({
          date: dateStr,
          dayLabel: weekdayLabels[dow],
          dayType,
          roomsSold: sold,
          exclusiveSold: dailyExclusiveSold[dateStr] || 0,
          standardSold: dailyStandardSold[dateStr] || 0,
          revenue: Math.round(rev),
          avgPrice: sold > 0 ? Math.round(rev / sold) : 0,
          hasOfficial: dailyHasOfficial[dateStr] || false,
          hasKol: dailyHasKol[dateStr] || false,
        });
      }

      const buildSegmentRow = (seg: SegmentKey): SegmentRow => {
        const b = buckets[seg];
        const totalAvail = b.availableByType.weekday + b.availableByType.friSun + b.availableByType.holiday;
        const totalSold = b.soldByType.weekday + b.soldByType.friSun + b.soldByType.holiday;
        const totalRev = b.revenueByType.weekday + b.revenueByType.friSun + b.revenueByType.holiday;
        return {
          segment: seg,
          weekday: {
            rooms: b.soldByType.weekday,
            available: b.availableByType.weekday,
            occupancyRate: b.availableByType.weekday > 0 ? (b.soldByType.weekday / b.availableByType.weekday) * 100 : 0,
            revenue: Math.round(b.revenueByType.weekday),
          },
          friSun: {
            rooms: b.soldByType.friSun,
            available: b.availableByType.friSun,
            occupancyRate: b.availableByType.friSun > 0 ? (b.soldByType.friSun / b.availableByType.friSun) * 100 : 0,
            revenue: Math.round(b.revenueByType.friSun),
          },
          holiday: {
            rooms: b.soldByType.holiday,
            available: b.availableByType.holiday,
            occupancyRate: b.availableByType.holiday > 0 ? (b.soldByType.holiday / b.availableByType.holiday) * 100 : 0,
            revenue: Math.round(b.revenueByType.holiday),
          },
          avgOccupancy: totalAvail > 0 ? (totalSold / totalAvail) * 100 : 0,
          totalRevenue: Math.round(totalRev),
          capacityPerDay: segmentCapacity[seg],
        };
      };

      const segments = activeSegments.map(buildSegmentRow);
      const monthTotalRevenue = segments.reduce((s, r) => s + r.totalRevenue, 0);

      monthsWithData.set(monthKey, {
        monthKey,
        label: monthKey,
        segments,
        dailyDetails,
        totalRevenue: monthTotalRevenue,
      });
    }

    const rows = Array.from(monthsWithData.values());

    // 年度合計：對每個 active segment 加總
    type SegTotals = {
      weekdayRooms: number; friSunRooms: number; holidayRooms: number;
      weekdayRevenue: number; friSunRevenue: number; holidayRevenue: number;
      weekdayAvailable: number; friSunAvailable: number; holidayAvailable: number;
      totalRevenue: number;
    };
    const initSegTotals = (): SegTotals => ({
      weekdayRooms: 0, friSunRooms: 0, holidayRooms: 0,
      weekdayRevenue: 0, friSunRevenue: 0, holidayRevenue: 0,
      weekdayAvailable: 0, friSunAvailable: 0, holidayAvailable: 0,
      totalRevenue: 0,
    });

    const segTotalsMap: Record<SegmentKey, SegTotals> = {
      all: initSegTotals(), exclusive: initSegTotals(), standard: initSegTotals(),
    };

    rows.forEach(row => {
      row.segments.forEach(seg => {
        const t = segTotalsMap[seg.segment];
        t.weekdayRooms += seg.weekday.rooms;
        t.friSunRooms += seg.friSun.rooms;
        t.holidayRooms += seg.holiday.rooms;
        t.weekdayRevenue += seg.weekday.revenue;
        t.friSunRevenue += seg.friSun.revenue;
        t.holidayRevenue += seg.holiday.revenue;
        t.weekdayAvailable += seg.weekday.available;
        t.friSunAvailable += seg.friSun.available;
        t.holidayAvailable += seg.holiday.available;
        t.totalRevenue += seg.totalRevenue;
      });
    });

    const buildTotalRow = (seg: SegmentKey): SegmentRow & { segment: SegmentKey } => {
      const t = segTotalsMap[seg];
      const totalAvail = t.weekdayAvailable + t.friSunAvailable + t.holidayAvailable;
      const totalSold = t.weekdayRooms + t.friSunRooms + t.holidayRooms;
      return {
        segment: seg,
        weekday: {
          rooms: t.weekdayRooms, available: t.weekdayAvailable,
          occupancyRate: t.weekdayAvailable > 0 ? (t.weekdayRooms / t.weekdayAvailable) * 100 : 0,
          revenue: t.weekdayRevenue,
        },
        friSun: {
          rooms: t.friSunRooms, available: t.friSunAvailable,
          occupancyRate: t.friSunAvailable > 0 ? (t.friSunRooms / t.friSunAvailable) * 100 : 0,
          revenue: t.friSunRevenue,
        },
        holiday: {
          rooms: t.holidayRooms, available: t.holidayAvailable,
          occupancyRate: t.holidayAvailable > 0 ? (t.holidayRooms / t.holidayAvailable) * 100 : 0,
          revenue: t.holidayRevenue,
        },
        avgOccupancy: totalAvail > 0 ? (totalSold / totalAvail) * 100 : 0,
        totalRevenue: t.totalRevenue,
        capacityPerDay: segmentCapacity[seg],
      };
    };

    const totalsSegments = activeSegments.map(buildTotalRow);
    const grandTotalRevenue = totalsSegments.reduce((s, r) => s + r.totalRevenue, 0);

    return {
      rows,
      totalsSegments,
      grandTotalRevenue,
      splitMode,
      allCapacity,
      exclusiveCap,
      standardCap,
      exclusiveRoomCount,
      standardRoomCount,
      hasStandardCapSetting: dailyRoomCap > 0,
    };
  }, [data, selectedYear]);

  const [showStandard, setShowStandard] = useState(true);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
      </Card>
    );
  }

  if (!tableData || tableData.rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold tracking-tight">住房率與營業分析</CardTitle>
              <p className="text-sm text-muted-foreground font-medium">排除「已取消」訂單</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Hotel className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">暫無住房率數據</p>
              <p className="text-xs mt-1">請新增訂單後查看統計</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { rows: rawRows, totalsSegments: rawTotalsSegments, splitMode, allCapacity, exclusiveCap, standardCap, exclusiveRoomCount, standardRoomCount, hasStandardCapSetting } = tableData;

  const hideStandard = hasStandardCapSetting && !showStandard;
  const filterSegs = <T extends { segment: SegmentKey; totalRevenue: number }>(segs: T[]): T[] =>
    hideStandard ? segs.filter(s => s.segment !== 'standard') : segs;
  const rows = rawRows.map(r => {
    const segments = filterSegs(r.segments);
    const totalRevenue = segments.reduce((s, x) => s + x.totalRevenue, 0);
    return { ...r, segments, totalRevenue };
  });
  const totalsSegments = filterSegs(rawTotalsSegments);
  const grandTotalRevenue = totalsSegments.reduce((s, x) => s + x.totalRevenue, 0);

  const formatRate = (rate: number) => `${(Math.round(rate * 10) / 10).toFixed(1)}%`;
  const getRateColor = (rate: number) => {
    if (rate >= 80) return 'text-red-600 dark:text-red-400 font-bold';
    if (rate >= 50) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    if (rate > 0) return 'text-foreground';
    return 'text-muted-foreground';
  };
  const formatCurrency = (val: number) => val === 0 ? '$0' : `$${val.toLocaleString('zh-TW')}`;

  const segmentBadgeClass = (seg: SegmentKey) =>
    seg === 'exclusive'
      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
      : seg === 'standard'
        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
        : 'bg-muted text-muted-foreground';

  const capacityHeader = splitMode
    ? `包棟 ${exclusiveRoomCount} 棟 + 散客 ${standardRoomCount} 間（分流計算）`
    : `每日定額 ${allCapacity} 間房`;

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold tracking-tight">住房率與營業分析</CardTitle>
            <p className="text-sm text-muted-foreground font-medium">
              {capacityHeader} | 排除「已取消」訂單 | 跨日訂單金額平均分配至每一晚
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasStandardCapSetting && (
              <div className="flex items-center gap-2">
                <Switch
                  id="toggle-show-standard"
                  checked={showStandard}
                  onCheckedChange={setShowStandard}
                />
                <Label htmlFor="toggle-show-standard" className="text-xs text-muted-foreground cursor-pointer">
                  顯示散客
                </Label>
              </div>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Hotel className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="overflow-x-auto -mx-2 sm:-mx-0">
          <Table className={splitMode ? "min-w-[980px]" : "min-w-[900px]"}>
            <TableHeader>
              <TableRow className="border-b-2">
                <TableHead rowSpan={2} className="text-center border-r font-bold bg-muted/50 align-middle w-[100px]">
                  入住月份
                </TableHead>
                {splitMode && (
                  <TableHead rowSpan={2} className="text-center border-r font-bold bg-muted/50 align-middle w-[80px]">
                    類別
                  </TableHead>
                )}
                <TableHead colSpan={3} className="text-center border-r font-bold bg-blue-50 dark:bg-blue-950/30">一到四</TableHead>
                <TableHead colSpan={3} className="text-center border-r font-bold bg-amber-50 dark:bg-amber-950/30">五/日</TableHead>
                <TableHead colSpan={3} className="text-center border-r font-bold bg-red-50 dark:bg-red-950/30">假日</TableHead>
                <TableHead rowSpan={2} className="text-center border-r font-bold bg-muted/50 align-middle w-[100px]">月平均住房率</TableHead>
                <TableHead rowSpan={2} className="text-center font-bold bg-muted/50 align-middle w-[110px]">總金額</TableHead>
              </TableRow>
              <TableRow className="border-b-2">
                <TableHead className="text-center text-xs border-r bg-blue-50/50 dark:bg-blue-950/20 w-[60px]">間數</TableHead>
                <TableHead className="text-center text-xs border-r bg-blue-50/50 dark:bg-blue-950/20 w-[70px]">住房率</TableHead>
                <TableHead className="text-center text-xs border-r bg-blue-50/50 dark:bg-blue-950/20 w-[90px]">訂單金額</TableHead>
                <TableHead className="text-center text-xs border-r bg-amber-50/50 dark:bg-amber-950/20 w-[60px]">間數</TableHead>
                <TableHead className="text-center text-xs border-r bg-amber-50/50 dark:bg-amber-950/20 w-[70px]">住房率</TableHead>
                <TableHead className="text-center text-xs border-r bg-amber-50/50 dark:bg-amber-950/20 w-[90px]">訂單金額</TableHead>
                <TableHead className="text-center text-xs border-r bg-red-50/50 dark:bg-red-950/20 w-[60px]">間數</TableHead>
                <TableHead className="text-center text-xs border-r bg-red-50/50 dark:bg-red-950/20 w-[70px]">住房率</TableHead>
                <TableHead className="text-center text-xs border-r bg-red-50/50 dark:bg-red-950/20 w-[90px]">訂單金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const segCount = row.segments.length;
                return row.segments.map((seg, idx) => (
                  <TableRow key={`${row.monthKey}-${seg.segment}`} className="hover:bg-muted/30">
                    {idx === 0 && (
                      <TableCell rowSpan={segCount} className="text-center font-semibold border-r bg-muted/20 p-0 align-middle">
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button className="w-full h-full px-4 py-2 cursor-pointer hover:text-primary transition-colors underline decoration-dotted underline-offset-4">
                              {row.label}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-[500px] p-0" side="right" align="start">
                            <div className="p-3 border-b bg-muted/30">
                              <p className="font-semibold text-sm">{row.label} 每日營運明細</p>
                            </div>
                            <ScrollArea className="h-[320px]">
                              <Table className="text-xs">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-center py-1.5 px-2 w-[90px]">日期</TableHead>
                                    <TableHead className="text-center py-1.5 px-2 w-[40px]">星期</TableHead>
                                    <TableHead className="text-center py-1.5 px-2 w-[55px]">類別</TableHead>
                                    <TableHead className="text-center py-1.5 px-2 w-[120px] whitespace-nowrap">住房數</TableHead>
                                    <TableHead className="text-center py-1.5 px-2 w-[80px]">營業額</TableHead>
                                    <TableHead className="text-center py-1.5 px-2 w-[70px]">平均房價</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.dailyDetails.map((dd) => {
                                    const dayTypeBg = dd.dayType === 'holiday'
                                      ? 'bg-red-50/50 dark:bg-red-950/20'
                                      : dd.dayType === 'friSun'
                                        ? 'bg-amber-50/50 dark:bg-amber-950/20'
                                        : '';
                                    const dayTypeLabel = dd.dayType === 'holiday' ? '假日' : dd.dayType === 'friSun' ? '五/日' : '平日';
                                    return (
                                      <TableRow key={dd.date} className={dayTypeBg}>
                                        <TableCell className="text-center py-1 px-2">{dd.date.slice(5)}</TableCell>
                                        <TableCell className="text-center py-1 px-2">{dd.dayLabel}</TableCell>
                                        <TableCell className="text-center py-1 px-2">{dayTypeLabel}</TableCell>
                                        <TableCell className="text-center py-1 px-2 font-medium tabular-nums whitespace-nowrap">
                                          {splitMode ? (
                                            <>
                                              <span className="text-purple-600 dark:text-purple-300">{dd.exclusiveSold}/{exclusiveCap}棟</span>
                                              <span className="text-muted-foreground mx-1.5">+</span>
                                              <span className="text-sky-600 dark:text-sky-300">{dd.standardSold}/{standardCap}間</span>
                                            </>
                                          ) : (
                                            <>{dd.roomsSold}/{allCapacity}</>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-center py-1 px-2 tabular-nums">{dd.roomsSold > 0 ? (dd.hasOfficial && dd.revenue === 0 ? <span className="text-amber-600 dark:text-amber-400 font-medium">公務</span> : `$${dd.revenue.toLocaleString('zh-TW')}`) : '-'}</TableCell>
                                        <TableCell className="text-center py-1 px-2 tabular-nums">{dd.roomsSold > 0 ? (dd.hasOfficial && dd.avgPrice === 0 ? <span className="text-amber-600 dark:text-amber-400 font-medium">公務</span> : `$${dd.avgPrice.toLocaleString('zh-TW')}`) : '-'}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                            <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between">
                              <span>合計住房: {row.dailyDetails.reduce((s, d) => s + d.roomsSold, 0)} 間</span>
                              <span>合計營業: ${row.totalRevenue.toLocaleString('zh-TW')}</span>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </TableCell>
                    )}
                    {splitMode && (
                      <TableCell className="text-center border-r p-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${segmentBadgeClass(seg.segment)}`}>
                          {SEGMENT_LABEL[seg.segment]}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-center border-r text-sm">{seg.weekday.rooms}/{seg.weekday.available}</TableCell>
                    <TableCell className={`text-center border-r text-sm ${getRateColor(seg.weekday.occupancyRate)}`}>{formatRate(seg.weekday.occupancyRate)}</TableCell>
                    <TableCell className="text-center border-r text-sm tabular-nums">{formatCurrency(seg.weekday.revenue)}</TableCell>
                    <TableCell className="text-center border-r text-sm">{seg.friSun.rooms}/{seg.friSun.available}</TableCell>
                    <TableCell className={`text-center border-r text-sm ${getRateColor(seg.friSun.occupancyRate)}`}>{formatRate(seg.friSun.occupancyRate)}</TableCell>
                    <TableCell className="text-center border-r text-sm tabular-nums">{formatCurrency(seg.friSun.revenue)}</TableCell>
                    <TableCell className="text-center border-r text-sm">{seg.holiday.rooms}/{seg.holiday.available}</TableCell>
                    <TableCell className={`text-center border-r text-sm ${getRateColor(seg.holiday.occupancyRate)}`}>{formatRate(seg.holiday.occupancyRate)}</TableCell>
                    <TableCell className="text-center border-r text-sm tabular-nums">{formatCurrency(seg.holiday.revenue)}</TableCell>
                    <TableCell className={`text-center border-r text-sm font-semibold ${getRateColor(seg.avgOccupancy)}`}>{formatRate(seg.avgOccupancy)}</TableCell>
                    {idx === 0 && (
                      <TableCell rowSpan={segCount} className="text-center text-sm font-semibold tabular-nums align-middle">
                        {formatCurrency(row.totalRevenue)}
                      </TableCell>
                    )}
                  </TableRow>
                ));
              })}
              {/* 合計 / 平均 */}
              {totalsSegments.map((seg, idx) => (
                <TableRow key={`total-${seg.segment}`} className={`${idx === 0 ? 'border-t-2' : ''} bg-muted/40 font-bold`}>
                  {idx === 0 && (
                    <TableCell rowSpan={totalsSegments.length} className="text-center border-r font-bold align-middle">
                      合計 / 平均
                    </TableCell>
                  )}
                  {splitMode && (
                    <TableCell className="text-center border-r p-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${segmentBadgeClass(seg.segment)}`}>
                        {SEGMENT_LABEL[seg.segment]}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-center border-r">{seg.weekday.rooms}/{seg.weekday.available}</TableCell>
                  <TableCell className={`text-center border-r ${getRateColor(seg.weekday.occupancyRate)}`}>{formatRate(seg.weekday.occupancyRate)}</TableCell>
                  <TableCell className="text-center border-r tabular-nums">{formatCurrency(seg.weekday.revenue)}</TableCell>
                  <TableCell className="text-center border-r">{seg.friSun.rooms}/{seg.friSun.available}</TableCell>
                  <TableCell className={`text-center border-r ${getRateColor(seg.friSun.occupancyRate)}`}>{formatRate(seg.friSun.occupancyRate)}</TableCell>
                  <TableCell className="text-center border-r tabular-nums">{formatCurrency(seg.friSun.revenue)}</TableCell>
                  <TableCell className="text-center border-r">{seg.holiday.rooms}/{seg.holiday.available}</TableCell>
                  <TableCell className={`text-center border-r ${getRateColor(seg.holiday.occupancyRate)}`}>{formatRate(seg.holiday.occupancyRate)}</TableCell>
                  <TableCell className="text-center border-r tabular-nums">{formatCurrency(seg.holiday.revenue)}</TableCell>
                  <TableCell className={`text-center border-r font-bold ${getRateColor(seg.avgOccupancy)}`}>{formatRate(seg.avgOccupancy)}</TableCell>
                  {idx === 0 && (
                    <TableCell rowSpan={totalsSegments.length} className="text-center font-bold tabular-nums align-middle">
                      {formatCurrency(grandTotalRevenue)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 space-y-1 text-xs text-muted-foreground border-t pt-3">
          <p>說明：</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            {splitMode ? (
              <>
                <li>包棟分母：每日 {exclusiveRoomCount} 棟 × 天數；散客分母：每日 {standardRoomCount} 間 × 天數（兩者獨立計算）</li>
                <li>包棟訂單僅佔包棟容量，散客訂單僅佔散客容量；訂單金額依間數比例分流</li>
              </>
            ) : (
              <>
                <li>間數：售出間數 / 當月該類別總可用間數（每日上限 {allCapacity} 間）</li>
                <li>住房率：該類別佔用房間數 ÷ 該類別總供應房間數(天數×{allCapacity}) × 100%</li>
              </>
            )}
            <li>一到四：週一至週四 | 五/日：週五及週日 | 假日：週六、台灣國定假日(含連假補假)</li>
            <li>金額分配：跨日訂單的總金額已平均分配至每一晚</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
