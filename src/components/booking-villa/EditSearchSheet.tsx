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
import { Minus, Plus, CalendarDays, BedDouble, User, Baby } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  adults: number;
  children: number;
  rooms: number;
  /** 可訂日集合（yyyy-MM-dd），null 表示尚未載入；非該集合內的日期將無法選取 */
  availableDates?: Set<string> | null;
  onConfirm: (v: {
    checkIn: Date;
    checkOut: Date;
    adults: number;
    children: number;
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
  rooms,
  onConfirm,
}: EditSearchSheetProps) => {
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [a, setA] = useState(adults);
  const [c, setC] = useState(children);
  const [r, setR] = useState(rooms);

  useEffect(() => {
    if (open) {
      setRange({
        from: checkIn ?? undefined,
        to: checkOut ?? undefined,
      });
      setA(adults);
      setC(children);
      setR(rooms);
    }
  }, [open, checkIn, checkOut, adults, children, rooms]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nights =
    range?.from && range?.to
      ? Math.max(1, differenceInDays(range.to, range.from))
      : 0;

  const canConfirm = !!(range?.from && range?.to && a >= 1 && r >= 1);

  const handleConfirm = () => {
    if (!range?.from || !range?.to) return;
    onConfirm({
      checkIn: range.from,
      checkOut: range.to,
      adults: a,
      children: c,
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
              {range?.from && range?.to && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {format(range.from, "M月d日")} – {format(range.to, "M月d日")} · 共 {nights} 晚
                </span>
              )}
            </div>
            <div className="rounded-xl bg-muted/30 px-1 py-2">
              <Calendar
                variant="frontend"
                mode="range"
                selected={range}
                onSelect={(val) => {
                  if (val?.from && !val?.to && range?.from && range?.to) {
                    setRange({ from: val.from, to: undefined });
                  } else if (val?.from && !val?.to) {
                    setRange({ from: val.from, to: addDays(val.from, 1) });
                  } else {
                    setRange(val);
                  }
                }}
                numberOfMonths={1}
                locale={zhTW}
                disabled={(d) => d < today}
                className="p-2 pointer-events-auto w-full bg-transparent"
                classNames={{
                  months: "w-full",
                  month: "w-full space-y-3",
                  caption_label: "text-[15px] font-semibold",
                  table: "w-full border-collapse",
                  head_row: "flex w-full",
                  head_cell: "text-muted-foreground font-normal text-[12px] flex-1 text-center",
                  row: "flex w-full mt-1",
                  cell: "flex-1 h-10 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full [&:has([aria-selected].day-range-start)]:rounded-l-full [&:has([aria-selected].day-range-end)]:rounded-r-full focus-within:relative focus-within:z-20",
                  day: "h-10 w-10 mx-auto p-0 font-normal text-[14px] rounded-full hover:bg-primary/15 hover:text-primary aria-selected:opacity-100 transition-colors",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground font-semibold",
                  day_today: "text-primary font-semibold aria-selected:text-primary-foreground",
                  day_range_middle: "!bg-transparent !text-foreground hover:!bg-primary/20",
                  day_range_start: "rounded-full",
                  day_range_end: "rounded-full",
                  day_outside: "text-muted-foreground/40",
                  day_disabled: "text-muted-foreground/30 line-through",
                }}
                initialFocus
              />
            </div>
          </div>

          {/* 人數 / 房間 */}
          <div className="mt-4 rounded-xl bg-muted/30 px-3 divide-y divide-border/60">
            <Counter
              icon={BedDouble}
              label="房間數"
              value={r}
              onChange={setR}
              min={1}
              max={20}
            />
            <Counter
              icon={User}
              label="成人"
              value={a}
              onChange={setA}
              min={1}
              max={50}
            />
            <Counter
              icon={Baby}
              label="兒童"
              value={c}
              onChange={setC}
              min={0}
              max={20}
            />
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
