import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  icon: LucideIcon;
  variant: "coral" | "green" | "blue" | "purple";
}

const variantStyles = {
  coral: "bg-stat-coral-light text-stat-coral",
  green: "bg-stat-green-light text-stat-green",
  blue: "bg-stat-blue-light text-stat-blue",
  purple: "bg-stat-purple-light text-stat-purple",
};

export function StatCard({ title, value, change, icon: Icon, variant }: StatCardProps) {
  return (
    <Card className="p-6 transition-all hover:shadow-lg">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
            {change && (
              <span className="text-sm font-medium text-primary">{change}</span>
            )}
          </div>
        </div>
        <div className={cn("rounded-2xl p-4", variantStyles[variant])}>
          <Icon className="h-8 w-8" />
        </div>
      </div>
    </Card>
  );
}
