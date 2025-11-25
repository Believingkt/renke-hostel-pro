import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

/**
 * 統一的頁面標題組件
 * 用於所有管理頁面，確保標題樣式和響應式設計一致
 */
export function PageHeader({ title, icon: Icon, action, className }: PageHeaderProps) {
  return (
    <div className={cn("pb-4 md:pb-6 border-b border-primary/20 mb-4 md:mb-6", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2 md:gap-3">
          {Icon && <Icon className="h-6 w-6 md:h-7 md:w-7 text-primary flex-shrink-0" />}
          <span className="leading-tight">{title}</span>
        </h2>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
