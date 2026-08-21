import { useEffect, useState } from "react";
import { format, parse } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CalendarIcon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const toDate = (v?: string | null) => {
  if (!v) return undefined;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isNaN(d.getTime()) ? undefined : d;
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

interface Props {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  min?: string | null;
  max?: string | null;
  /** 已無庫存、不可選為入住日的日期（yyyy-MM-dd） */
  unavailableDates?: Set<string>;
  /** 方案不適用日期（不可作為住宿夜，但可作為退房日） */
  excludedDates?: Set<string>;
  /**
   * 額外的「不可作為住宿夜」判斷（yyyy-MM-dd → true 代表不可住）。
   * 團購方案的「不適用日期類型」由呼叫端傳入，元件本身不做任何價格或分類計算。
   */
  isBlockedNight?: (dateKey: string) => boolean;
  /** 台灣今日（yyyy-MM-dd）：早於此日的日期一律停用；未傳入時不限制 */
  today?: string | null;
  disabled?: boolean;
  invalidCheckIn?: boolean;
  invalidCheckOut?: boolean;
}

/**
 * 團購頁住宿日期區間選擇器：
 * 入住日／退房日共用同一個 Calendar，選完入住日不關閉，直接接著選退房日。
 * 僅為 UI 元件，不做任何庫存或價格計算。
 */
export function GroupBuyDateRangeField({
  checkIn,
  checkOut,
  onChange,
  min,
  max,
  unavailableDates,
  excludedDates,
  isBlockedNight,
  today,
  disabled,
  invalidCheckIn,
  invalidCheckOut,
}: Props) {
  const [open, setOpen] = useState(false);
  /** 1 = 選入住日，2 = 選退房日 */
  const [phase, setPhase] = useState<1 | 2>(1);

  const from = toDate(checkIn);
  const to = toDate(checkOut);
  const minDate = toDate(min);
  const maxDate = toDate(max);

  useEffect(() => {
    if (open) setPhase(checkIn && !checkOut ? 2 : 1);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAt = (nextPhase: 1 | 2) => {
    if (disabled) return;
    setPhase(nextPhase === 2 && !checkIn ? 1 : nextPhase);
    setOpen(true);
  };

  const startOver = (d: Date) => {
    onChange(iso(d), "");
    setPhase(2);
  };

  const handleDayClick = (day: Date, modifiers: Record<string, boolean>) => {
    if (modifiers.disabled) return;
    if (phase === 1 || !from) {
      startOver(day);
      return;
    }
    if (day <= from) {
      startOver(day);
      return;
    }
    onChange(iso(from), iso(day));
    setOpen(false);
  };

  /** 今天以前一律不可選（入住日與退房日皆然，退房日本來就晚於入住日） */
  const isPast = (d: Date) => (today ? iso(d) < today : false);

  const outOfBounds = (d: Date) =>
    isPast(d) || (minDate ? iso(d) < iso(minDate) : false) || (maxDate ? iso(d) > iso(maxDate) : false);

  const soldOut = (d: Date) => !!unavailableDates?.has(iso(d));
  /** 不可作為住宿夜：方案不適用日期 OR 方案不適用的日期類型 */
  const blockedNight = (key: string) => !!excludedDates?.has(key) || !!isBlockedNight?.(key);
  const excluded = (d: Date) => blockedNight(iso(d));

  /** 選退房日階段：退房日不佔當晚庫存，僅擋活動期間外的日期 */
  const isCheckoutPhase = phase === 2 && !!from;

  /** 住宿區間不可跨過不適用日期：退房日只能到「第一個不適用日期」當天為止 */
  const crossesExcluded = (d: Date) => {
    if (!from) return false;
    if (!excludedDates?.size && !isBlockedNight) return false;
    const cur = new Date(from);
    cur.setDate(cur.getDate() + 1);
    while (cur < d) {
      if (blockedNight(iso(cur))) return true;
      cur.setDate(cur.getDate() + 1);
    }
    return blockedNight(iso(from));
  };

  const disabledDay = (d: Date) => {
    if (outOfBounds(d)) return true;
    if (isCheckoutPhase) return crossesExcluded(d);
    return soldOut(d) || excluded(d);
  };

  const triggerClass = (active: boolean, filled: boolean, invalid?: boolean) =>
    cn(
      "h-11 w-full justify-start gap-2 rounded-xl px-3 text-left text-base font-normal",
      !filled && "text-muted-foreground",
      active && "border-primary ring-2 ring-primary/25",
      invalid && "border-destructive",
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div>
            <Label htmlFor="gb-checkin" className="text-sm font-medium text-foreground">入住日</Label>
            <Button
              id="gb-checkin"
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => openAt(1)}
              className={triggerClass(open && phase === 1, !!from, invalidCheckIn)}
            >
              <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
              {from ? format(from, "yyyy/MM/dd (EEE)", { locale: zhTW }) : "選擇入住日"}
            </Button>
          </div>
          <div>
            <Label htmlFor="gb-checkout" className="text-sm font-medium text-foreground">退房日</Label>
            <Button
              id="gb-checkout"
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => openAt(2)}
              className={triggerClass(open && phase === 2, !!to, invalidCheckOut)}
            >
              <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
              {to ? format(to, "yyyy/MM/dd (EEE)", { locale: zhTW }) : "選擇退房日"}
            </Button>
          </div>
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-auto max-w-[calc(100vw-1.5rem)] overflow-x-auto rounded-2xl p-0"
        align="start"
        collisionPadding={12}
      >
        {/* 步驟提示 */}
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 text-sm">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
              phase === 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            1 選擇入住日
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
              phase === 2 ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            2 選擇退房日
          </span>
        </div>

        <Calendar
          mode="range"
          variant="frontend"
          locale={zhTW}
          selected={{ from, to }}
          defaultMonth={from ?? minDate}
          onDayClick={handleDayClick}
          modifiers={{
            soldout: (d) => !isCheckoutPhase && (soldOut(d) || excluded(d)) && !outOfBounds(d),
          }}
          modifiersClassNames={{ soldout: "line-through" }}
          disabled={disabledDay}
          classNames={{
            day_today:
              "font-semibold underline decoration-dotted decoration-muted-foreground underline-offset-4 aria-selected:no-underline",
            day_range_middle: "!bg-primary/15 !text-foreground hover:!bg-primary/25",
            day_disabled: cn("text-muted-foreground/50 opacity-60", !isCheckoutPhase && "line-through"),
            cell:
              "h-10 w-10 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
            head_cell: "text-muted-foreground rounded-md w-10 font-normal text-[0.8rem]",
            day: "rdp-day h-10 w-10 p-0 font-normal rounded-md hover:bg-primary/10 hover:text-primary aria-selected:opacity-100",
          }}
          className="p-3 pointer-events-auto"
        />

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/70 px-3 py-2 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
          <span className="flex min-w-0 items-start gap-1.5">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-border bg-background" />
            <span className="break-words">可預訂</span>
          </span>
          <span className="flex min-w-0 items-start gap-1.5">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-primary" />
            <span className="break-words">入住／退房日</span>
          </span>
          <span className="flex min-w-0 items-start gap-1.5">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-primary/25" />
            <span className="break-words">住宿區間</span>
          </span>
          {isCheckoutPhase ? (
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-muted opacity-60" />
              <span className="break-words">不可選</span>
            </span>
          ) : (
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-muted line-through" />
              <span className="break-words line-through">不可入住／已滿房／方案不適用</span>
            </span>
          )}
        </div>

        {isCheckoutPhase && (
          <div className="border-t border-border/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            不可選日期可能因活動期間限制、住宿區間跨越方案不適用日期，或跨越方案不適用的日期類型。
          </div>
        )}

      </PopoverContent>
    </Popover>
  );
}

export default GroupBuyDateRangeField;
