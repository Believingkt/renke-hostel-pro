import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Users, Bed, Tag, Utensils, Home } from "lucide-react";

interface Props {
  accommodationName?: string;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  calculateNights: () => number;
  totalGuests: number;
  selectedRoom: any;
  selectedTemplate?: { template_name?: string; project_name?: string; mealCount?: number } | null;
  calculateFinalTotal: () => number;
  appliedDiscount: { code: string } | null;
  calculateDiscount: () => number;
}

/**
 * Booking.com 風格的行動版訂單摘要卡片。
 * 顯示於單頁結帳最上方，取代原本置底的完整 sidebar。
 */
export default function MobileOrderSummary({
  accommodationName,
  checkInDate,
  checkOutDate,
  calculateNights,
  totalGuests,
  selectedRoom,
  selectedTemplate,
  calculateFinalTotal,
  appliedDiscount,
  calculateDiscount,
}: Props) {
  if (!checkInDate || !checkOutDate) return null;

  const nights = calculateNights();
  const finalTotal = calculateFinalTotal();
  const discount = calculateDiscount();

  const formatDate = (d: Date) => format(d, "M 月 d 日 EEE", { locale: zhTW });

  const mealCount = selectedTemplate?.mealCount ?? 0;
  const mealLabel =
    mealCount >= 3 ? "一泊三食" : mealCount === 2 ? "一泊二食" : mealCount === 1 ? "一泊一食" : "純住宿";
  const packageLabel = selectedTemplate?.project_name || selectedTemplate?.template_name;

  return (
    <div className="lg:hidden mb-4">
      <div className="rounded-xl border-2 border-border bg-card overflow-hidden shadow-sm">
        {/* 民宿名稱 */}
        {accommodationName && (
          <div className="px-4 py-2.5 bg-primary/10 border-b border-border flex items-center gap-2">
            <Home className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm font-bold text-primary truncate">{accommodationName}</p>
          </div>
        )}

        {/* 日期列 */}
        <div className="px-4 py-3 flex items-stretch justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">入住</p>
            <p className="text-base font-bold text-foreground leading-tight">
              {formatDate(checkInDate)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center px-2 shrink-0">
            <div className="h-px w-6 bg-border" />
            <span className="text-xs text-muted-foreground my-1">{nights} 晚</span>
            <div className="h-px w-6 bg-border" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-xs text-muted-foreground mb-1">退房</p>
            <p className="text-base font-bold text-foreground leading-tight">
              {formatDate(checkOutDate)}
            </p>
          </div>
        </div>

        {/* 房型 + 餐食 */}
        {selectedRoom && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground leading-snug">
                {selectedRoom.name}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">1 單位</span>
            </div>
            {packageLabel && (
              <p className="text-xs text-muted-foreground leading-snug">方案：{packageLabel}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {totalGuests} 人
              </span>
              {selectedRoom.max_guests && (
                <span className="inline-flex items-center gap-1">
                  <Bed className="h-3.5 w-3.5" />
                  上限 {selectedRoom.max_guests} 人
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Utensils className="h-3.5 w-3.5" />
                {mealLabel}
              </span>
            </div>
            {appliedDiscount && discount > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 rounded-md px-2 py-1">
                <Tag className="h-3 w-3" />
                <span>已套用 {appliedDiscount.code}，折抵 NT$ {discount.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* 總金額 */}
        {selectedRoom && finalTotal > 0 && (
          <div className="border-t border-border px-4 py-3 flex items-baseline justify-between bg-muted/30">
            <span className="text-sm text-muted-foreground">總金額</span>
            <span className="text-xl font-bold text-primary">
              NT$ {finalTotal.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
