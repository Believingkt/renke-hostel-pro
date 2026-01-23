import * as React from "react";
import { useState, useEffect } from "react";
import { format, startOfMonth } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MonthPickerProps {
  value: string; // format: "yyyy-MM"
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const months = [
  "1月", "2月", "3月", "4月",
  "5月", "6月", "7月", "8月",
  "9月", "10月", "11月", "12月"
];

export function MonthPicker({ 
  value, 
  onChange, 
  className,
  placeholder = "選擇月份" 
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (value) {
      return parseInt(value.split("-")[0], 10);
    }
    return new Date().getFullYear();
  });

  // Parse the current value
  const selectedYear = value ? parseInt(value.split("-")[0], 10) : null;
  const selectedMonth = value ? parseInt(value.split("-")[1], 10) : null;

  // Update viewYear when value changes
  useEffect(() => {
    if (value) {
      setViewYear(parseInt(value.split("-")[0], 10));
    }
  }, [value]);

  const handleMonthSelect = (monthIndex: number) => {
    const month = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewYear}-${month}`);
    setOpen(false);
  };

  const handlePrevYear = () => {
    setViewYear(prev => prev - 1);
  };

  const handleNextYear = () => {
    setViewYear(prev => prev + 1);
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    onChange(`${year}-${month}`);
    setOpen(false);
  };

  // Format display text
  const displayText = value 
    ? format(new Date(value + "-01"), "yyyy年MM月", { locale: zhTW })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3">
          {/* Year Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrevYear}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-lg">{viewYear}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextYear}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-4 gap-2">
            {months.map((month, index) => {
              const isSelected = selectedYear === viewYear && selectedMonth === index + 1;
              const isCurrentMonth = 
                new Date().getFullYear() === viewYear && 
                new Date().getMonth() === index;

              return (
                <Button
                  key={month}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-10",
                    isSelected && "bg-primary text-primary-foreground",
                    !isSelected && isCurrentMonth && "border border-primary text-primary"
                  )}
                  onClick={() => handleMonthSelect(index)}
                >
                  {month}
                </Button>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex justify-between mt-4 pt-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              清除
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary"
              onClick={handleToday}
            >
              本月
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
