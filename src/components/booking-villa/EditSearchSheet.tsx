import { useEffect, useState } from "react";
import { format, addDays, differenceInDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Minus, Plus, CalendarDays, BedDouble, User, Baby, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  adults: number;
  children: number;
  infants?: number;
  toddlers?: number;
  rooms: number;
  /** 可訂日集合（yyyy-MM-dd），null 表示尚未載入；非該集合內的日期將無法選取 */
  availableDates?: Set<string> | null;
  /** 雲岫等有分軌住宿：包棟可訂日集合（若提供則顯示切換 chips） */
  packageDates?: Set<string> | null;
  /** 雲岫等有分軌住宿：散客可訂日集合 */
  commonDates?: Set<string> | null;
  onConfirm: (v: {
    checkIn: Date;
    checkOut: Date;
    adults: number;
    children: number;
    infants: number;
    toddlers: number;
    rooms: number;
  }) => void;
}


const Counter = ({
  icon: Icon,
  label,
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  icon: any;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) => (
  <div className="flex items-center justify-between py-3">
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-[15px] text-foreground">{label}</span>
    </div>
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-8 h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
        aria-label="減少"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-6 text-center tabular-nums font-medium">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
        aria-label="增加"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

const EditSearchSheet = ({
  open,
  onOpenChange,
  checkIn,
  checkOut,
  adults,
  children,
  infants = 0,
  toddlers = 0,
  rooms,
  availableDates,
  packageDates,
  commonDates,
  onConfirm,
}: EditSearchSheetProps) => {

  const [range, setRange] = useState<DateRange | undefined>(undefined);
  // 標記目前 range 是否為「已完成的一段」；若是，下一次點擊將重置為新起點
  const [rangeCommitted, setRangeCommitted] = useState(true);
  const [a, setA] = useState(adults);
  const [c, setC] = useState(children);
  const [i, setI] = useState(infants);
  const [tod, setTod] = useState(toddlers);
  const [r, setR] = useState(rooms);
  const [childrenOpen, setChildrenOpen] = useState(false);

  // 雲岫等雙軌住宿：包棟 / 散客 切換
  const hasDualAxis = !!(packageDates && commonDates);
  const autoAxis: "package" | "common" = rooms >= 2 || adults >= 6 ? "package" : "common";
  const [axis, setAxis] = useState<"all" | "package" | "common">(autoAxis);
  useEffect(() => {
    if (hasDualAxis) setAxis(rooms >= 2 || a >= 6 ? "package" : "common");
    // 只在 sheet 打開重置時同步；此 effect 由外層 open 觸發的重置區塊補齊
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effAvail: Set<string> | null = hasDualAxis
    ? axis === "package"
      ? packageDates!
      : axis === "common"
        ? commonDates!
        : availableDates ?? null
    : availableDates ?? null;

  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 640px)").matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setRange({
        from: checkIn ?? undefined,
        to: checkOut ?? undefined,
      });
      setRangeCommitted(true);
      setA(adults);
      setC(children);
      setI(infants);
      setTod(toddlers);
      setR(rooms);
      if (hasDualAxis) setAxis(rooms >= 2 || adults >= 6 ? "package" : "common");
    }
  }, [open, checkIn, checkOut, adults, children, infants, toddlers, rooms, hasDualAxis]);


  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nights =
    range?.from && range?.to
      ? Math.max(1, differenceInDays(range.to, range.from))
      : 0;

  // 可訂庫存摘要：僅在載入完成後計算
  const availStats = (() => {
    if (!effAvail) return null;
    const futureDates = Array.from(effAvail)
      .filter((s) => {
        const d = new Date(s + "T00:00:00");
        return d >= today;
      })
      .sort();
    if (futureDates.length === 0) {
      return { count: 0, earliest: null as string | null, latest: null as string | null };
    }
    return {
      count: futureDates.length,
      earliest: futureDates[0],
      latest: futureDates[futureDates.length - 1],
    };
  })();

  // 建議連續入住區段：從 fromDate 起找最長連續可訂區段（最多 90 天）
  const findConsecutiveRange = (fromDate: Date): { start: Date; end: Date } | null => {
    if (!effAvail) return null;
    const startKey = format(fromDate, "yyyy-MM-dd");
    if (!effAvail.has(startKey)) return null;
    let cursor = addDays(fromDate, 1);
    let last = cursor;
    while (true) {
      const prevKey = format(addDays(cursor, -1), "yyyy-MM-dd");
      if (!effAvail.has(prevKey)) break;
      last = cursor;
      cursor = addDays(cursor, 1);
      if (differenceInDays(cursor, fromDate) > 90) break;
    }
    return { start: fromDate, end: last };
  };

  // 檢查目前 range 是否完全可訂（僅 committed 且 from+to 都存在時檢查）
  const rangeIssue: null | { reason: string; suggestion: { from: Date; to: Date } | null } = (() => {
    if (!effAvail || !range?.from || !range?.to || !rangeCommitted) return null;
    // 檢查 from ~ to-1 每一天是否都在 effAvail
    const days: string[] = [];
    for (let d = new Date(range.from); d < range.to; d.setDate(d.getDate() + 1)) {
      days.push(format(d, "yyyy-MM-dd"));
    }
    const missing = days.filter((k) => !effAvail.has(k));
    if (missing.length === 0) return null;

    // 建議：從 range.from 起，若當天可訂則用最長連續段；否則找下一個最早可訂日
    let suggestion: { from: Date; to: Date } | null = null;
    const fromKey = format(range.from, "yyyy-MM-dd");
    if (effAvail.has(fromKey)) {
      const seg = findConsecutiveRange(range.from);
      if (seg && seg.end > seg.start) {
        const wantedNights = Math.max(1, differenceInDays(range.to, range.from));
        const maxNights = differenceInDays(seg.end, seg.start);
        const nightsToUse = Math.min(wantedNights, maxNights);
        suggestion = { from: seg.start, to: addDays(seg.start, nightsToUse) };
      }
    } else if (availStats?.earliest) {
      const earliest = new Date(availStats.earliest + "T00:00:00");
      const seg = findConsecutiveRange(earliest);
      if (seg && seg.end > seg.start) {
        const wantedNights = Math.max(1, differenceInDays(range.to, range.from));
        const maxNights = differenceInDays(seg.end, seg.start);
        const nightsToUse = Math.min(wantedNights, maxNights);
        suggestion = { from: seg.start, to: addDays(seg.start, nightsToUse) };
      }
    }

    const reason = missing.length === days.length
      ? "所選日期目前無房型可訂"
      : `所選期間有 ${missing.length} 天無房型可訂`;
    return { reason, suggestion };
  })();

  const applySuggestion = () => {
    if (!rangeIssue?.suggestion) return;
    setRange({ from: rangeIssue.suggestion.from, to: rangeIssue.suggestion.to });
    setRangeCommitted(true);
  };

  const canConfirm = !!(range?.from && range?.to && a >= 1 && r >= 1 && !rangeIssue);

  const handleConfirm = () => {
    if (!range?.from || !range?.to) return;
    onConfirm({
      checkIn: range.from,
      checkOut: range.to,
      adults: a,
      children: c,
      infants: i,
      toddlers: tod,
      rooms: r,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="z-[120] max-h-[92vh] h-auto p-0 flex flex-col rounded-t-2xl border-t-0 shadow-2xl"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <SheetTitle className="text-[16px] font-semibold text-center">調整搜尋條件</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* 日期 */}
          <div className="pt-3">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-[15px] font-medium">入住日期</span>
              {effAvail === null ? (
                <span className="ml-auto text-xs text-muted-foreground">庫存載入中…</span>
              ) : range?.from && range?.to ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {format(range.from, "M月d日")} – {format(range.to, "M月d日")} · 共 {nights} 晚
                </span>
              ) : range?.from ? (
                <span className="ml-auto text-xs text-primary">
                  已選 {format(range.from, "M月d日")} · 請選退房日
                </span>
              ) : (
                <span className="ml-auto text-xs text-muted-foreground">請選入住日</span>
              )}
              {effAvail !== null && (range?.from || range?.to) && (
                <button
                  type="button"
                  onClick={() => {
                    setRange(undefined);
                    setRangeCommitted(false);
                  }}
                  className="text-xs text-primary underline-offset-2 hover:underline ml-1"
                >
                  重選
                </button>
              )}
            </div>

            {/* 可訂天數摘要 */}
            {availStats && availStats.count > 0 && availStats.earliest && (
              <div className="mb-2 flex items-center justify-end rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-1.5 text-[12px] text-emerald-800">
                <span className="tabular-nums">
                  最快 {format(new Date(availStats.earliest + "T00:00:00"), "M月d日")} 可訂
                </span>
              </div>
            )}
            {availStats && availStats.count === 0 && (
              <div className="mb-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-900">
                目前 12 個月內無可訂日期，請洽小幫手詢問候補。
              </div>
            )}

            {/* 目前所選日期不可訂：顯示原因與一鍵改選 */}
            {rangeIssue && (
              <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 flex items-start gap-2">
                <span className="mt-0.5">⚠️</span>
                <div className="flex-1 min-w-0">
                  <div>{rangeIssue.reason}</div>
                  {rangeIssue.suggestion ? (
                    <button
                      type="button"
                      onClick={applySuggestion}
                      className="mt-1 inline-flex items-center rounded-md bg-amber-600 text-white px-2 py-1 text-[12px] font-medium hover:bg-amber-700 transition"
                    >
                      改選 {format(rangeIssue.suggestion.from, "M月d日")} – {format(rangeIssue.suggestion.to, "M月d日")}
                    </button>
                  ) : (
                    <div className="mt-0.5 text-muted-foreground">請於下方日曆重新選擇。</div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-muted/30 px-1 py-2">
              <Calendar
                showOutsideDays={false}
                variant="frontend"
                mode="range"
                selected={range}
                onSelect={(val, clickedDay) => {
                  // 規則：若上一段已完成 (committed)，任何點擊都重置為新的起點
                  if (rangeCommitted && clickedDay) {
                    setRange({ from: clickedDay, to: undefined });
                    setRangeCommitted(false);
                    return;
                  }
                  if (val?.from && val?.to) {
                    // 完成一段
                    setRange(val);
                    setRangeCommitted(true);
                  } else if (val?.from) {
                    setRange({ from: val.from, to: undefined });
                    setRangeCommitted(false);
                  } else {
                    setRange(undefined);
                    setRangeCommitted(false);
                  }
                }}
                numberOfMonths={isDesktop ? 2 : 1}
                locale={zhTW}
                weekStartsOn={0}

                disabled={(d) => {
                  if (d < today) return true;
                  // 庫存尚未載入完成：暫時 disable 所有日期，避免顯示假可訂
                  if (effAvail === null) return true;
                  const dateKey = format(d, "yyyy-MM-dd");
                  // 若已選入住日但尚未選退房日：允許 from+1 ~ 第一個無庫存日（含）作為退房日
                  if (range?.from && !range?.to && !rangeCommitted) {
                    if (d <= range.from) {
                      // 選退房日時，禁止點擊入住日（含）以前的日期，引導用戶用「重選」
                      return true;
                    }

                    // 從 from+1 開始往後找最大允許退房日
                    let cursor = addDays(range.from, 1);
                    let maxCheckout = cursor;
                    while (true) {
                      const prevKey = format(addDays(cursor, -1), "yyyy-MM-dd");
                      const prevAvailable = effAvail.has(prevKey);
                      if (!prevAvailable) break;
                      maxCheckout = cursor;
                      cursor = addDays(cursor, 1);
                      if (differenceInDays(cursor, range.from) > 90) break;
                    }
                    return d > maxCheckout;
                  }
                  if (!effAvail.has(dateKey)) return true;
                  return false;
                }}

                className="p-2 pointer-events-auto w-full bg-transparent"
                classNames={{
                  months: "w-full flex flex-col sm:flex-row gap-4 sm:gap-6",
                  month: "flex-1 min-w-0 space-y-3",
                  caption_label: "text-[15px] font-semibold",
                  table: "w-full border-collapse",
                  head_row: "flex w-full",
                  head_cell: "text-muted-foreground font-normal text-[12px] flex-1 text-center",
                  row: "flex w-full mt-1",
                  cell: "flex-1 h-10 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full [&:has([aria-selected].day-range-start)]:rounded-l-full [&:has([aria-selected].day-range-end)]:rounded-r-full focus-within:relative focus-within:z-20",
                  day: "h-10 w-10 mx-auto p-0 font-semibold text-[15px] text-foreground rounded-full hover:bg-primary/15 hover:text-primary aria-selected:opacity-100 transition-colors",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground font-bold",
                  day_today: "ring-1 ring-primary/60 text-primary font-bold aria-selected:ring-0 aria-selected:text-primary-foreground",
                  day_range_middle: "!bg-transparent !text-foreground hover:!bg-primary/20",
                  day_range_start: "rounded-full",
                  day_range_end: "rounded-full",
                  day_outside: "text-muted-foreground/30 font-normal",
                  day_disabled: "!text-muted-foreground/35 !font-normal line-through decoration-muted-foreground/40 hover:!bg-transparent cursor-not-allowed",

                }}
                initialFocus
              />
            </div>
          </div>

          {/* 人數 */}
          <div className="mt-4 rounded-xl bg-muted/30 px-3 divide-y divide-border/60">
            <Counter
              icon={User}
              label="成人"
              value={a}
              onChange={setA}
              min={1}
              max={50}
            />
            <div>
              <button
                type="button"
                onClick={() => setChildrenOpen((v) => !v)}
                className="w-full flex items-center justify-between py-3"
                aria-expanded={childrenOpen}
              >
                <div className="flex items-center gap-2.5">
                  <Baby className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[15px] text-foreground">兒童</span>
                  {(i + tod + c) > 0 && (
                    <span className="text-[13px] text-muted-foreground tabular-nums">
                      {i + tod + c} 位
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    childrenOpen && "rotate-180"
                  )}
                />
              </button>
              {childrenOpen && (
                <div className="pb-1 pl-6 divide-y divide-border/40">
                  <Counter
                    icon={Baby}
                    label="嬰兒（0–2 歲）"
                    value={i}
                    onChange={setI}
                    min={0}
                    max={10}
                  />
                  <Counter
                    icon={Baby}
                    label="幼兒（3–6 歲）"
                    value={tod}
                    onChange={setTod}
                    min={0}
                    max={10}
                  />
                  <Counter
                    icon={Baby}
                    label="兒童（7–12 歲）"
                    value={c}
                    onChange={setC}
                    min={0}
                    max={10}
                  />
                </div>
              )}
            </div>
          </div>
        </div>




        <SheetFooter
          className="px-4 pt-3 border-t border-border bg-background"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full h-12 text-[15px] font-bold text-white rounded-lg shadow-md"
            style={{ background: "hsl(25, 76%, 50%)" }}
          >
            套用
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EditSearchSheet;
