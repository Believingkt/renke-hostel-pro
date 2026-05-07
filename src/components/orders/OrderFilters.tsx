import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";

interface OrderFiltersProps {
  dateType: string;
  startDate: string;
  endDate: string;
  paymentStatus: string;
  orderStatus: string;
  orderSource: string;
  searchKeyword: string;
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

function DatePickerInput({ value, onChange, placeholder }: { value: string; onChange: (val: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const dateObj = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const isValidDate = dateObj && !isNaN(dateObj.getTime());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 md:h-10 flex-1 md:w-[160px] justify-start text-left font-normal text-base md:text-sm touch-manipulation",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          {isValidDate ? format(dateObj, "yyyy/MM/dd") : <span>{placeholder || "選擇日期"}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValidDate ? dateObj : undefined}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, "yyyy-MM-dd"));
            }
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
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
            <DatePickerInput value={startDate} onChange={onStartDateChange} placeholder="開始日期" />
            <span className="text-muted-foreground">-</span>
            <DatePickerInput value={endDate} onChange={onEndDateChange} placeholder="結束日期" />
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
            <option value="deposit_paid">已付訂金</option>
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
            <option value="website">官網訂房</option>
            <option value="manual">現場訂房</option>
            <option value="line">Line@</option>
            <option value="agoda">Agoda</option>
            <option value="booking">Booking</option>
            <option value="trip">Trip</option>
             <option value="travel_agency">旅行社</option>
             <option value="kol">KOL互惠</option>
             <option value="points_starchain">星鏈會員</option>
             <option value="official_use">公務使用</option>
             <option value="franchise_diff">加盟價差</option>
             <option value="owner_provided">業主自帶</option>
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
          className="text-muted-foreground h-10 md:h-9 px-14 touch-manipulation"
        >
          清除
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          className="h-10 md:h-9 px-14 touch-manipulation"
        >
          查詢
        </Button>
      </div>
    </div>
  );
}
