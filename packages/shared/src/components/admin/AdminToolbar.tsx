import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lakeze/shared/components/ui/dropdown-menu";
import { cn } from "@lakeze/shared/lib/utils";

export interface AdminToolbarAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
}

export interface AdminToolbarProps {
  /** 左側標題（通常頁面已有 AdminPageHeader，可省略） */
  title?: ReactNode;
  /** 篩選 / 搜尋 / 日期等控制項；手機自動換行、每項至少 100% 或半寬 */
  filters?: ReactNode;
  /** 主要 CTA：任何斷點都直接可見，不收進 More Menu */
  primaryAction?: ReactNode;
  /**
   * 次要操作。Desktop 平鋪；Mobile（<md）超過 `collapseAfter` 筆時收進「⋯」選單。
   */
  secondaryActions?: AdminToolbarAction[];
  /** Mobile 直接顯示幾個次要操作（其餘收進 More Menu），預設 0 */
  collapseAfter?: number;
  className?: string;
}

/**
 * PMS 後台共用工具列。
 *
 * Desktop：標題 / 篩選 / 次要操作 / 主要操作 同一列，資訊密度不變。
 * Mobile：自動堆疊換行；篩選項目滿版、次要操作收進「⋯」，主要 CTA 永遠可見。
 * 不使用橫向捲動、不縮小字級、不截斷按鈕文字。
 */
export function AdminToolbar({
  title,
  filters,
  primaryAction,
  secondaryActions = [],
  collapseAfter = 0,
  className,
}: AdminToolbarProps) {
  const inlineOnMobile = secondaryActions.slice(0, Math.max(0, collapseAfter));
  const collapsedOnMobile = secondaryActions.slice(Math.max(0, collapseAfter));

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3 md:flex-row md:items-center", className)}>
      {title && <div className="min-w-0 text-base font-semibold md:text-lg">{title}</div>}

      {filters && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 [&>*]:min-w-0 [&_input]:admin-touch-target [&_button[role=combobox]]:admin-touch-target [&_button[role=combobox]]:w-full [&_input[type=search]]:w-full sm:[&_button[role=combobox]]:w-40">
          {filters}
        </div>
      )}

      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:ml-auto md:flex-nowrap">
        {/* Desktop：全部次要操作平鋪 */}
        <div className="hidden items-center gap-2 md:flex">
          {secondaryActions.map((a) => (
            <Button
              key={a.key}
              variant={a.variant ?? "outline"}
              onClick={a.onClick}
              disabled={a.disabled}
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
        </div>

        {/* Mobile：少量平鋪 + 其餘收進 More Menu */}
        <div className="flex items-center gap-2 md:hidden">
          {inlineOnMobile.map((a) => (
            <Button
              key={a.key}
              variant={a.variant ?? "outline"}
              onClick={a.onClick}
              disabled={a.disabled}
              className="admin-touch-target"
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
          {collapsedOnMobile.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="admin-icon-btn" aria-label="更多操作">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[60]">
                {collapsedOnMobile.map((a) => (
                  <DropdownMenuItem key={a.key} onSelect={a.onClick} disabled={a.disabled}>
                    {a.icon}
                    <span className={a.icon ? "ml-2" : undefined}>{a.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {primaryAction && (
          <div className="flex-1 md:flex-none [&>button]:w-full md:[&>button]:w-auto [&>button]:admin-touch-target">
            {primaryAction}
          </div>
        )}
      </div>
    </div>
  );
}
