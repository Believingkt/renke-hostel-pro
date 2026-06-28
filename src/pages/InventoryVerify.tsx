import { useState, useMemo, useEffect } from "react";
import {
  format,
  eachDayOfInterval,
  addDays,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  getDay,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { toast } from "sonner";

interface RoomTypeRow {
  id: string;
  name: string;
  room_count: number | null;
  is_exclusive_package: boolean | null;
}

interface Cell {
  hasBase: boolean;
  baseAvailable: number;
  isAvailable: boolean;
  price: number;
  booked: number;
  visible: number;
}

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default function InventoryVerify() {
  const { currentAccommodationId } = useAccommodation();
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [loading, setLoading] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomTypeRow[]>([]);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [cellMap, setCellMap] = useState<Map<string, Cell>>(new Map());

  const monthStart = monthCursor;
  const monthEnd = endOfMonth(monthCursor);
  const dateList = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }).map((d) => format(d, "yyyy-MM-dd")),
    [monthStart, monthEnd]
  );

  // 建立週曆格（補上月份前的空白格）
  const calendarGrid = useMemo(() => {
    const leadingBlanks = getDay(monthStart);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const cells: (Date | null)[] = Array(leadingBlanks).fill(null).concat(days);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart, monthEnd]);

  const handleQuery = async () => {
    if (!currentAccommodationId) {
      toast.error("尚未選擇民宿");
      return;
    }
    setLoading(true);
    try {
      const startStr = dateList[0];
      const endStr = dateList[dateList.length - 1];

      const [rtRes, invRes, orderRoomsRes] = await Promise.all([
        supabase
          .from("room_types")
          .select("id, name, room_count, is_exclusive_package, display_order")
          .eq("accommodation_id", currentAccommodationId)
          .order("display_order", { ascending: true }),
        supabase
          .from("room_inventory_pricing")
          .select("room_type_id, date, available_rooms, is_available, price, pricing_template_id")
          .gte("date", startStr)
          .lte("date", endStr)
          .is("pricing_template_id", null),
        supabase
          .from("order_rooms")
          .select("room_type_id, quantity, orders!inner(order_status, check_in_date, check_out_date)")
          .gte("orders.check_out_date", startStr)
          .lte("orders.check_in_date", endStr),
      ]);

      if (rtRes.error) throw rtRes.error;
      if (invRes.error) throw invRes.error;
      if (orderRoomsRes.error) throw orderRoomsRes.error;

      const loadedRoomTypes = (rtRes.data || []) as RoomTypeRow[];
      const rtIds = new Set(loadedRoomTypes.map((r) => r.id));

      const bookedMap = new Map<string, number>();
      (orderRoomsRes.data || []).forEach((row: any) => {
        const status = row.orders?.order_status;
        if (status === "cancelled") return;
        if (!rtIds.has(row.room_type_id)) return;
        const ci = new Date(row.orders.check_in_date);
        const co = new Date(row.orders.check_out_date);
        const days = eachDayOfInterval({ start: ci, end: addDays(co, -1) });
        const qty = row.quantity || 1;
        days.forEach((d) => {
          const key = `${row.room_type_id}_${format(d, "yyyy-MM-dd")}`;
          bookedMap.set(key, (bookedMap.get(key) || 0) + qty);
        });
      });

      const invMap = new Map<string, any>();
      (invRes.data || []).forEach((row: any) => {
        if (!rtIds.has(row.room_type_id)) return;
        invMap.set(`${row.room_type_id}_${row.date}`, row);
      });

      const next = new Map<string, Cell>();
      for (const rt of loadedRoomTypes) {
        for (const d of dateList) {
          const key = `${rt.id}_${d}`;
          const inv = invMap.get(key);
          const booked = bookedMap.get(key) || 0;
          if (!inv) {
            next.set(key, { hasBase: false, baseAvailable: 0, isAvailable: false, price: 0, booked, visible: 0 });
          } else {
            const visible = inv.is_available ? Math.max(inv.available_rooms - booked, 0) : 0;
            next.set(key, {
              hasBase: true,
              baseAvailable: inv.available_rooms,
              isAvailable: inv.is_available,
              price: inv.price,
              booked,
              visible,
            });
          }
        }
      }

      setRoomTypes(loadedRoomTypes);
      if (!selectedRoomTypeId && loadedRoomTypes.length > 0) {
        setSelectedRoomTypeId(loadedRoomTypes[0].id);
      } else if (selectedRoomTypeId && !loadedRoomTypes.find((r) => r.id === selectedRoomTypeId)) {
        setSelectedRoomTypeId(loadedRoomTypes[0]?.id || "");
      }
      setCellMap(next);
    } catch (e: any) {
      console.error(e);
      toast.error(`查詢失敗：${e?.message || "未知錯誤"}`);
    } finally {
      setLoading(false);
    }
  };

  // 切換民宿、月份時自動重查
  useEffect(() => {
    if (currentAccommodationId) handleQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId, monthCursor]);

  const currentRoomType = roomTypes.find((r) => r.id === selectedRoomTypeId);

  const monthSummary = useMemo(() => {
    if (!selectedRoomTypeId) return { bookable: 0, full: 0, closed: 0, missing: 0 };
    let bookable = 0, full = 0, closed = 0, missing = 0;
    dateList.forEach((d) => {
      const c = cellMap.get(`${selectedRoomTypeId}_${d}`);
      if (!c) return;
      if (!c.hasBase) missing++;
      else if (!c.isAvailable) closed++;
      else if (c.visible <= 0) full++;
      else bookable++;
    });
    return { bookable, full, closed, missing };
  }, [cellMap, selectedRoomTypeId, dateList]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="庫存快速驗證"
        description="以日曆檢視每日前台可售房數，對照單格設定與訂房前台顯示。"
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <div>
              <Label className="mb-1.5 block">房型</Label>
              <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder={roomTypes.length === 0 ? "查詢中…" : "選擇房型"} />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                      {rt.is_exclusive_package ? "（包棟/包區）" : ""}
                      {rt.room_count != null ? ` · 共 ${rt.room_count} 間` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleQuery} disabled={loading} variant="outline">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                重新查詢
              </Button>
            </div>
          </div>

          {selectedRoomTypeId && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">可售 {monthSummary.bookable}</Badge>
              <Badge className="bg-zinc-200 text-zinc-700 hover:bg-zinc-200">已滿 {monthSummary.full}</Badge>
              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">關閉販售 {monthSummary.closed}</Badge>
              <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/15">未建立基礎列 {monthSummary.missing}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {/* 月份切換 */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setMonthCursor((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-base font-semibold">
              {format(monthCursor, "yyyy 年 M 月")}
              {currentRoomType && (
                <span className="ml-2 text-sm text-muted-foreground font-normal">／ {currentRoomType.name}</span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMonthCursor((m) => addMonths(m, 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* 星期列 */}
          <div className="grid grid-cols-7 gap-2 mb-2 text-center text-sm">
            {WEEK_LABELS.map((w, i) => (
              <div
                key={w}
                className={cn(
                  "py-1 font-medium",
                  i === 0 && "text-orange-500",
                  i === 6 && "text-orange-500",
                  i > 0 && i < 6 && "text-muted-foreground"
                )}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 日曆格 */}
          <div className="grid grid-cols-7 gap-2">
            {calendarGrid.map((d, idx) => {
              if (!d) return <div key={`b-${idx}`} className="aspect-square" />;
              if (!selectedRoomTypeId) {
                return (
                  <div key={idx} className="aspect-square rounded-xl border bg-muted/30 flex items-start justify-start p-2 text-sm text-muted-foreground">
                    {format(d, "d")}
                  </div>
                );
              }
              const c = cellMap.get(`${selectedRoomTypeId}_${format(d, "yyyy-MM-dd")}`);
              const isToday = isSameDay(d, new Date());
              const dayNum = format(d, "d");

              let status: "bookable" | "full" | "closed" | "missing" = "missing";
              if (c?.hasBase) {
                if (!c.isAvailable) status = "closed";
                else if (c.visible <= 0) status = "full";
                else status = "bookable";
              }

              const baseClass = "aspect-square rounded-xl border flex flex-col items-start justify-between p-2 transition";
              const styleByStatus: Record<typeof status, string> = {
                bookable: "border-emerald-300 bg-emerald-50 text-emerald-900",
                full: "border-zinc-200 bg-zinc-100 text-zinc-500",
                closed: "border-amber-200 bg-amber-50 text-amber-700",
                missing: "border-red-200 bg-red-50 text-red-600",
              } as const;

              return (
                <div
                  key={idx}
                  className={cn(
                    baseClass,
                    styleByStatus[status],
                    isToday && "ring-2 ring-primary ring-offset-1"
                  )}
                  title={
                    c
                      ? `庫存 ${c.baseAvailable}／已佔 ${c.booked}／可售 ${c.visible}${c.hasBase ? `／單價 $${c.price}` : ""}`
                      : ""
                  }
                >
                  <div className={cn("text-sm font-medium", status === "full" && "line-through")}>{dayNum}</div>
                  <div className="w-full text-[11px] leading-tight">
                    {status === "bookable" && (
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold leading-none">{c!.visible}</span>
                        <span className="opacity-70">可售</span>
                      </div>
                    )}
                    {status === "full" && <span>已滿</span>}
                    {status === "closed" && <span>關閉</span>}
                    {status === "missing" && <span>未設定</span>}
                    {c?.hasBase && c.price > 0 && (
                      <div className="opacity-70 mt-0.5">${c.price}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <LegendDot className="bg-emerald-50 border-emerald-300" label="可售（數字為剩餘間數）" />
            <LegendDot className="bg-zinc-100 border-zinc-200" label="已滿（庫存被訂滿）" />
            <LegendDot className="bg-amber-50 border-amber-200" label="關閉販售（is_available=false）" />
            <LegendDot className="bg-red-50 border-red-200" label="未建立基礎列" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LegendDot({ className, label }: { className?: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block w-4 h-4 rounded border", className)} />
      <span>{label}</span>
    </div>
  );
}
