import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subMonths } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  className?: string;
  allowFutureDates?: boolean;
  /** true 時：首次點擊視為入住(from)、第二次點擊視為退房(to)。第二次若早於首次自動對調。 */
  restartOnComplete?: boolean;
}

export function DateRangePicker({ dateRange, onDateRangeChange, className, allowFutureDates = false, restartOnComplete = false }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateRangeChange(undefined);
    setIsOpen(false);
  };

  const handleQuickSelect = (range: DateRange) => {
    onDateRangeChange(range);
    setIsOpen(false);
  };

  const quickRanges = [
    {
      label: "今天",
      range: { from: new Date(), to: new Date() }
    },
    {
      label: "最近7天",
      range: { from: subDays(new Date(), 6), to: new Date() }
    },
    {
      label: "最近30天",
      range: { from: subDays(new Date(), 29), to: new Date() }
    },
    {
      label: "本週",
      range: { from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }
    },
    {
      label: "本月",
      range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) }
    },
    {
      label: "上月",
      range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }
    },
    {
      label: "今年",
      range: { from: startOfYear(new Date()), to: endOfYear(new Date()) }
    },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "justify-start text-left font-normal gap-2",
            !dateRange && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                <span className="hidden sm:inline">
                  {format(dateRange.from, "yyyy/MM/dd")} - {format(dateRange.to, "yyyy/MM/dd")}
                </span>
                <span className="sm:hidden">
                  {format(dateRange.from, "MM/dd")} - {format(dateRange.to, "MM/dd")}
                </span>
                <X 
                  className="h-3 w-3 ml-auto hover:bg-accent rounded-sm" 
                  onClick={handleReset}
                />
              </>
            ) : (
              format(dateRange.from, "yyyy/MM/dd")
            )
          ) : (
            <span>選擇日期範圍</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {/* 快速選擇按鈕 */}
          <div className="p-3 space-y-2 border-b sm:border-b-0 sm:border-r border-border">
            <div className="text-xs font-semibold text-muted-foreground mb-2">快速選擇</div>
            <div className="flex flex-row sm:flex-col gap-2">
              {quickRanges.map((item) => (
                <Button
                  key={item.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs h-8 px-2 sm:w-28"
                  onClick={() => handleQuickSelect(item.range)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          
          {/* 日曆選擇器 */}
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onDayClick={restartOnComplete ? (day) => {
              const hasComplete = !!(dateRange?.from && dateRange?.to);
              const onlyFrom = !!(dateRange?.from && !dateRange?.to);
              if (onlyFrom) {
                const from = dateRange!.from!;
                if (day < from) {
                  onDateRangeChange({ from: day, to: from });
                } else {
                  onDateRangeChange({ from, to: day });
                }
                setIsOpen(false);
              } else {
                // 未選 或 已完成 → 重新開始，將此次點擊視為入住
                onDateRangeChange({ from: day, to: undefined });
              }
            } : undefined}
            onSelect={restartOnComplete ? undefined : (range) => {
              onDateRangeChange(range);
              if (range?.from && range?.to) {
                setIsOpen(false);
              }
            }}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
            disabled={allowFutureDates ? undefined : (date) => date > new Date()}
          />

        </div>
      </PopoverContent>
    </Popover>
  );
}
