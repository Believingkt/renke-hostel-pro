import { boostedAmount } from "@/lib/bonusMultiplier";
import { cn } from "@/lib/utils";

const fmt = (n: number) => `NT$ ${Math.round(Number(n ?? 0)).toLocaleString()}`;

interface BoostedAmountProps {
  amount: number;
  multiplier: number;
  className?: string;
  /** true 時原始金額與加倍金額分兩行顯示（表格欄位建議用 inline） */
  stacked?: boolean;
}

/**
 * 顯示原始獎金金額；若該月有加倍活動，另外顯示加倍後金額，不覆蓋原始數字。
 */
export function BoostedAmount({ amount, multiplier, className, stacked }: BoostedAmountProps) {
  const mult = Number(multiplier) || 1;
  if (mult <= 1) return <span className={cn("tabular-nums", className)}>{fmt(amount)}</span>;

  return (
    <span
      className={cn(
        "tabular-nums",
        stacked ? "flex flex-col items-end leading-tight" : "inline-flex items-center gap-1",
        className,
      )}
    >
      <span className="text-muted-foreground line-through">{fmt(amount)}</span>
      <span className="font-semibold text-primary">
        {fmt(boostedAmount(amount, mult))}
        <span className="ml-1 text-xs font-normal text-primary/80">×{mult.toFixed(2)}</span>
      </span>
    </span>
  );
}

export default BoostedAmount;
