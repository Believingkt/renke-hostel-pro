/**
 * 全站統一的「原價劃掉 + 人客多優惠 -X%」顯示元件。
 * 訂房頁方案卡（桌機／手機）與結帳頁價格列共用，確保顏色與文案一致。
 */

export function calcDiscountPercent(original: number, price: number): number {
  if (!original || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

interface OriginalPriceProps {
  amount: number;
  /** sm 用於結帳頁／手機卡，md 用於桌機方案卡 */
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function OriginalPrice({ amount, size = "sm", className = "" }: OriginalPriceProps) {
  const sizeCls = size === "md" ? "text-[15px]" : size === "xs" ? "text-[10px]" : "text-sm";
  return (
    <span className={`${sizeCls} line-through text-muted-foreground tabular-nums ${className}`}>
      NT$ {amount.toLocaleString()}
    </span>
  );
}

interface SavingsBadgeProps {
  original: number;
  price: number;
  size?: "xs" | "sm" | "md";
  /** 是否顯示「人客多優惠」文字（空間不足時可只顯示百分比） */
  showLabel?: boolean;
  className?: string;
}

export function SavingsBadge({
  original,
  price,
  size = "sm",
  showLabel = true,
  className = "",
}: SavingsBadgeProps) {
  const percent = calcDiscountPercent(original, price);
  if (percent <= 0) return null;

  const sizeCls =
    size === "md"
      ? "text-[12px] px-2.5 py-0.5"
      : size === "xs"
        ? "text-[10px] px-1.5 py-px"
        : "text-[11px] px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-primary/10 font-medium text-primary align-middle whitespace-nowrap ${sizeCls} ${className}`}
    >
      {showLabel && <span>人客多優惠</span>}
      <span className="font-bold tabular-nums">-{percent}%</span>
    </span>
  );
}
