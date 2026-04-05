import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, getDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Hotel } from 'lucide-react';
import { buildPricingMap, type PricingMap } from '@/utils/revenueByMonth';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OccupancyRevenueTableProps {
  accommodationId: string;
  selectedYear: number;
}

interface DayTypeStats {
  rooms: number;       // 間數 (room-nights sold)
  available: number;   // 當月該類別總可用房晚
  occupancyRate: number; // 住房率
  revenue: number;     // 訂單金額
}

interface DailyDetail {
  date: string;        // yyyy-MM-dd
  dayLabel: string;    // 一, 二, ... 日
  dayType: DayType;
  roomsSold: number;
  revenue: number;
  avgPrice: number;    // revenue / roomsSold (or 0)
}

interface MonthRow {
  monthKey: string;     // yyyy-MM
  label: string;        // 2026-01
  weekday: DayTypeStats;  // 一到四
  friSun: DayTypeStats;   // 五/日
  holiday: DayTypeStats;  // 假日
  avgOccupancy: number;   // 月平均住房率
  totalRevenue: number;   // 總金額
  dailyDetails: DailyDetail[];
}

type DayType = 'weekday' | 'friSun' | 'holiday';

/**
 * Classify a date into day type.
 * - holiday: Saturday + public holidays + 補假
 * - friSun: Friday, Sunday (unless it's a public holiday)
 * - weekday: Mon-Thu (unless it's a public holiday)
 */
function classifyDay(date: Date, holidaySet: Set<string>): DayType {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dow = getDay(date); // 0=Sun, 1=Mon, ..., 6=Sat

  // Public holidays always count as 假日
  if (holidaySet.has(dateStr)) return 'holiday';

  // Saturday is always 假日
  if (dow === 6) return 'holiday';

  // Friday and Sunday are 五/日
  if (dow === 5 || dow === 0) return 'friSun';

  // Mon-Thu are weekday
  return 'weekday';
}

/**
 * Pick the daily price based on meal plan
 */
function pickDailyPrice(
  inv: { price: number; price_2_meals: number | null; price_3_meals: number | null },
  mealPlan: string | null
): number {
  if (mealPlan === '3_meals' || mealPlan === '三餐') return inv.price_3_meals ?? inv.price;
  if (mealPlan === '2_meals' || mealPlan === '二餐' || mealPlan === '兩餐') return inv.price_2_meals ?? inv.price;
  return inv.price;
}

