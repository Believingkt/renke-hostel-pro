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
  searchKeyword: string;
  onDateTypeChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPaymentStatusChange: (value: string) => void;
  onOrderStatusChange: (value: string) => void;
  onSearchKeywordChange: (value: string) => void;
  onClear: () => void;
}

export function OrderFilters({
  dateType,
  startDate,
  endDate,
  paymentStatus,
  orderStatus,
  searchKeyword,
  onDateTypeChange,
  onStartDateChange,
  onEndDateChange,
  onPaymentStatusChange,
  onOrderStatusChange,
  onSearchKeywordChange,
  onClear,
}: OrderFiltersProps) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* 日期區間 */}
      <div className="col-span-6">
        <Label className="text-sm mb-2 block">日期區間</Label>
        <div className="flex items-center gap-2">
          <select 
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={dateType}
            onChange={(e) => onDateTypeChange(e.target.value)}
          >
            <option value="check_in">入住日期</option>
            <option value="order">訂購日期</option>
          </select>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <Calendar className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="h-10"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="h-10"
          />
        </div>
      </div>

      {/* 付款狀態 */}
      <div className="col-span-2">
        <Label className="text-sm mb-2 block">付款狀態</Label>
        <select 
          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={paymentStatus}
          onChange={(e) => onPaymentStatusChange(e.target.value)}
        >
          <option value="">(全部)</option>
          <option value="unpaid">未付款</option>
          <option value="deposit_paid">已付訂金</option>
          <option value="paid">已付清</option>
          <option value="overdue">已逾期</option>
        </select>
      </div>

      {/* 訂單狀態 */}
      <div className="col-span-2">
        <Label className="text-sm mb-2 block">訂單狀態</Label>
        <select 
          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
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

      {/* 關鍵字搜尋 */}
      <div className="col-span-2">
        <Label className="text-sm mb-2 block">關鍵字</Label>
        <div className="relative">
          <Input
            type="text"
            placeholder="訂單編號/顧客/電話"
            value={searchKeyword}
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            className="h-10 pr-8"
          />
          {searchKeyword && (
            <button
              onClick={() => onSearchKeywordChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 清除篩選按鈕 */}
      <div className="col-span-12">
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          清除所有篩選
        </Button>
      </div>
    </div>
  );
}
