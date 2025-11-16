import { useState } from "react";
import { format } from "date-fns";
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

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({ dateRange, onDateRangeChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateRangeChange(undefined);
    setIsOpen(false);
  };

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
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={(range) => {
            onDateRangeChange(range);
            if (range?.from && range?.to) {
              setIsOpen(false);
            }
          }}
          numberOfMonths={2}
          className={cn("p-3 pointer-events-auto")}
          disabled={(date) => date > new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
