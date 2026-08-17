/**
 * 全館庫存日曆（唯讀）
 * 行銷團隊後台 → 成交大師 → 全館庫存
 * 僅檢視所有使用中館別的真實可訂庫存，不提供任何編輯／設定功能。
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  fetchAllVenuesAvailability,
  type VenueAvailabilityResult,
  type VenueRoomType,
} from "@/lib/venueAvailability";


interface Venue {
  id: string;
  name: string;
}

const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function AllVenuesInventoryTab() {
  const today = useMemo(() => startOfToday(), []);
  const [monthValue, setMonthValue] = useState<string>(() => format(today, "yyyy-MM"));
  const [venues, setVenues] = useState<Venue[]>([]);
  const [dataMap, setDataMap] = useState<Record<string, VenueAvailabilityResult>>({});
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  /** 各館別選擇的房型（all = 全部房型合計） */
  const [roomTypeFilter, setRoomTypeFilter] = useState<Record<string, string>>({});

  const month = useMemo(
    () => startOfMonth(new Date(`${monthValue}-01T00:00:00`)),
    [monthValue],
  );

  const gridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month],
  );
  const dateStrings = useMemo(
    () => gridDays.map((d) => formatISO(d, { representation: "date" })),
    [gridDays],
  );

  /** 勾選要顯示（載入）的館別 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      const list = ((data || []) as any[]).map((v) => ({ id: v.id, name: v.name }));
      setVenues(list);
      let saved: string[] | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) saved = (JSON.parse(raw) as string[]).filter((id) => list.some((v) => v.id === id));
      } catch {
        saved = null;
      }
      setSelectedIds(saved && saved.length > 0 ? saved : list.slice(0, 3).map((v) => v.id));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleVenue = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const setAll = (ids: string[]) => {
    setSelectedIds(ids);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  };

  // 已載入的（館別 × 月份）快取，勾選新館別時只補打該館
  const cacheRef = useRef<Map<string, VenueAvailabilityResult>>(new Map());

  useEffect(() => {
    if (selectedIds.length === 0) {
      setDataMap({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    const keyOf = (id: string) => `${reloadKey}|${monthValue}|${id}`;

    const fromCache: Record<string, VenueAvailabilityResult> = {};
    const missing: string[] = [];
    for (const id of selectedIds) {
      const hit = cacheRef.current.get(keyOf(id));
      if (hit) fromCache[id] = hit;
      else missing.push(id);
    }
    setDataMap(fromCache);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await fetchAllVenuesAvailability(missing, dateStrings);
        if (cancelled) return;
        for (const [id, r] of Object.entries(res)) cacheRef.current.set(keyOf(id), r);
        setDataMap({ ...fromCache, ...res });
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds, dateStrings, monthValue, reloadKey]);



  const shiftMonth = (delta: number) =>
    setMonthValue(format(addMonths(month, delta), "yyyy-MM"));

  const renderVenue = (venue: Venue) => {
    const res = dataMap[venue.id];
    const rtId = roomTypeFilter[venue.id] ?? "all";
    const selectedRt = res?.roomTypes.find((r) => r.id === rtId);
    const pkgTypes = res?.roomTypes.filter((r) => r.is_exclusive_package === true) ?? [];
    const singleTypes = res?.roomTypes.filter((r) => r.is_exclusive_package !== true) ?? [];

    /** 合計指定房型群組的逐日餘房 */
    const aggregate = (types: VenueRoomType[]) => {
      const out = new Map<string, { available: number; total: number; bookable: boolean }>();
      for (const dateStr of dateStrings) {
        let available = 0;
        let total = 0;
        for (const rt of types) {
          const d = res?.byRoomType.get(rt.id)?.get(dateStr);
          if (!d) continue;
          available += d.available;
          total += d.total;
        }
        out.set(dateStr, { available, total, bookable: available > 0 });
      }
      return out;
    };

    const dayMap = !res
      ? null
      : rtId === "all"
        ? res.byDate
        : rtId === "group:package"
          ? aggregate(pkgTypes)
          : rtId === "group:single"
            ? aggregate(singleTypes)
            : (res.byRoomType.get(rtId) ?? new Map());
    const bundledLock = rtId === "all" && (res?.bundledLock ?? false);
    const groupLabel =
      rtId === "group:package"
        ? `包棟／包區合計（共 ${pkgTypes.length} 種）`
        : rtId === "group:single"
          ? `單間房合計（共 ${singleTypes.length} 種）`
          : null;

    return (
      <Card key={venue.id} className="overflow-hidden">
        <CardHeader className="py-3 space-y-2">
          <CardTitle className="text-sm font-semibold truncate" title={venue.name}>
            {venue.name}
          </CardTitle>
          {res && res.roomTypes.length > 1 && (
            <Select
              value={rtId}
              onValueChange={(v) => setRoomTypeFilter((prev) => ({ ...prev, [venue.id]: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="全部房型" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">全部房型（合計）</SelectItem>
                {pkgTypes.length > 0 && (
                  <SelectItem value="group:package">包棟／包區（合計）</SelectItem>
                )}
                {singleTypes.length > 0 && (
                  <SelectItem value="group:single">單間房（合計）</SelectItem>
                )}
                {res.roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    {rt.is_exclusive_package ? "［包棟/包區］" : ""}
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>

        <CardContent className="pb-4">
          {!res || !dayMap ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEK_DAYS.map((d, i) => (
                  <div
                    key={d}
                    className={cn(
                      "text-center text-[11px] py-0.5",
                      i === 0 || i === 6 ? "text-orange-500" : "text-muted-foreground",
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {gridDays.map((day) => {
                  const dateStr = formatISO(day, { representation: "date" });
                  if (!isSameMonth(day, month)) {
                    return <div key={dateStr} className="aspect-square" />;
                  }
                  const isPast = isBefore(day, today);
                  const info = dayMap.get(dateStr);
                  const avail = info?.available ?? 0;
                  const total = info?.total ?? 0;
                  const showCount = !bundledLock && total >= 2;
                  const isFull = bundledLock ? !info?.bookable : avail <= 0;
                  const ratio = total > 0 ? avail / total : 0;

                  const breakdown = res.roomTypes
                    .map((rt) => {
                      const d = res.byRoomType.get(rt.id)?.get(dateStr);
                      if (!d) return null;
                      return `${rt.name}：${d.available <= 0 ? "已滿" : `餘 ${d.available}/${d.total}`}`;
                    })
                    .filter(Boolean)
                    .join("\n");

                  let tone: string;
                  if (isPast) tone = "border-muted bg-muted/30 text-muted-foreground/50";
                  else if (isFull) tone = "border-muted bg-muted text-muted-foreground";
                  else if (!bundledLock && ratio < 0.25)
                    tone = "border-red-300 bg-red-50 text-red-700";
                  else if (!bundledLock && ratio < 0.6)
                    tone = "border-amber-300 bg-amber-50 text-amber-800";
                  else tone = "border-emerald-300 bg-emerald-50 text-emerald-900";

                  return (
                    <div
                      key={dateStr}
                      title={isPast ? undefined : `${dateStr}\n${breakdown}`}
                      className={cn(
                        "aspect-square rounded-md border flex flex-col items-center justify-center text-[11px] select-none",
                        tone,
                      )}
                    >
                      <div
                        className={cn(
                          "leading-tight font-medium",
                          !isPast && isFull && "line-through",
                        )}
                      >
                        {day.getDate()}
                      </div>
                      {!isPast && (
                        <div className="text-[10px] mt-0.5 tabular-nums">
                          {isFull ? "已滿" : showCount ? `${avail}/${total}` : "可訂"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {(selectedRt || groupLabel) && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  目前檢視：
                  {selectedRt
                    ? `${selectedRt.name}（共 ${selectedRt.room_count} 間）`
                    : groupLabel}
                </p>
              )}

            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">
          全部使用中館別的真實可訂庫存（唯讀，沿用前台可訂判斷邏輯）
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="上個月">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <MonthPicker
            value={monthValue}
            onChange={(v) => v && setMonthValue(v)}
            placeholder="選擇月份"
          />
          <Button size="icon" variant="ghost" onClick={() => shiftMonth(1)} aria-label="下個月">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-1 gap-1"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            重新載入
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>圖例：</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-emerald-300 bg-emerald-50" />
          充足（≥60%）
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-amber-300 bg-amber-50" />
          普通（25–60%）
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-red-300 bg-red-50" />
          緊張（&lt;25%）
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border border-muted bg-muted" />
          已滿
        </span>
        <span>數字 = 可訂房數 / 總房數</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {venues.map(renderVenue)}
      </div>
      <p className="text-xs text-muted-foreground">
        {format(month, "yyyy 年 M 月", { locale: zhTW })}・共 {venues.length} 間館別
      </p>
    </div>
  );
}

export default AllVenuesInventoryTab;
