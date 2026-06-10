import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCounterAnimation } from "@/hooks/use-counter-animation";
import { useMemo } from "react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  icon: LucideIcon;
  variant: "coral" | "cyan" | "blue" | "purple";
  isUpdating?: boolean;
}

const variantStyles = {
  coral: "bg-stat-coral-light text-stat-coral",
  cyan: "bg-stat-cyan-light text-stat-cyan",
  blue: "bg-stat-blue-light text-stat-blue",
  purple: "bg-stat-purple-light text-stat-purple",
};

export function StatCard({ title, value, change, icon: Icon, variant, isUpdating }: StatCardProps) {
  const isMultiline = value.includes('\n');

  // 解析數字部分進行動畫
  const { numericValue, prefix, suffix } = useMemo(() => {
    if (isMultiline) return { numericValue: 0, prefix: '', suffix: value };
    const match = value.match(/^([^\d]*)([\d,]+)(.*)$/);
    if (match) {
      const numStr = match[2].replace(/,/g, '');
      return {
        numericValue: parseFloat(numStr) || 0,
        prefix: match[1],
        suffix: match[3]
      };
    }
    return { numericValue: 0, prefix: '', suffix: value };
  }, [value, isMultiline]);

  const animatedValue = useCounterAnimation(numericValue, 1000, true);

  // 格式化顯示值
  const displayValue = useMemo(() => {
    if (isMultiline) return value;
    if (numericValue === 0 && !prefix) {
      return value;
    }
    const formatted = animatedValue.toLocaleString();
    return `${prefix}${formatted}${suffix}`;
  }, [animatedValue, prefix, suffix, value, numericValue, isMultiline]);

  return (
    <Card className={cn(
      "p-3 md:p-6 transition-all hover:shadow-lg hover:scale-[1.02] duration-300 touch-manipulation cursor-pointer",
      isUpdating && "ring-2 ring-primary animate-pulse"
    )}>
      <div className="flex items-center justify-between gap-2 md:gap-3 select-none">
        <div className="space-y-1 md:space-y-2 flex-1 min-w-0">
          <p className="text-xs md:text-sm font-medium text-muted-foreground truncate leading-tight">{title}</p>
          <div className="flex items-baseline gap-1.5 md:gap-2 flex-wrap">
            <h3 className={cn(
              "text-2xl md:text-2xl lg:text-3xl font-bold tracking-tight transition-all duration-300",
              isUpdating && "text-primary scale-105"
            )}>{displayValue}</h3>
            {change && (
              <span className="text-xs md:text-sm font-medium text-primary whitespace-nowrap">{change}</span>
            )}
          </div>
        </div>
        <div className={cn(
          "rounded-lg p-2 md:rounded-2xl md:p-4 flex-shrink-0 transition-all duration-300",
          variantStyles[variant],
          isUpdating && "scale-110 animate-pulse"
        )}>
          <Icon className="h-5 w-5 md:h-8 md:w-8 transition-transform duration-300 hover:scale-110" />
        </div>
      </div>
    </Card>
  );
}
