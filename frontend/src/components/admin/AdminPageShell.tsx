import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PMS 後台「頁面內容層」共用外框。
 *
 * 不取代 ConditionalLayout（SidebarProvider → AppSidebar → Header → main → footer），
 * 只統一 main 裡面每個頁面的：內容寬度、垂直間距、手機底部留白、safe-area、overflow 行為。
 *
 * Desktop 不改變資訊密度；Mobile 只調整 presentation。
 */
export interface AdminPageShellProps {
  children: ReactNode;
  /** 頁面標題區（通常放 AdminPageHeader / AdminToolbar） */
  header?: ReactNode;
  /** 內容最大寬度；預設 full（後台表格需要寬度） */
  maxWidth?: "full" | "7xl" | "5xl" | "3xl";
  /** 垂直間距密度 */
  spacing?: "tight" | "default" | "loose";
  /** 頁面底部是否有 sticky action bar，預留空間避免被遮住 */
  hasStickyActionBar?: boolean;
  className?: string;
  contentClassName?: string;
}

const MAX_WIDTH: Record<NonNullable<AdminPageShellProps["maxWidth"]>, string> = {
  full: "",
  "7xl": "max-w-7xl",
  "5xl": "max-w-5xl",
  "3xl": "max-w-3xl",
};

const SPACING: Record<NonNullable<AdminPageShellProps["spacing"]>, string> = {
  tight: "space-y-3 md:space-y-4",
  default: "space-y-4 md:space-y-6",
  loose: "space-y-6 md:space-y-8",
};

export function AdminPageShell({
  children,
  header,
  maxWidth = "full",
  spacing = "default",
  hasStickyActionBar = false,
  className,
  contentClassName,
}: AdminPageShellProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-x-hidden",
        MAX_WIDTH[maxWidth],
        maxWidth !== "full" && "mx-auto",
        SPACING[spacing],
        // 手機底部留白（含 iOS safe area）；有 sticky bar 時再多留一段
        hasStickyActionBar ? "pb-28 md:pb-24" : "pb-4 md:pb-4",
        "safe-bottom",
        className,
      )}
    >
      {header}
      <div className={cn("min-w-0", SPACING[spacing], contentClassName)}>{children}</div>
    </div>
  );
}

/** 後台頁面的載入 / 空 / 錯誤狀態統一容器（高度一致，避免版面跳動） */
export function AdminPageState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[180px] flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
