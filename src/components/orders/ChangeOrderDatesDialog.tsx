import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Loader2 } from "lucide-react";
import {
  format,
  parseISO,
  startOfToday,
  addDays,
  addMonths,
  endOfMonth,
  formatISO,
  eachDayOfInterval,
  startOfMonth,
  isSameDay,
  isWithinInterval,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { KolQuotaConfirmDialog } from "./KolQuotaConfirmDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: {
    id: string;
    order_number: string;
    order_source: string;
    payment_status: string;
    check_in_date: string;
    check_out_date: string;
    accommodation_id: string;
  };
  mode: "kol" | "general";
  onSuccess?: () => void;
}

type Capacity = { available: number; total: number };

/** 抓取指定民宿在 [start, end] 區間、依全部房型加總後的每日可訂/總房數 */
async function loadCapacityMap(
  accommodationId: string,
  start: Date,
  end: Date,
): Promise<Map<string, Capacity>> {
  const startStr = formatISO(start, { representation: "date" });
  const endStr = formatISO(end, { representation: "date" });

  const { data: rts } = await supabase
    .from("room_types")
    .select("id, is_exclusive_package, room_count")
    .eq("accommodation_id", accommodationId);
  const roomTypes = (rts || []) as Array<{ id: string; is_exclusive_package: boolean | null; room_count: number | null }>;
  if (roomTypes.length === 0) return new Map();

  const { data: acc } = await supabase
    .from("accommodation_info")
    .select("package_inventory_as_one")
    .eq("id", accommodationId)
    .maybeSingle();
  const pkgAsOne = (acc as any)?.package_inventory_as_one === true;

  const baseIndex = new Map<string, boolean>();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("room_inventory_pricing")
        .select("date, is_available, room_type_id")
        .in("room_type_id", roomTypes.map((r) => r.id))
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true })
        .range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      for (const row of page as any[]) {
        baseIndex.set(`${row.room_type_id}:${row.date}`, row.is_available !== false);
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }

  const allDates = eachDayOfInterval({ start, end }).map((d) => formatISO(d, { representation: "date" }));

  const adjustedIndex = new Map<string, { available_rooms: number; is_blocked: boolean }>();
  await Promise.all(
    roomTypes.map(async (rt) => {
      const { data } = await supabase.rpc("get_adjusted_room_inventory_batch", {
        p_room_type_id: rt.id,
        p_dates: allDates,
        p_accommodation_id: accommodationId,
      });
      for (const row of ((data as any[]) || [])) {
        const dateKey = row.date_value ?? row.date;
        if (!dateKey) continue;
        adjustedIndex.set(`${rt.id}:${dateKey}`, {
          available_rooms: row.available_rooms ?? 0,
          is_blocked: row.is_blocked === true,
        });
      }
    }),
  );

  const totalRooms = roomTypes.reduce((s, rt) => {
    const isPkg = rt.is_exclusive_package === true;
    return s + (pkgAsOne && isPkg ? 1 : (rt.room_count ?? 1));
  }, 0);

  const map = new Map<string, Capacity>();
  for (const date of allDates) {
    let avail = 0;
    for (const rt of roomTypes) {
      const baseOk = baseIndex.get(`${rt.id}:${date}`);
      if (baseOk === false) continue;
      const adj = adjustedIndex.get(`${rt.id}:${date}`);
      if (!adj || adj.is_blocked) continue;
      const raw = Math.max(0, adj.available_rooms || 0);
      const isPkg = rt.is_exclusive_package === true;
      avail += pkgAsOne && isPkg ? Math.min(1, raw) : raw;
    }
    map.set(date, { available: avail, total: totalRooms });
  }
  return map;
}

function toneClass(cap: Capacity | undefined, isPast: boolean): string {
  if (isPast) return "text-muted-foreground/40";
  if (!cap || cap.total === 0) return "";
  if (cap.available <= 0) return "bg-muted text-muted-foreground";
  const ratio = cap.available / cap.total;
  if (ratio < 0.25) return "bg-red-50 text-red-700";
  if (ratio < 0.6) return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-900";
}

