import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@lakeze/shared/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

/**
 * 統一的頁面標題組件
 * 用於所有管理頁面，確保標題樣式和響應式設計一致
 */
export function PageHeader({ title, description, icon: Icon, action, className }: PageHeaderProps) {
  return (
    <div className={cn("pb-3 md:pb-6 border-b border-primary/20 mb-4 md:mb-8", className)}>
      <div className="flex flex-col gap-3 md:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-start sm:items-center gap-2 md:gap-3">
              {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-primary flex-shrink-0 mt-1 sm:mt-0" />}
              <span className="min-w-0 leading-tight break-words [overflow-wrap:anywhere]">{title}</span>
            </h2>
            {description && (
              <p className="admin-help-text text-sm text-muted-foreground mt-1 ml-0 sm:ml-8 md:ml-10 break-words">
                {description}
              </p>
            )}
          </div>
          {action && (
            <div className="flex w-full flex-wrap items-center gap-2 min-w-0 sm:w-auto sm:flex-shrink-0 [&>button]:admin-touch-target">
              {action}
            </div>
          )}
        </div>
      </div>
    </div>

  );
}
