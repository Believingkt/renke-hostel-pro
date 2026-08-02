/** 底部吸附總價列 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PriceBarProps {
  label: string;
  amount: number;
  ctaLabel: string;
  onCta?: () => void;
  disabled?: boolean;
  className?: string;
}

export function PriceBar({ label, amount, ctaLabel, onCta, disabled, className }: PriceBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur",
        "px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold text-primary tabular-nums">
            NT$ {amount.toLocaleString()}
          </div>
        </div>
        <Button
          size="lg"
          className="rounded-xl px-6"
          onClick={onCta}
          disabled={disabled}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

export default PriceBar;
