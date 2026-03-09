import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
          <Button variant="ghost" size="icon" className="hidden md:flex h-10 w-10">
            <Calendar className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="h-12 md:h-10 flex-1 md:w-auto text-base md:text-sm touch-manipulation"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="h-12 md:h-10 flex-1 md:w-auto text-base md:text-sm touch-manipulation"
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
            <option value="pending">待確認</option>
            <option value="confirmed">已確認</option>
            <option value="checked_in">已入住</option>
            <option value="checked_out">已退房</option>
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
            <option value="website">官網下單</option>
            <option value="manual">後台</option>
            <option value="agoda">Agoda</option>
            <option value="booking">Booking</option>
            <option value="trip">Trip</option>
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

      {/* 清除按鈕 */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground h-10 md:h-9 touch-manipulation"
        >
          清除所有篩選
        </Button>
      </div>
    </div>
  );
}
