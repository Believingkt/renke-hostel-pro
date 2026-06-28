import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatISO,
  isBefore,
  isSameMonth,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const HAKUNA_ACCOMMODATION_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const SENSAN_ACCOMMODATION_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
const STRICT_PACKAGE_ANY_BOOKED_IDS = new Set<string>([
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8",
  "8e3e8866-3cb0-4654-91f3-d9b09a543301",
]);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
}

type RoomType = { id: string; name: string; is_exclusive_package: boolean | null };
type Mode = "all" | "single";

export function AvailabilityCalendarDialog({ open, onOpenChange, accommodationId }: Props) {
  const today = useMemo(() => startOfToday(), []);
  const [monthOffset, setMonthOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("all");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  const baseMonth = useMemo(
    () => addMonths(startOfMonth(today), monthOffset),
    [today, monthOffset],
  );

  // 載入房型
  useEffect(() => {
    if (!open || !accommodationId) return;
    (async () => {
      const { data } = await supabase
        .from("room_types")
        .select("id, name, is_exclusive_package, display_order")
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true });
      const list = (data || []) as RoomType[];
      setRoomTypes(list);
      if (!selectedRoomTypeId && list.length > 0) setSelectedRoomTypeId(list[0].id);
    })();
  }, [open, accommodationId]);

  // 計算可訂日
  useEffect(() => {
    if (!open || !accommodationId) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const rts = roomTypes;
      if (!rts || rts.length === 0) {
        if (!cancelled) {
          setAvailableDates(new Set());
          setLoading(false);
        }
        return;
      }

      const monthStart = startOfMonth(baseMonth);
      const monthEnd = endOfMonth(baseMonth);
      const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
      const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
      const startStr = formatISO(startDate, { representation: "date" });
      const endStr = formatISO(endDate, { representation: "date" });

      const targetRoomTypes =
        mode === "single"
          ? rts.filter((r) => r.id === selectedRoomTypeId)
          : rts;
      if (targetRoomTypes.length === 0) {
        if (!cancelled) {
          setAvailableDates(new Set());
          setLoading(false);
        }
        return;
      }

      type InventoryRow = {
        date: string;
        is_available: boolean | null;
        room_type_id: string;
      };
      const inventoryRows: InventoryRow[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (!cancelled) {
        const { data: page } = await supabase
          .from("room_inventory_pricing")
          .select("date, is_available, room_type_id")
          .in("room_type_id", targetRoomTypes.map((r) => r.id))
          .gte("date", startStr)
          .lte("date", endStr)
          .order("date", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (!page || page.length === 0) break;
        inventoryRows.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const allDates = eachDayOfInterval({ start: startDate, end: endDate }).map((d) =>
        formatISO(d, { representation: "date" }),
      );

      const adjustedResults = await Promise.all(
        targetRoomTypes.map(async (rt) => {
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
      const packageRoomTypes = targetRoomTypes.filter((rt) => rt.is_exclusive_package === true);
      const commonRoomTypes = targetRoomTypes.filter((rt) => rt.is_exclusive_package !== true);

      const isRoomAvailable = (rt: RoomType, date: string) => {
        const base = baseIndex.get(`${rt.id}:${date}`);
        if (base && base.is_available === false) return false;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj) return false;
        if (adj.is_blocked) return false;
        return adj.available_rooms > 0;
      };
      const isRoomBookedOut = (rt: RoomType, date: string) => {
        const base = baseIndex.get(`${rt.id}:${date}`);
        if (!base || base.is_available === false) return false;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj) return false;
        return adj.is_blocked || adj.available_rooms <= 0;
      };

      const available = new Set<string>();
      for (const date of allDates) {
        // 單一房型模式：直接看該房型是否可訂
        if (mode === "single") {
          if (targetRoomTypes.some((rt) => isRoomAvailable(rt, date))) available.add(date);
          continue;
        }
        // 全館模式：沿用前台規則
        if (isHakuna && packageRoomTypes.length > 0) {
          if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) continue;
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
        if (STRICT_PACKAGE_ANY_BOOKED_IDS.has(accommodationId) && packageRoomTypes.length > 0) {
          if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) continue;
          if (packageRoomTypes.some((rt) => isRoomAvailable(rt, date))) available.add(date);
          continue;
        }
        if (targetRoomTypes.some((rt) => isRoomAvailable(rt, date))) available.add(date);
      }

      if (!cancelled) {
        setAvailableDates(available);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, accommodationId, baseMonth, mode, selectedRoomTypeId, roomTypes]);

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  const monthStart = startOfMonth(baseMonth);
  const monthEnd = endOfMonth(baseMonth);
  const gridDays = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>可訂日曆檢視</DialogTitle>
          <DialogDescription>
            沿用前台訂房頁可訂判斷邏輯（含包棟/散客規則）。灰色「已滿」=當日不可訂。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全館合計</SelectItem>
              <SelectItem value="single">單一房型</SelectItem>
            </SelectContent>
          </Select>
          {mode === "single" && (
            <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="選擇房型" />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMonthOffset((v) => v - 1)}
              aria-label="上個月"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[110px] text-center font-semibold">
              {format(baseMonth, "yyyy 年 M 月", { locale: zhTW })}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMonthOffset((v) => v + 1)}
              aria-label="下個月"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "text-center text-sm py-1",
                  i === 0 && "text-orange-500",
                  i === 6 && "text-orange-500",
                  i !== 0 && i !== 6 && "text-muted-foreground",
                )}
              >
                {d}
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-7 gap-1">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-md">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {gridDays.map((day) => {
              const inMonth = isSameMonth(day, baseMonth);
              const isPast = isBefore(day, today);
              const dateStr = formatISO(day, { representation: "date" });
              const isAvail = availableDates.has(dateStr);

              if (!inMonth) {
                return <div key={dateStr} className="aspect-square" />;
              }
              const dayNum = day.getDate();
              const showFull = !isAvail && !isPast;

              return (
                <div
                  key={dateStr}
                  className={cn(
                    "aspect-square rounded-lg border flex flex-col items-center justify-center text-sm select-none",
                    isPast && "border-muted bg-muted/30 text-muted-foreground/50",
                    !isPast && isAvail && "border-emerald-300 bg-emerald-50 text-emerald-900",
                    !isPast && !isAvail && "border-muted bg-muted text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "leading-tight",
                      showFull && "line-through",
                    )}
                  >
                    {dayNum}
                  </div>
                  {showFull && (
                    <div className="text-[11px] mt-0.5">已滿</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
