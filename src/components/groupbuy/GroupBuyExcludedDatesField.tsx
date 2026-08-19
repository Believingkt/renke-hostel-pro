import { useState } from "react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseDateKey, toDateKey } from "@/lib/groupBuyPricing";

interface Props {
  value: string[];
  onChange: (dates: string[]) => void;
  /** 活動可入住區間，超出範圍的日期不允許加入 */
  min?: string | null;
  max?: string | null;
}

/** 方案不適用日期：日曆多選，已選日期以列表呈現可單獨刪除 */
export function GroupBuyExcludedDatesField({ value, onChange, min, max }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value.map(parseDateKey);
  const minDate = min ? parseDateKey(min) : undefined;
  const maxDate = max ? parseDateKey(max) : undefined;

  const toggle = (day: Date) => {
    const key = toDateKey(day);
    if (min && key < min) return;
    if (max && key > max) return;
    onChange(value.includes(key) ? value.filter((d) => d !== key) : [...value, key].sort());
  };

  return (
    <div className="md:col-span-2">
      <Label>不適用日期（此方案不可入住的日期）</Label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <CalendarPlus className="mr-1 h-4 w-4" /> 新增不適用日期
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto rounded-2xl p-0" align="start" collisionPadding={12}>
            <Calendar
              mode="multiple"
              locale={zhTW}
              selected={selected}
              defaultMonth={selected[0] ?? minDate}
              onDayClick={(d) => toggle(d)}
              disabled={(d) => (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false)}
              modifiers={{ excluded: selected }}
              modifiersClassNames={{ excluded: "bg-destructive text-destructive-foreground" }}
              className="pointer-events-auto p-3"
            />
            <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
              點選日期新增、再次點選取消；僅能選擇活動可入住期間內的日期。
            </p>
          </PopoverContent>
        </Popover>
        {value.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            全部清除
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">目前沒有不適用日期。</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
            >
              <span className="tabular-nums">{format(parseDateKey(d), "yyyy/MM/dd (EEE)", { locale: zhTW })}</span>
              <button
                type="button"
                aria-label={`移除 ${d}`}
                onClick={() => onChange(value.filter((x) => x !== d))}
                className="rounded-full p-0.5 hover:bg-destructive/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        不適用日期只限制此方案的住宿夜，不會改動房型庫存，一般訂房與其他團購方案仍可正常預訂；退房日不算住宿夜，可以落在不適用日期。
      </p>
    </div>
  );
}

export default GroupBuyExcludedDatesField;
