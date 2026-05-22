import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  formatISO,
  isBefore,
  isSameDay,
  startOfMonth,
  startOfToday,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const HAKUNA_ACCOMMODATION_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const SENSAN_ACCOMMODATION_ID = "5f764d55-ae11-4631-80fe-2e611853deae";

interface Props {
  accommodationId: string;
  selectedDate?: Date | null;
  onSelectDate?: (date: Date) => void;
  onAvailabilityComputed?: (info: { dates: Set<string>; minPrice: number | null; earliestDate: string | null }) => void;
}

/**
 * 訂房詳情頁的可訂日曆。
 * 沿用首頁 HeroSection 的可訂判斷規則：
 *  - 森山(嚴格): 任一包區被訂走 OR 散客全部被訂走 → 整天關閉
 *  - 哈庫納(寬鬆): 包棟 ≥2 無庫存 → 整天關閉
 *  - 其他: 任一房型有空即開啟
 * 只顯示「是否可訂」(綠/灰)，不顯示價格。
 */
const VillaAvailabilityCalendar = ({ accommodationId, selectedDate, onSelectDate, onAvailabilityComputed }: Props) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [hasInventory, setHasInventory] = useState<boolean | null>(null);

  const today = useMemo(() => startOfToday(), []);
  const baseMonth = useMemo(() => addMonths(startOfMonth(today), monthOffset), [
    today,
    monthOffset,
  ]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: roomTypes } = await supabase
        .from("room_types")
        .select("id, is_exclusive_package")
        .eq("accommodation_id", accommodationId);

      if (!roomTypes || roomTypes.length === 0) {
        if (!cancelled) setHasInventory(false);
        return;
      }

      const todayStr = formatISO(today, { representation: "date" });
      const endStr = formatISO(endOfMonth(addMonths(today, 11)), {
        representation: "date",
      });

      const { data: inventoryRows } = await supabase
        .from("room_inventory_pricing")
        .select("date, is_available, room_type_id, price")
        .in(
          "room_type_id",
          roomTypes.map((r) => r.id),
        )
        .gte("date", todayStr)
        .lte("date", endStr);

      if (!inventoryRows || inventoryRows.length === 0) {
        if (!cancelled) setHasInventory(false);
        return;
      }

      const allDates = Array.from(new Set(inventoryRows.map((r) => r.date))).sort();

      const adjustedResults = await Promise.all(
        roomTypes.map(async (rt) => {
          const { data } = await supabase.rpc("get_adjusted_room_inventory_batch", {
            p_room_type_id: rt.id,
            p_dates: allDates,
            p_accommodation_id: accommodationId,
          });
          return { roomTypeId: rt.id, rows: (data as any[]) || [] };
        }),
      );

      const adjustedIndex = new Map<
        string,
        { available_rooms: number; is_blocked: boolean }
      >();
      for (const { roomTypeId, rows } of adjustedResults) {
        for (const row of rows) {
          const dateKey = (row as any).date_value ?? (row as any).date;
          if (!dateKey) continue;
          adjustedIndex.set(`${roomTypeId}:${dateKey}`, {
            available_rooms: row.available_rooms ?? 0,
            is_blocked: row.is_blocked === true,
          });
        }
      }

      const baseIndex = new Map<string, { is_available: boolean }>();
      for (const row of inventoryRows) {
        baseIndex.set(`${row.room_type_id}:${row.date}`, {
          is_available: row.is_available !== false,
        });
      }

      const isHakuna = accommodationId === HAKUNA_ACCOMMODATION_ID;
      const isSensan = accommodationId === SENSAN_ACCOMMODATION_ID;
      const packageRoomTypes = roomTypes.filter(
        (rt: any) => rt.is_exclusive_package === true,
      );
      const commonRoomTypes = roomTypes.filter(
        (rt: any) => rt.is_exclusive_package !== true,
      );

      const isRoomAvailable = (rt: any, date: string) => {
        const base = baseIndex.get(`${rt.id}:${date}`);
        if (base && base.is_available === false) return false;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj) return false;
        if (adj.is_blocked) return false;
        return adj.available_rooms > 0;
      };

      const isRoomBookedOut = (rt: any, date: string) => {
        const base = baseIndex.get(`${rt.id}:${date}`);
        if (!base || base.is_available === false) return false;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj) return false;
        return adj.is_blocked || adj.available_rooms <= 0;
      };

      const available = new Set<string>();
      for (const date of allDates) {
        if (isHakuna && packageRoomTypes.length > 0) {
          // 哈庫納（散客房不計入）：
          // 條件1: 任一包棟有訂單（被訂走）→ 整天關閉
          if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) continue;
          // 條件2: 包棟庫存關閉 ≥2 → 整天關閉
          const closedCount = packageRoomTypes.filter((rt) => {
            const base = baseIndex.get(`${rt.id}:${date}`);
            return !base || base.is_available === false;
          }).length;
          if (closedCount >= 2) continue;
          available.add(date);
          continue;
        }
        if (isSensan && packageRoomTypes.length > 0) {
          if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) continue;
          if (
            commonRoomTypes.length > 0 &&
            commonRoomTypes.every((rt) => isRoomBookedOut(rt, date))
          )
            continue;
          available.add(date);
          continue;
        }
        if (roomTypes.some((rt) => isRoomAvailable(rt, date))) available.add(date);
      }

      if (!cancelled) {
        setAvailableDates(available);
        setHasInventory(true);
        // 計算最低價（僅看可訂日期的 price）
        let minPrice: number | null = null;
        let earliestDate: string | null = null;
        const sortedAvail = Array.from(available).sort();
        if (sortedAvail.length > 0) earliestDate = sortedAvail[0];
        for (const row of inventoryRows) {
          if (!available.has(row.date)) continue;
          const p = (row as any).price;
          if (typeof p === "number" && p > 0) {
            if (minPrice == null || p < minPrice) minPrice = p;
          }
        }
        onAvailabilityComputed?.({ dates: available, minPrice, earliestDate });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [accommodationId, today]);

  // 沒有任何庫存資料時直接不顯示（遵循「隱藏空區塊」規則）
  if (hasInventory === false) return null;
  if (hasInventory === null) return null;

  const monthStart = startOfMonth(baseMonth);
  const monthEnd = endOfMonth(baseMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const canPrev = monthOffset > 0;
  const canNext = monthOffset < 5;

  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <section className="px-4 py-4 bg-card border-y border-border/40">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground">即時空房日曆</h2>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/15 border border-emerald-600/50" />
            可訂
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted-foreground/30 border border-muted-foreground/50" />
            已滿
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => canPrev && setMonthOffset((m) => m - 1)}
          disabled={!canPrev}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
          aria-label="上個月"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold text-foreground">
          {format(baseMonth, "yyyy 年 M 月", { locale: zhTW })}
        </div>
        <button
          onClick={() => canNext && setMonthOffset((m) => m + 1)}
          disabled={!canNext}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
          aria-label="下個月"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1 sm:mb-2">
        {weekdayLabels.map((w, i) => (
          <div
            key={w}
            className={cn(
              "text-center text-xs sm:text-sm font-medium py-1",
              i === 0 || i === 6 ? "text-primary/80" : "text-muted-foreground",
            )}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2">
        {days.map((day) => {
          const dateStr = formatISO(day, { representation: "date" });
          const inMonth = day >= monthStart && day <= monthEnd;
          const isPast = isBefore(day, today) && !isSameDay(day, today);
          const isAvail = availableDates.has(dateStr);
          const isToday = isSameDay(day, today);
          const isSelected = !!selectedDate && isSameDay(day, selectedDate);

          if (!inMonth) {
            return <div key={dateStr} className="aspect-square" />;
          }

          const clickable = !isPast && isAvail && !!onSelectDate;

          return (
            <button
              type="button"
              key={dateStr}
              disabled={!clickable}
              onClick={clickable ? () => onSelectDate!(day) : undefined}
              className={cn(
                "relative aspect-square rounded-md flex flex-col items-center justify-center text-sm sm:text-base md:text-lg font-medium border transition-colors",
                isPast
                  ? "bg-transparent text-muted-foreground/30 border-transparent cursor-default"
                  : isAvail
                    ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 border-emerald-600/50 hover:bg-emerald-500/20 active:scale-95"
                    : "bg-muted-foreground/20 text-muted-foreground/70 border-muted-foreground/30 cursor-not-allowed",
                isToday && !isPast && !isSelected && "ring-2 ring-primary/60",
                isSelected && "ring-2 ring-primary bg-primary/15 border-primary",
              )}
              title={
                isPast
                  ? "已過日期"
                  : isAvail
                    ? `${format(day, "M/d")} 可訂`
                    : `${format(day, "M/d")} 已滿`
              }
            >
              <span className={cn(!isPast && !isAvail && "line-through decoration-muted-foreground/60")}>
                {format(day, "d")}
              </span>
              {!isPast && !isAvail && (
                <span className="text-[10px] sm:text-xs md:text-sm leading-none mt-0.5 font-semibold tracking-tight">已滿</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 text-center">
        資料每日同步 · 實際可訂房型請於下方「選擇人數方案」確認
      </p>
    </section>
  );
};

export default VillaAvailabilityCalendar;
