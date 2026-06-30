import { cn } from "@/lib/utils";
import { formatTWD, formatSecondary, type SecondaryCurrencyConfig } from "@/lib/currency";

interface DualPriceProps {
  amount: number | null | undefined;
  config: SecondaryCurrencyConfig | null | undefined;
  className?: string;
  secondaryClassName?: string;
  align?: "left" | "right" | "center";
  /** 強制行內顯示（少數空間極小的場景使用），預設為下方小字 */
  inline?: boolean;
}

/**
 * 雙幣別價格顯示
 * 預設：主幣 TWD（粗體/大字），下方接小字參考價（例：≈ ¥ 56,400）
 * 若 config 為 null/未啟用 → 僅顯示 TWD，無任何結構變動
 */
export function DualPrice({
  amount,
  config,
  className,
  secondaryClassName,
  align = "left",
  inline = false,
}: DualPriceProps) {
  const primary = formatTWD(amount);
  const secondary = formatSecondary(amount, config);

  if (!secondary) return <span className={className}>{primary}</span>;

  if (inline) {
    return (
      <span className={className}>
        {primary}
        <span className={cn("ml-1 text-xs text-muted-foreground", secondaryClassName)}>
          （≈ {secondary}）
        </span>
      </span>
    );
  }

  const alignCls =
    align === "right" ? "items-end text-right" : align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <span className={cn("inline-flex flex-col leading-tight", alignCls, className)}>
      <span>{primary}</span>
      <span className={cn("text-[11px] text-muted-foreground mt-0.5", secondaryClassName)}>
        ≈ {secondary}
      </span>
    </span>
  );
}
