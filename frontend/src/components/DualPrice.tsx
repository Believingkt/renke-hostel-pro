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
  /** 主幣別方向：TWD = NT$ 大字（預設）；SEC = 副幣別大字（例：¥）+ TWD 小字 */
  primary?: "TWD" | "SEC";
}

/**
 * 雙幣別價格顯示
 * 預設：主幣 TWD（粗體/大字），下方接小字參考價（例：≈ ¥ 56,400）
 * primary="SEC"：副幣別大字（例：¥ 75,175），下方 ≈ NT$ 14,769
 * 若 config 為 null/未啟用 → 僅顯示 TWD，無任何結構變動
 */
export function DualPrice({
  amount,
  config,
  className,
  secondaryClassName,
  align = "left",
  inline = false,
  primary = "TWD",
}: DualPriceProps) {
  const twd = formatTWD(amount);
  const sec = formatSecondary(amount, config);

  if (!sec) return <span className={className}>{twd}</span>;

  const primaryText = primary === "SEC" ? sec : twd;
  const secondaryText = primary === "SEC" ? twd : sec;

  if (inline) {
    return (
      <span className={className}>
        {primaryText}
        <span className={cn("ml-1 text-xs text-muted-foreground", secondaryClassName)}>
          （≈ {secondaryText}）
        </span>
      </span>
    );
  }

  const alignCls =
    align === "right" ? "items-end text-right" : align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <span className={cn("inline-flex flex-col leading-tight", alignCls, className)}>
      <span>{primaryText}</span>
      <span className={cn("text-[11px] text-muted-foreground mt-0.5", secondaryClassName)}>
        ≈ {secondaryText}
      </span>
    </span>
  );
}
