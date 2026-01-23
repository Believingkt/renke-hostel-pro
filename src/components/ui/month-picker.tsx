import * as React from "react";
import { useState, useEffect } from "react";
import { format } from "date-fns";
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
  value: string; // format: "yyyy-MM" or "all" if allowAll is true
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  allowAll?: boolean; // 是否允許選擇「全部月份」
  allLabel?: string; // 「全部月份」的標籤文字
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
  placeholder = "選擇月份",
  allowAll = false,
  allLabel = "全部月份"
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (value && value !== "all") {
      return parseInt(value.split("-")[0], 10);
    }
    return new Date().getFullYear();
  });

  // Parse the current value
  const isAllSelected = value === "all";
  const selectedYear = value && value !== "all" ? parseInt(value.split("-")[0], 10) : null;
  const selectedMonth = value && value !== "all" ? parseInt(value.split("-")[1], 10) : null;

  // Update viewYear when value changes
  useEffect(() => {
    if (value && value !== "all") {
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
    if (allowAll) {
      onChange("all");
    } else {
      onChange("");
    }
    setOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    onChange(`${year}-${month}`);
    setOpen(false);
  };

  const handleSelectAll = () => {
    onChange("all");
    setOpen(false);
  };

  // Format display text
  let displayText = placeholder;
  if (isAllSelected) {
    displayText = allLabel;
  } else if (value) {
    displayText = format(new Date(value + "-01"), "yyyy年MM月", { locale: zhTW });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            value && "bg-blue-600 text-white hover:bg-blue-700 border-blue-600",
            className
          )}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3">
          {/* All Months Option */}
          {allowAll && (
            <Button
              variant={isAllSelected ? "default" : "outline"}
              size="sm"
              className={cn(
                "w-full mb-3",
                isAllSelected && "bg-blue-600 text-white hover:bg-blue-700"
              )}
              onClick={handleSelectAll}
            >
              {allLabel}
            </Button>
          )}

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
              const isSelected = !isAllSelected && selectedYear === viewYear && selectedMonth === index + 1;
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
                    isSelected && "bg-blue-600 text-white hover:bg-blue-700",
                    !isSelected && isCurrentMonth && "border border-blue-600 text-blue-600"
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
              {allowAll ? allLabel : "清除"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
