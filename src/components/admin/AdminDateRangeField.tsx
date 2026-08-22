import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/**
 * PMS Admin 日期區間選擇器（共用）
 * 後台任何「起訖日期篩選」請優先使用本元件，勿另建一次性 Calendar 樣式。
 * 值格式一律為 yyyy-MM-dd（空字串代表未選）。
 */
interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  fromPlaceholder?: string;
  toPlaceholder?: string;
}

const toDate = (v: string) => {
  if (!v) return undefined;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
};
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const label = (v: string) => {
  const d = toDate(v);
  return d ? format(d, "yyyy/MM/dd", { locale: zhTW }) : "";
};

export function AdminDateRangeField({
  from,
  to,
  onChange,
  className,
  fromPlaceholder = "開始日期",
  toPlaceholder = "結束日期",
}: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<1 | 2>(1);

  const fromDate = toDate(from);
  const toDateValue = toDate(to);

  const openAt = (next: 1 | 2) => {
    setPhase(next === 2 && !from ? 1 : next);
    setOpen(true);
  };

  const handleDayClick = (day: Date, modifiers: Record<string, boolean>) => {
    if (modifiers.disabled) return;
    if (phase === 1 || !fromDate) {
      onChange(iso(day), "");
      setPhase(2);
      return;
    }
    if (day < fromDate) {
      onChange(iso(day), "");
      setPhase(2);
      return;
    }
    onChange(iso(fromDate), iso(day));
    setOpen(false);
  };

  const trigger = (active: boolean, filled: boolean, text: string, placeholder: string, onClick: () => void) => (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn(
        "h-9 w-[150px] justify-start gap-2 px-3 text-sm font-normal",
        !filled && "text-muted-foreground",
        active && "border-primary ring-2 ring-primary/25",
      )}
    >
      <span className="truncate">{filled ? text : placeholder}</span>
      <CalendarIcon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("flex items-center gap-2", className)}>
          {trigger(open && phase === 1, !!fromDate, label(from), fromPlaceholder, () => openAt(1))}
          <span className="text-muted-foreground">～</span>
          {trigger(open && phase === 2, !!toDateValue, label(to), toPlaceholder, () => openAt(2))}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        collisionPadding={12}
        className="z-50 w-auto max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-lg"
      >
        <Calendar
          variant="admin"
          mode="range"
          selected={{ from: fromDate, to: toDateValue } as DateRange}
          defaultMonth={fromDate}
          onDayClick={handleDayClick}
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => {
              onChange("", "");
              setPhase(1);
            }}
          >
            清除
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => {
              const today = iso(new Date());
              onChange(today, today);
              setOpen(false);
            }}
          >
            今天
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AdminDateRangeField;