export const OccupancyRevenueTable = ({ accommodationId, selectedYear }: OccupancyRevenueTableProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ['occupancy-revenue-table', accommodationId, selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear - 1}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      const [roomTypesRes, ordersRes, holidaysRes] = await Promise.all([
        supabase.from('room_types').select('id, name, room_count, is_exclusive_package').eq('accommodation_id', accommodationId),
        supabase.from('orders')
          .select('id, check_in_date, check_out_date, room_type_id, final_price, meal_plan, order_status')
          .eq('accommodation_id', accommodationId)
          .in('order_status', ['confirmed'])
          .or(`check_in_date.lte.${endDate},check_out_date.gte.${startDate}`)
          .limit(5000),
        supabase.from('public_holidays')
          .select('holiday_date, holiday_type')
          .eq('accommodation_id', accommodationId)
          .gte('holiday_date', startDate)
          .lte('holiday_date', endDate),
      ]);

      if (roomTypesRes.error) throw roomTypesRes.error;
      if (ordersRes.error) throw ordersRes.error;

      // Fetch inventory pricing
      const roomTypeIds = (roomTypesRes.data || []).map(rt => rt.id);
      let inventoryData: any[] = [];
      if (roomTypeIds.length > 0) {
        const { data: inv } = await supabase
          .from('room_inventory_pricing')
          .select('room_type_id, date, price, price_2_meals, price_3_meals')
          .in('room_type_id', roomTypeIds)
          .gte('date', startDate)
          .lte('date', endDate)
          .limit(10000);
        inventoryData = inv || [];
      }

      return {
        roomTypes: roomTypesRes.data || [],
        orders: ordersRes.data || [],
        holidays: holidaysRes.data || [],
        inventoryData,
      };
    },
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000,
  });

  const tableData = useMemo(() => {
    if (!data) return null;

    const { roomTypes, orders, holidays, inventoryData } = data;
    const DAILY_ROOM_CAP = 6;
    const totalRoomCount = Math.min(roomTypes.reduce((sum, rt) => sum + (rt.room_count || 0), 0), DAILY_ROOM_CAP);
    const exclusiveRoomTypeIds = new Set(roomTypes.filter(rt => rt.is_exclusive_package).map(rt => rt.id));
    if (totalRoomCount === 0) return null;

    const pricingMap = buildPricingMap(inventoryData);

    // Build holiday set
    const holidaySet = new Set<string>();
    holidays.forEach(h => holidaySet.add(h.holiday_date));

    // Count available days by type for each month
    const monthsWithData = new Map<string, MonthRow>();

    // Iterate through all 12 months of selectedYear
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(selectedYear, month, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const daysInMonth = monthEnd.getDate();

      // Count days by type in this month
      const dayTypeCounts: Record<DayType, number> = { weekday: 0, friSun: 0, holiday: 0 };
      for (let d = 0; d < daysInMonth; d++) {
        const day = addDays(monthStart, d);
        const type = classifyDay(day, holidaySet);
        dayTypeCounts[type]++;
      }

      // Available room-nights by type
      const availableByType: Record<DayType, number> = {
        weekday: dayTypeCounts.weekday * totalRoomCount,
        friSun: dayTypeCounts.friSun * totalRoomCount,
        holiday: dayTypeCounts.holiday * totalRoomCount,
      };

      // Sold room-nights and revenue by type
      const soldByType: Record<DayType, number> = { weekday: 0, friSun: 0, holiday: 0 };
      const revenueByType: Record<DayType, number> = { weekday: 0, friSun: 0, holiday: 0 };

      // For each order, iterate through stay nights
      orders.forEach(order => {
        if (!order.check_in_date || !order.check_out_date) return;
        const checkIn = new Date(order.check_in_date);
        const checkOut = new Date(order.check_out_date);
        const nights = Math.max(1, differenceInDays(checkOut, checkIn));
        const isExclusive = order.room_type_id ? exclusiveRoomTypeIds.has(order.room_type_id) : false;
        const roomNightsPerDay = isExclusive ? DAILY_ROOM_CAP : 1;

        // Collect daily prices for proportional revenue split
        const dailyEntries: { dayType: DayType; price: number }[] = [];
        let totalPrice = 0;
        let hasInventory = false;

        for (let i = 0; i < nights; i++) {
          const day = addDays(checkIn, i);
          const dayMonth = format(day, 'yyyy-MM');
          if (dayMonth !== monthKey) continue; // only count nights in this month

          const dayType = classifyDay(day, holidaySet);
          soldByType[dayType] += roomNightsPerDay;

          let dailyPrice = 0;
          if (order.room_type_id) {
            const dateStr = format(day, 'yyyy-MM-dd');
            const inv = pricingMap.get(`${order.room_type_id}_${dateStr}`);
            if (inv) {
              dailyPrice = pickDailyPrice(inv, order.meal_plan ?? null);
              hasInventory = true;
            }
          }
          dailyEntries.push({ dayType, price: dailyPrice });
          totalPrice += dailyPrice;
        }

        // Split revenue proportionally
        if (dailyEntries.length > 0) {
          const orderFinalPrice = Number(order.final_price) || 0;
          // Calculate total order nights for fallback
          const totalOrderNights = Math.max(1, differenceInDays(checkOut, checkIn));

          if (hasInventory && totalPrice > 0) {
            // Proportional split based on inventory prices
            // But we need total inventory price across ALL nights (not just this month)
            // For simplicity, use equal distribution based on final_price / total nights
            const dailyShare = orderFinalPrice / totalOrderNights;
            dailyEntries.forEach(({ dayType }) => {
              revenueByType[dayType] += dailyShare;
            });
          } else {
            const dailyShare = orderFinalPrice / totalOrderNights;
            dailyEntries.forEach(({ dayType }) => {
              revenueByType[dayType] += dailyShare;
            });
          }
        }
      });

      const totalAvailable = availableByType.weekday + availableByType.friSun + availableByType.holiday;
      const totalSold = soldByType.weekday + soldByType.friSun + soldByType.holiday;

      monthsWithData.set(monthKey, {
        monthKey,
        label: monthKey,
        weekday: {
          rooms: soldByType.weekday,
          available: availableByType.weekday,
          occupancyRate: availableByType.weekday > 0 ? (soldByType.weekday / availableByType.weekday) * 100 : 0,
          revenue: Math.round(revenueByType.weekday),
        },
        friSun: {
          rooms: soldByType.friSun,
          available: availableByType.friSun,
          occupancyRate: availableByType.friSun > 0 ? (soldByType.friSun / availableByType.friSun) * 100 : 0,
          revenue: Math.round(revenueByType.friSun),
        },
        holiday: {
          rooms: soldByType.holiday,
          available: availableByType.holiday,
          occupancyRate: availableByType.holiday > 0 ? (soldByType.holiday / availableByType.holiday) * 100 : 0,
          revenue: Math.round(revenueByType.holiday),
        },
        avgOccupancy: totalAvailable > 0 ? (totalSold / totalAvailable) * 100 : 0,
        totalRevenue: Math.round(revenueByType.weekday + revenueByType.friSun + revenueByType.holiday),
      });
    }

    // Show all 12 months regardless of whether they have orders
    const rows = Array.from(monthsWithData.values());

    // Compute totals
    const totals = rows.reduce(
      (acc, r) => ({
        weekdayRooms: acc.weekdayRooms + r.weekday.rooms,
        friSunRooms: acc.friSunRooms + r.friSun.rooms,
        holidayRooms: acc.holidayRooms + r.holiday.rooms,
        weekdayRevenue: acc.weekdayRevenue + r.weekday.revenue,
        friSunRevenue: acc.friSunRevenue + r.friSun.revenue,
        holidayRevenue: acc.holidayRevenue + r.holiday.revenue,
        totalRevenue: acc.totalRevenue + r.totalRevenue,
      }),
      { weekdayRooms: 0, friSunRooms: 0, holidayRooms: 0, weekdayRevenue: 0, friSunRevenue: 0, holidayRevenue: 0, totalRevenue: 0 }
    );

    // Compute average occupancy rates across all months for totals
    // Use total room-nights sold / total available room-nights for the year
    let totalWeekdayAvailable = 0, totalFriSunAvailable = 0, totalHolidayAvailable = 0;
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(selectedYear, month, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const daysInMonth = monthEnd.getDate();
      for (let d = 0; d < daysInMonth; d++) {
        const day = addDays(monthStart, d);
        const type = classifyDay(day, holidaySet);
        if (type === 'weekday') totalWeekdayAvailable += totalRoomCount;
        else if (type === 'friSun') totalFriSunAvailable += totalRoomCount;
        else totalHolidayAvailable += totalRoomCount;
      }
    }

    const totalAllAvailable = totalWeekdayAvailable + totalFriSunAvailable + totalHolidayAvailable;
    const totalAllSold = totals.weekdayRooms + totals.friSunRooms + totals.holidayRooms;

    return {
      rows,
      totals: {
        ...totals,
        weekdayAvailable: totalWeekdayAvailable,
        friSunAvailable: totalFriSunAvailable,
        holidayAvailable: totalHolidayAvailable,
        weekdayOccupancy: totalWeekdayAvailable > 0 ? (totals.weekdayRooms / totalWeekdayAvailable) * 100 : 0,
        friSunOccupancy: totalFriSunAvailable > 0 ? (totals.friSunRooms / totalFriSunAvailable) * 100 : 0,
        holidayOccupancy: totalHolidayAvailable > 0 ? (totals.holidayRooms / totalHolidayAvailable) * 100 : 0,
        avgOccupancy: totalAllAvailable > 0 ? (totalAllSold / totalAllAvailable) * 100 : 0,
        totalRevenue: totals.totalRevenue,
      },
      totalRoomCount,
    };
  }, [data, selectedYear]);

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
              <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                住房率與營業分析
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                每日定額 {tableData?.totalRoomCount || '—'} 間房 | 排除「已取消」訂單
              </p>
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

  const { rows, totals, totalRoomCount } = tableData;

  const formatRate = (rate: number) => {
    const rounded = Math.round(rate * 10) / 10;
    return `${rounded.toFixed(1)}%`;
  };

  const getRateColor = (rate: number) => {
    if (rate >= 80) return 'text-red-600 dark:text-red-400 font-bold';
    if (rate >= 50) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    if (rate > 0) return 'text-foreground';
    return 'text-muted-foreground';
  };

  const formatCurrency = (val: number) => {
    if (val === 0) return '$0';
    return `$${val.toLocaleString('zh-TW')}`;
  };

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              住房率與營業分析
            </CardTitle>
            <p className="text-sm text-muted-foreground font-medium">
              每日定額 {totalRoomCount} 間房 | 排除「已取消」訂單 | 跨日訂單金額平均分配至每一晚
            </p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Hotel className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="overflow-x-auto -mx-2 sm:-mx-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="border-b-2">
                <TableHead rowSpan={2} className="text-center border-r font-bold bg-muted/50 align-middle w-[100px]">
                  入住月份
                </TableHead>
                <TableHead colSpan={3} className="text-center border-r font-bold bg-blue-50 dark:bg-blue-950/30">
                  一到四
                </TableHead>
                <TableHead colSpan={3} className="text-center border-r font-bold bg-amber-50 dark:bg-amber-950/30">
                  五/日
                </TableHead>
                <TableHead colSpan={3} className="text-center border-r font-bold bg-red-50 dark:bg-red-950/30">
                  假日
                </TableHead>
                <TableHead rowSpan={2} className="text-center border-r font-bold bg-muted/50 align-middle w-[100px]">
                  月平均住房率
                </TableHead>
                <TableHead rowSpan={2} className="text-center font-bold bg-muted/50 align-middle w-[110px]">
                  總金額
                </TableHead>
              </TableRow>
              <TableRow className="border-b-2">
                {/* 一到四 sub-headers */}
                <TableHead className="text-center text-xs border-r bg-blue-50/50 dark:bg-blue-950/20 w-[60px]">間數</TableHead>
                <TableHead className="text-center text-xs border-r bg-blue-50/50 dark:bg-blue-950/20 w-[70px]">住房率</TableHead>
                <TableHead className="text-center text-xs border-r bg-blue-50/50 dark:bg-blue-950/20 w-[90px]">訂單金額</TableHead>
                {/* 五/日 sub-headers */}
                <TableHead className="text-center text-xs border-r bg-amber-50/50 dark:bg-amber-950/20 w-[60px]">間數</TableHead>
                <TableHead className="text-center text-xs border-r bg-amber-50/50 dark:bg-amber-950/20 w-[70px]">住房率</TableHead>
                <TableHead className="text-center text-xs border-r bg-amber-50/50 dark:bg-amber-950/20 w-[90px]">訂單金額</TableHead>
                {/* 假日 sub-headers */}
                <TableHead className="text-center text-xs border-r bg-red-50/50 dark:bg-red-950/20 w-[60px]">間數</TableHead>
                <TableHead className="text-center text-xs border-r bg-red-50/50 dark:bg-red-950/20 w-[70px]">住房率</TableHead>
                <TableHead className="text-center text-xs border-r bg-red-50/50 dark:bg-red-950/20 w-[90px]">訂單金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.monthKey} className="hover:bg-muted/30">
                  <TableCell className="text-center font-semibold border-r bg-muted/20">{row.label}</TableCell>
                  {/* 一到四 */}
                  <TableCell className="text-center border-r text-sm">{row.weekday.rooms}/{row.weekday.available}</TableCell>
                  <TableCell className={`text-center border-r text-sm ${getRateColor(row.weekday.occupancyRate)}`}>
                    {formatRate(row.weekday.occupancyRate)}
                  </TableCell>
                  <TableCell className="text-center border-r text-sm tabular-nums">{formatCurrency(row.weekday.revenue)}</TableCell>
                  {/* 五/日 */}
                  <TableCell className="text-center border-r text-sm">{row.friSun.rooms}/{row.friSun.available}</TableCell>
                  <TableCell className={`text-center border-r text-sm ${getRateColor(row.friSun.occupancyRate)}`}>
                    {formatRate(row.friSun.occupancyRate)}
                  </TableCell>
                  <TableCell className="text-center border-r text-sm tabular-nums">{formatCurrency(row.friSun.revenue)}</TableCell>
                  {/* 假日 */}
                  <TableCell className="text-center border-r text-sm">{row.holiday.rooms}/{row.holiday.available}</TableCell>
                  <TableCell className={`text-center border-r text-sm ${getRateColor(row.holiday.occupancyRate)}`}>
                    {formatRate(row.holiday.occupancyRate)}
                  </TableCell>
                  <TableCell className="text-center border-r text-sm tabular-nums">{formatCurrency(row.holiday.revenue)}</TableCell>
                  {/* 月平均住房率 */}
                  <TableCell className={`text-center border-r text-sm font-semibold ${getRateColor(row.avgOccupancy)}`}>
                    {formatRate(row.avgOccupancy)}
                  </TableCell>
                  {/* 總金額 */}
                  <TableCell className="text-center text-sm font-semibold tabular-nums">{formatCurrency(row.totalRevenue)}</TableCell>
                </TableRow>
              ))}
              {/* 合計/平均 row */}
              <TableRow className="border-t-2 bg-muted/40 font-bold">
                <TableCell className="text-center border-r font-bold">合計 / 平均</TableCell>
                <TableCell className="text-center border-r">{totals.weekdayRooms}/{totals.weekdayAvailable}</TableCell>
                <TableCell className={`text-center border-r ${getRateColor(totals.weekdayOccupancy)}`}>
                  {formatRate(totals.weekdayOccupancy)}
                </TableCell>
                <TableCell className="text-center border-r tabular-nums">{formatCurrency(totals.weekdayRevenue)}</TableCell>
                <TableCell className="text-center border-r">{totals.friSunRooms}/{totals.friSunAvailable}</TableCell>
                <TableCell className={`text-center border-r ${getRateColor(totals.friSunOccupancy)}`}>
                  {formatRate(totals.friSunOccupancy)}
                </TableCell>
                <TableCell className="text-center border-r tabular-nums">{formatCurrency(totals.friSunRevenue)}</TableCell>
                <TableCell className="text-center border-r">{totals.holidayRooms}/{totals.holidayAvailable}</TableCell>
                <TableCell className={`text-center border-r ${getRateColor(totals.holidayOccupancy)}`}>
                  {formatRate(totals.holidayOccupancy)}
                </TableCell>
                <TableCell className="text-center border-r tabular-nums">{formatCurrency(totals.holidayRevenue)}</TableCell>
                <TableCell className={`text-center border-r font-bold ${getRateColor(totals.avgOccupancy)}`}>
                  {formatRate(totals.avgOccupancy)}
                </TableCell>
                <TableCell className="text-center font-bold tabular-nums">{formatCurrency(totals.totalRevenue)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* 說明 */}
        <div className="mt-4 space-y-1 text-xs text-muted-foreground border-t pt-3">
          <p>說明：</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>間數：售出間數 / 當月該類別總可用間數（每日上限 {totalRoomCount} 間）</li>
            <li>住房率：該類別佔用房間數 ÷ 該類別總供應房間數(天數×{totalRoomCount}) × 100%</li>
            <li>一到四：週一至週四 | 五/日：週五及週日 | 假日：週六、台灣國定假日(含連假補假)</li>
            <li>金額分配：跨日訂單的總金額已平均分配至每一晚</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
