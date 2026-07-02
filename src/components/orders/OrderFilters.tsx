import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { useOrderSources } from "@/hooks/use-order-sources";

interface OrderFiltersProps {
  dateType: string;
  startDate: string;
  endDate: string;
  paymentStatus: string;
  orderStatus: string;
  orderSource: string;
  searchKeyword: string;
  accommodationId?: string | null;
  onDateTypeChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPaymentStatusChange: (value: string) => void;
  onOrderStatusChange: (value: string) => void;
  onOrderSourceChange: (value: string) => void;
  onSearchKeywordChange: (value: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}

function DatePickerInput({ value, onChange, placeholder, fallbackDate }: { value: string; onChange: (val: string) => void; placeholder?: string; fallbackDate?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const dateObj = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const isValidDate = dateObj && !isNaN(dateObj.getTime());
  const fallbackObj = fallbackDate ? parse(fallbackDate, "yyyy-MM-dd", new Date()) : undefined;
  const fallbackValid = fallbackObj && !isNaN(fallbackObj.getTime());

  // Keep local text in sync with external prop value
  useEffect(() => {
    setText(value);
  }, [value]);

  const normalize = (raw: string): string | null => {
    const s = raw.trim().replace(/[./]/g, "-");
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const [, y, mo, d] = m;
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = parse(iso, "yyyy-MM-dd", new Date());
    if (isNaN(parsed.getTime())) return null;
    return iso;
  };

  const commit = () => {
    if (text === "") {
      onChange("");
      return;
    }
    const iso = normalize(text);
    if (iso) {
      onChange(iso);
      setText(iso);
    } else {
      setText(value);
    }
  };

  return (
    <div className="relative flex-1 md:w-[180px]">
      <Input
        type="text"
        inputMode="numeric"
        placeholder={placeholder || "YYYY-MM-DD"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-12 md:h-10 pr-10 text-base md:text-sm"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="開啟日曆"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[92vw] p-0" align="start" collisionPadding={12}>
          <Calendar
            mode="single"
            selected={isValidDate ? dateObj : undefined}
            defaultMonth={isValidDate ? dateObj : (fallbackValid ? fallbackObj : undefined)}
            onSelect={(date) => {
              if (date) {
                const iso = format(date, "yyyy-MM-dd");
                onChange(iso);
                setText(iso);
              }
              setOpen(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function OrderFilters({
  dateType,
  startDate,
  endDate,
  paymentStatus,
  orderStatus,
  orderSource,
  searchKeyword,
  accommodationId,
  onDateTypeChange,
  onStartDateChange,
  onEndDateChange,
  onPaymentStatusChange,
  onOrderStatusChange,
  onOrderSourceChange,
  onSearchKeywordChange,
  onClear,
  onSubmit,
}: OrderFiltersProps) {
  const orderSources = useOrderSources(accommodationId);
  return (
    <div className="space-y-4">
      {/* 日期區間 */}
      <div>
        <Label className="text-sm mb-2 block">日期區間</Label>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
          <select 
            className="w-full md:w-auto h-12 md:h-10 rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm touch-manipulation"
            value={dateType}
            onChange={(e) => onDateTypeChange(e.target.value)}
          >
            <option value="check_in">入住日期</option>
            <option value="order">訂購日期</option>
          </select>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <DatePickerInput
              value={startDate}
              onChange={(v) => {
                onStartDateChange(v);
                if (v && endDate && endDate < v) onEndDateChange("");
              }}
              placeholder="開始日期"
            />
            <span className="text-muted-foreground">-</span>
            <DatePickerInput
              value={endDate}
              onChange={onEndDateChange}
              placeholder="結束日期"
              fallbackDate={startDate}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 付款狀態 */}
        <div>
          <Label className="text-sm mb-2 block">付款狀態</Label>
          <select 
            className="w-full h-12 md:h-10 rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm touch-manipulation"
            value={paymentStatus}
            onChange={(e) => onPaymentStatusChange(e.target.value)}
          >
            <option value="">(全部)</option>
            <option value="unpaid">未付款</option>
            <option value="paid">已付清</option>
            <option value="overdue">已逾期</option>
            <option value="refunded">已退款</option>
            <option value="partial_refunded">部分退款</option>
          </select>
        </div>

        {/* 訂單狀態 */}
        <div>
          <Label className="text-sm mb-2 block">訂單狀態</Label>
          <select 
            className="w-full h-12 md:h-10 rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm touch-manipulation"
            value={orderStatus}
            onChange={(e) => onOrderStatusChange(e.target.value)}
          >
            <option value="">(全部)</option>
            <option value="hold">保留中</option>
            <option value="pending">待確認</option>
            <option value="confirmed">已確認</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        {/* 訂單來源 */}
        <div>
          <Label className="text-sm mb-2 block">訂單來源</Label>
          <select 
            className="w-full h-12 md:h-10 rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm touch-manipulation"
            value={orderSource}
            onChange={(e) => onOrderSourceChange(e.target.value)}
          >
            <option value="">(全部)</option>
            {orderSources.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* 關鍵字搜尋 */}
        <div>
          <Label className="text-sm mb-2 block">關鍵字</Label>
          <div className="relative">
            <Input
              type="text"
              placeholder="訂單編號/顧客/電話"
              value={searchKeyword}
              onChange={(e) => onSearchKeywordChange(e.target.value)}
              className="h-12 md:h-10 pr-10 text-base md:text-sm touch-manipulation"
            />
            {searchKeyword && (
              <button
                onClick={() => onSearchKeywordChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-2 touch-manipulation"
              >
                <X className="h-5 w-5 md:h-4 md:w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground h-11 md:h-9 flex-1 md:flex-none px-4 md:px-14 touch-manipulation"
        >
          清除
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          className="h-11 md:h-9 flex-1 md:flex-none px-4 md:px-14 touch-manipulation"
        >
          查詢
        </Button>
      </div>
    </div>
  );
}
