import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

interface DateFieldProps {
  /** yyyy-MM-dd 或 null */
  value: string | null;
  onChange: (value: string | null) => void;
  /** 不可早於此日期（yyyy-MM-dd） */
  minDate?: string | null;
  placeholder?: string;
  className?: string;
}

/** 日期選擇器（yyyy-MM-dd），風格與後台一致 */
export function DateField({ value, onChange, minDate, placeholder = "選擇日期", className }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const minParsed = minDate ? parse(minDate, "yyyy-MM-dd", new Date()) : undefined;
  const min = minParsed && isValid(minParsed) ? startOfDay(minParsed) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? format(selected, "yyyy/MM/dd (EEE)", { locale: zhTW }) : placeholder}
          </span>
          {selected && (
            <X
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" collisionPadding={12}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? min}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          disabled={min ? (date) => startOfDay(date) < min : undefined}
          initialFocus
          locale={zhTW}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

interface DateTimeFieldProps {
  /** ISO 字串或 null */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** 不可早於此時間（ISO） */
  minDateTime?: string | null;
  placeholder?: string;
  className?: string;
}

/** 日期＋時間選擇器（存 ISO），風格與後台一致 */
export function DateTimeField({ value, onChange, minDateTime, placeholder = "選擇日期時間", className }: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const minParsed = minDateTime ? new Date(minDateTime) : undefined;
  const min = minParsed && isValid(minParsed) ? minParsed : undefined;
  const minDay = min ? startOfDay(min) : undefined;

  const applyDate = (d: Date | undefined) => {
    if (!d) {
      onChange(null);
      setOpen(false);
      return;
    }
    const next = new Date(d);
    next.setHours(selected?.getHours() ?? 0, selected?.getMinutes() ?? 0, 0, 0);
    onChange((min && next < min ? min : next).toISOString());
  };

  const applyTime = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const base = selected ? new Date(selected) : new Date();
    base.setHours(h, m, 0, 0);
    onChange((min && base < min ? min : base).toISOString());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? format(selected, "yyyy/MM/dd (EEE) HH:mm", { locale: zhTW }) : placeholder}
          </span>
          {selected && (
            <X
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" collisionPadding={12}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? min}
          onSelect={applyDate}
          disabled={minDay ? (date) => startOfDay(date) < minDay : undefined}
          initialFocus
          locale={zhTW}
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <input
            type="time"
            value={selected ? format(selected, "HH:mm") : ""}
            onChange={(e) => applyTime(e.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            完成
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