/** 內嵌 Range 日曆，避免 Popover 遮擋其他欄位 */
function InventoryRangeCalendar({
  checkIn,
  checkOut,
  onChange,
  capacityMap,
  loading,
  minDate,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  capacityMap: Map<string, Capacity>;
  loading: boolean;
  minDate: Date;
}) {
  const [month, setMonth] = useState<Date>(checkIn ? parseISO(checkIn) : startOfToday());
  const inDate = checkIn ? parseISO(checkIn) : undefined;
  const outDate = checkOut ? parseISO(checkOut) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const iso = formatISO(date, { representation: "date" });
    // 若尚未選擇入住日，或已同時有兩個日期 → 重新從入住日開始
    if (!inDate || (inDate && outDate)) {
      onChange(iso, "");
      return;
    }
    // 已有入住日、還沒選退房日
    if (date <= inDate) {
      // 點到入住日之前或當天 → 把它當作新的入住日
      onChange(iso, "");
      return;
    }
    onChange(checkIn, iso);
  };

  return (
    <div className="relative rounded-lg border bg-card">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <Calendar
        mode="single"
        selected={inDate}
        month={month}
        onMonthChange={setMonth}
        showOutsideDays={false}
        onSelect={handleSelect}
        disabled={(date) => {
          if (date < minDate) return true;
          // 若尚未選擇入住日或已完整選好 → 該日需有庫存
          const needCapacity = !inDate || (!!inDate && !!outDate);
          if (needCapacity) {
            const key = formatISO(date, { representation: "date" });
            const cap = capacityMap.get(key);
            if (cap && cap.available <= 0) return true;
          }
          return false;
        }}
        locale={zhTW}
        className="p-2 sm:p-3 pointer-events-auto w-full [&_table]:w-full [&_.rdp-cell]:p-0 [&_.rdp-head_cell]:font-normal [&_.rdp-head_cell]:text-[11px] [&_.rdp-head_cell]:text-muted-foreground"
        classNames={{
          months: "flex flex-col w-full",
          month: "space-y-2 w-full",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-sm font-medium",
          table: "w-full border-collapse",
          head_row: "flex w-full",
          head_cell: "flex-1 text-center",
          row: "flex w-full mt-1",
          cell: "flex-1 text-center relative",
          day: "h-10 sm:h-12 w-full p-0 font-normal aria-selected:opacity-100",
          day_selected: "!bg-transparent",
          day_today: "",
        }}
        components={{
          DayContent: ({ date }) => {
            const key = formatISO(date, { representation: "date" });
            const cap = capacityMap.get(key);
            const isPast = date < minDate;
            const isCheckIn = inDate && isSameDay(date, inDate);
            const isCheckOut = outDate && isSameDay(date, outDate);
            const inRange =
              inDate && outDate && isWithinInterval(date, { start: inDate, end: outDate });
            return (
              <div
                className={cn(
                  "flex h-9 sm:h-11 w-full flex-col items-center justify-center rounded-md transition-colors",
                  toneClass(cap, isPast),
                  inRange && !isCheckIn && !isCheckOut && "ring-1 ring-primary/40",
                  (isCheckIn || isCheckOut) && "!bg-primary !text-primary-foreground ring-2 ring-primary",
                )}
              >
                <span className="leading-none font-medium text-[12px] sm:text-[13px]">
                  {date.getDate()}
                </span>
                {!isPast && cap && cap.total > 0 && (
                  <span className="text-[9px] sm:text-[10px] mt-0.5 tabular-nums leading-none opacity-80">
                    {cap.available <= 0 ? "滿" : cap.total >= 2 ? `${cap.available}/${cap.total}` : "可"}
                  </span>
                )}
              </div>
            );
          },
        }}
        weekStartsOn={0}
      />
      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-200" />充足</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200" />普通</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-red-50 border border-red-200" />緊張</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-muted border" />已滿</span>
        <span className="ml-auto text-muted-foreground/80">點兩下：入住 → 退房</span>
      </div>
    </div>
  );
}

