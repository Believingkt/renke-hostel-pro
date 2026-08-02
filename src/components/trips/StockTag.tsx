/** 房況標籤：餘 N 間（success 綠）／已滿（灰） */
import { cn } from "@/lib/utils";

interface StockTagProps {
  /** null = 查詢中 */
  available: number | null;
  blocked?: boolean;
  loading?: boolean;
  texts: {
    remain: (n: number) => string;
    soldOut: string;
    checking: string;
  };
  className?: string;
}

export function StockTag({ available, blocked, loading, texts, className }: StockTagProps) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

  if (loading || available === null) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground", className)}>{texts.checking}</span>
    );
  }

  const soldOut = blocked || available <= 0;
  return (
    <span
      className={cn(
        base,
        soldOut
          ? "bg-muted text-muted-foreground"
          : "bg-success-light text-success-dark border border-success/20",
        className,
      )}
    >
      {soldOut ? texts.soldOut : texts.remain(available)}
    </span>
  );
}

export default StockTag;
