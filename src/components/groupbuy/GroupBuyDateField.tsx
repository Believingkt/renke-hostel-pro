import { useState } from "react";
import { format, parse } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const toDate = (v?: string | null) => {
  if (!v) return undefined;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isNaN(d.getTime()) ? undefined : d;
};

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string | null;
  max?: string | null;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** 已無庫存、不可選取的日期（yyyy-MM-dd） */
  unavailableDates?: Set<string>;
}

/** 團購頁專用的日期選擇器：品牌樣式日曆，取代原生 date input */
export function GroupBuyDateField({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "選擇日期",
  invalid,
  disabled,
  unavailableDates,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          className={cn(
            "h-11 w-full justify-start gap-2 rounded-xl px-3 text-left text-base font-normal",
            !selected && "text-muted-foreground",
            invalid && "border-destructive",
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
          {selected ? format(selected, "yyyy/MM/dd (EEE)", { locale: zhTW }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-xl p-0" align="start">
        <Calendar
          mode="single"
          locale={zhTW}
          selected={selected}
          defaultMonth={selected ?? minDate}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          disabled={(d) => (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
