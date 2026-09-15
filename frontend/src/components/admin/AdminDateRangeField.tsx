import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";


/**
 * PMS Admin 日期區間選擇器（共用）
 * 後台任何「起訖日期篩選」請優先使用本元件，勿另建一次性 Calendar 樣式。
 * 值格式一律為 yyyy-MM-dd（空字串代表未選）。
 */
interface Props {
  from: string;
  to: string;
  /** 允許直接鍵入日期（yyyy/MM/dd、yyyy-MM-dd、yyyyMMdd 皆可） */
  editable?: boolean;
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
  editable = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<{ which: 1 | 2; text: string } | null>(null);

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

  /** 解析手動輸入：yyyy/MM/dd、yyyy-MM-dd、yyyy.MM.dd、yyyyMMdd */
  const parseTyped = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return "";
    const digits = t.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    const candidate = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    const d = parse(candidate, "yyyy-MM-dd", new Date());
    return isValid(d) ? iso(d) : null;
  };

  const commitTyped = (which: 1 | 2, raw: string) => {
    const next = parseTyped(raw);
    setDraft(null);
    if (next === null) {
      toast({
        title: "日期格式不正確",
        description: "請輸入 2026/03/01、2026-03-01 或 20260301，已還原原本的日期。",
        variant: "destructive",
      });
      return;
    }
    if (which === 1) {
      if (next && to && next > to) {
        // 開始日晚於結束日 → 自動對調並提示
        onChange(to, next);
        toast({ title: "已自動調整日期區間", description: `開始日晚於結束日，已對調為 ${label(to)} ～ ${label(next)}。` });
        setPhase(1);
        return;
      }
      onChange(next, to);
      setPhase(next && !to ? 2 : 1);
    } else {
      if (next && from && next < from) {
        onChange(next, from);
        toast({ title: "已自動調整日期區間", description: `結束日早於開始日，已對調為 ${label(next)} ～ ${label(from)}。` });
        return;
      }
      onChange(from, next);
    }
  };


  const editableTrigger = (which: 1 | 2, value: string, placeholder: string) => (
    <div
      className={cn(
        "flex h-9 w-[150px] items-center gap-1 rounded-md border border-input bg-background px-2",
        open && phase === which && "border-primary ring-2 ring-primary/25",
      )}
    >
      <input
        type="text"
        inputMode="numeric"
        value={draft?.which === which ? draft.text : label(value)}
        placeholder={placeholder}
        onChange={(e) => setDraft({ which, text: e.target.value })}
        onFocus={() => setPhase(which)}
        onBlur={(e) => draft?.which === which && commitTyped(which, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTyped(which, (e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            setDraft(null);
          }
        }}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        aria-label="開啟日曆"
        onClick={() => openAt(which)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <CalendarIcon className="h-4 w-4" />
      </button>
    </div>
  );

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
          {editable
            ? editableTrigger(1, from, fromPlaceholder)
            : trigger(open && phase === 1, !!fromDate, label(from), fromPlaceholder, () => openAt(1))}
          <span className="text-muted-foreground">～</span>
          {editable
            ? editableTrigger(2, to, toPlaceholder)
            : trigger(open && phase === 2, !!toDateValue, label(to), toPlaceholder, () => openAt(2))}
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
