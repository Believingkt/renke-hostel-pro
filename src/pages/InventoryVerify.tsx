import { useState, useMemo } from "react";
import { format, eachDayOfInterval, addDays } from "date-fns";
import { Calendar as CalendarIcon, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

interface InventoryRow {
  room_type_id: string;
  date: string;
  available_rooms: number;
  is_available: boolean;
  price: number;
  pricing_template_id: string | null;
}

interface BookingRow {
  room_type_id: string;
  date: string;
  count: number;
}

interface Cell {
  hasBase: boolean;
  baseAvailable: number;
  isAvailable: boolean;
  price: number;
  booked: number;
  visible: number; // 前台實際可訂
}

export default function InventoryVerify() {
  const { currentAccommodationId } = useAccommodation();
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 6));
  const [loading, setLoading] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomTypeRow[]>([]);
  const [cellMap, setCellMap] = useState<Map<string, Cell>>(new Map());

  const dateList = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [] as string[];
    return eachDayOfInterval({ start: startDate, end: endDate }).map((d) => format(d, "yyyy-MM-dd"));
  }, [startDate, endDate]);

  const handleQuery = async () => {
    if (!currentAccommodationId) {
      toast.error("尚未選擇民宿");
      return;
    }
    if (dateList.length === 0) {
      toast.error("請選擇有效的日期區間");
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
        // 取訂單中已佔用的房（排除取消單）
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

      // 計算每個 room_type + date 被佔用數
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

      const invMap = new Map<string, InventoryRow>();
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
            next.set(key, {
              hasBase: false,
              baseAvailable: 0,
              isAvailable: false,
              price: 0,
              booked,
              visible: 0,
            });
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
      setCellMap(next);
      toast.success(`已查詢 ${loadedRoomTypes.length} 個房型 × ${dateList.length} 天`);
    } catch (e: any) {
      console.error(e);
      toast.error(`查詢失敗：${e?.message || "未知錯誤"}`);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    let totalCells = 0;
    let missingBase = 0;
    let closed = 0;
    let bookable = 0;
    cellMap.forEach((c) => {
      totalCells++;
      if (!c.hasBase) missingBase++;
      else if (!c.isAvailable) closed++;
      else if (c.visible > 0) bookable++;
    });
    return { totalCells, missingBase, closed, bookable };
  }, [cellMap]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="庫存快速驗證"
        description="比對基礎庫存列（pricing_template_id IS NULL）、訂單佔用、與前台實際可售數。"
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1.5 block">起始日</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "yyyy-MM-dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="mb-1.5 block">結束日</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "yyyy-MM-dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-end">
              <Button onClick={handleQuery} disabled={loading} className="w-full">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                查詢
              </Button>
            </div>
          </div>

          {cellMap.size > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">總計 {summary.totalCells} 格</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">可售 {summary.bookable}</Badge>
              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">已關閉 {summary.closed}</Badge>
              <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/15">未建立基礎列 {summary.missingBase}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {cellMap.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">驗證明細</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-3">
              <AlertDescription className="text-xs">
                <strong>前台可售</strong> = <code>is_available</code> 為 true 時的 <code>available_rooms - 已佔用</code>；
                顯示 <span className="text-red-600">無基礎列</span> 代表該日在 DB 沒有 <code>pricing_template_id IS NULL</code> 的列，
                前台會因無庫存而關閉販售。
              </AlertDescription>
            </Alert>
            <div className="overflow-x-auto">
              <Table className="text-sm tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[140px]">房型</TableHead>
                    {dateList.map((d) => (
                      <TableHead key={d} className="text-center min-w-[110px] whitespace-nowrap">
                        {d.slice(5)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roomTypes.map((rt) => (
                    <TableRow key={rt.id}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium">
                        <div>{rt.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {rt.is_exclusive_package ? "包棟/包區" : "一般"} · 房數 {rt.room_count ?? "-"}
                        </div>
                      </TableCell>
                      {dateList.map((d) => {
                        const c = cellMap.get(`${rt.id}_${d}`);
                        if (!c) return <TableCell key={d}>-</TableCell>;
                        return (
                          <TableCell key={d} className="text-center align-top">
                            {!c.hasBase ? (
                              <span className="text-red-600 text-xs">無基礎列</span>
                            ) : !c.isAvailable ? (
                              <span className="text-amber-600 text-xs">關閉販售</span>
                            ) : (
                              <div className="space-y-0.5">
                                <div className={cn("font-semibold", c.visible > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                                  {c.visible}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  庫{c.baseAvailable}/佔{c.booked}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  ${c.price}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