export function ChangeOrderDatesDialog({ open, onOpenChange, order, mode, onSuccess }: Props) {
  const { toast } = useToast();
  const [newCheckIn, setNewCheckIn] = useState(order.check_in_date);
  const [newCheckOut, setNewCheckOut] = useState(order.check_out_date);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const today = useMemo(() => startOfToday(), []);

  const [capacityMap, setCapacityMap] = useState<Map<string, Capacity>>(new Map());
  const [capLoading, setCapLoading] = useState(false);

  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const [kolConfirm, setKolConfirm] = useState<{
    open: boolean;
    yearMonth: string;
    used: number;
    quota: number;
    oldStatus?: { yearMonth: string; used: number; quota: number } | null;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setNewCheckIn(order.check_in_date);
      setNewCheckOut(order.check_out_date);
      setReason("");
      setInventoryError(null);
    }
  }, [open, order.check_in_date, order.check_out_date]);

  useEffect(() => {
    if (!open || !order.accommodation_id) return;
    let cancelled = false;
    setCapLoading(true);
    (async () => {
      try {
        const start = startOfMonth(today);
        const end = endOfMonth(addMonths(start, 11));
        const map = await loadCapacityMap(order.accommodation_id, start, end);
        if (!cancelled) setCapacityMap(map);
      } finally {
        if (!cancelled) setCapLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, order.accommodation_id, today]);

  const invoke = async (force: boolean) => {
    setSubmitting(true);
    setInventoryError(null);
    try {
      const { data, error } = await supabase.functions.invoke("change-order-dates", {
        body: {
          orderId: order.id,
          newCheckIn,
          newCheckOut,
          mode,
          reason: reason || undefined,
          forceKolQuotaOverride: force || undefined,
        },
      });

      const extractPayload = async (): Promise<any> => {
        if (data) return data;
        try {
          const ctx: any = (error as any)?.context;
          if (ctx?.json) return await ctx.json();
          if (ctx?.body) {
            const t = typeof ctx.body === "string" ? ctx.body : await new Response(ctx.body).text();
            return JSON.parse(t);
          }
        } catch (_) { /* ignore */ }
        return null;
      };

      const payload = await extractPayload();

      if (payload?.code === "KOL_QUOTA_EXCEEDED" && payload.quota_status) {
        setKolConfirm({
          open: true,
          yearMonth: payload.quota_status.year_month,
          used: payload.quota_status.used,
          quota: payload.quota_status.quota,
          oldStatus: payload.old_quota_status
            ? {
                yearMonth: payload.old_quota_status.year_month,
                used: payload.old_quota_status.used,
                quota: payload.old_quota_status.quota,
              }
            : null,
        });
        return;
      }

      if (payload?.code === "INVENTORY_CONFLICT") {
        setInventoryError(payload.message || "所選日期庫存或包棟互斥條件不符");
        return;
      }

      if (error || payload?.success === false) {
        toast({
          title: "改期失敗",
          description: payload?.message || error?.message || "未知錯誤",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "改期成功", description: `${newCheckIn} → ${newCheckOut}` });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({ title: "改期失敗", description: e?.message ?? "未知錯誤", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!newCheckIn || !newCheckOut) {
      toast({ title: "請完整選擇入住與退房日", variant: "destructive" });
      return;
    }
    if (newCheckOut <= newCheckIn) {
      toast({ title: "退房日必須晚於入住日", variant: "destructive" });
      return;
    }
    if (newCheckIn === order.check_in_date && newCheckOut === order.check_out_date) {
      toast({ title: "新舊日期相同，無需改期", variant: "destructive" });
      return;
    }
    await invoke(false);
  };

  const nights =
    newCheckIn && newCheckOut
      ? Math.max(0, Math.round((parseISO(newCheckOut).getTime() - parseISO(newCheckIn).getTime()) / 86400000))
      : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>訂單改期 ({mode === "kol" ? "KOL 互惠單" : "一般單"})</DialogTitle>
            <DialogDescription>
              訂單編號 {order.order_number}｜將重新驗證庫存與包棟互斥。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground text-xs">原日期</div>
                <div className="font-medium mt-0.5">
                  {order.check_in_date} → {order.check_out_date}
                </div>
              </div>
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                <div className="text-muted-foreground text-xs">新日期</div>
                <div className="font-medium mt-0.5 flex items-baseline gap-2">
                  <span>{newCheckIn || "—"}</span>
                  <span>→</span>
                  <span>{newCheckOut || "—"}</span>
                  {nights > 0 && (
                    <span className="text-xs text-muted-foreground ml-auto">{nights} 晚</span>
                  )}
                </div>
              </div>
            </div>

            <InventoryRangeCalendar
              checkIn={newCheckIn}
              checkOut={newCheckOut}
              onChange={(ci, co) => {
                setNewCheckIn(ci);
                setNewCheckOut(co);
                setInventoryError(null);
              }}
              capacityMap={capacityMap}
              loading={capLoading}
              minDate={today}
            />

            <div>
              <Label className="text-xs">備註 (選填)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：客人臨時延期 / KOL 檔期調整"
                rows={2}
              />
            </div>
            {inventoryError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
                <div className="font-semibold">庫存 / 包棟互斥衝突</div>
                <div className="text-xs opacity-90 whitespace-pre-wrap">{inventoryError}</div>
                <div className="text-xs opacity-80">請調整日期後再試。</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !newCheckIn || !newCheckOut}>
              {submitting ? "處理中…" : "確認改期"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {kolConfirm && (
        <KolQuotaConfirmDialog
          open={kolConfirm.open}
          yearMonth={kolConfirm.yearMonth}
          used={kolConfirm.used}
          quota={kolConfirm.quota}
          oldStatus={kolConfirm.oldStatus ?? null}
          onCancel={() => setKolConfirm(null)}
          onConfirm={async () => {
            setKolConfirm(null);
            await invoke(true);
          }}
        />
      )}
    </>
  );
}
