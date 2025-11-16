import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  return (
    <Card className={cn(
      "p-4 md:p-6 transition-all hover:shadow-lg",
      isUpdating && "ring-2 ring-primary animate-pulse"
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1 md:space-y-2 flex-1 min-w-0">
          <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <div className="flex items-baseline gap-1 md:gap-2 flex-wrap">
            <h3 className={cn(
              "text-xl md:text-2xl lg:text-3xl font-bold tracking-tight",
              isUpdating && "text-primary"
            )}>{value}</h3>
            {change && (
              <span className="text-xs md:text-sm font-medium text-primary whitespace-nowrap">{change}</span>
            )}
          </div>
        </div>
        <div className={cn(
          "rounded-xl p-3 md:rounded-2xl md:p-4 flex-shrink-0 transition-all",
          variantStyles[variant],
          isUpdating && "scale-110"
        )}>
          <Icon className="h-6 w-6 md:h-8 md:w-8" />
        </div>
      </div>
    </Card>
  );
}
