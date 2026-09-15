import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

export interface AdminStickyActionBarProps {
  children: ReactNode;
  /** 左側輔助資訊（例如「已修改未儲存」） */
  info?: ReactNode;
  className?: string;
}

/**
 * 長表單共用的底部操作列。
 *
 * Desktop：sticky 在內容底部，維持原有版面。
 * Mobile / APP：固定在畫面底部，含 iOS safe-area-inset-bottom；
 * 鍵盤開啟時以 useKeyboardInset 上推，避免遮住正在輸入的欄位。
 *
 * 使用時請在外層 AdminPageShell 傳 hasStickyActionBar 以預留空間。
 */
export function AdminStickyActionBar({ children, info, className }: AdminStickyActionBarProps) {
  const keyboardInset = useKeyboardInset();

  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 z-30 -mx-3 border-t bg-background/95 px-3 py-3 backdrop-blur md:-mx-0",
        "safe-bottom md:mx-0 md:rounded-lg md:border md:px-4",
        className,
      )}
      style={keyboardInset ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        {info && <div className="min-w-0 text-xs text-muted-foreground sm:text-sm">{info}</div>}
        <div className="flex items-center gap-2 sm:ml-auto [&>button]:flex-1 [&>button]:admin-touch-target sm:[&>button]:flex-none">
          {children}
        </div>
      </div>
    </div>
  );
}
