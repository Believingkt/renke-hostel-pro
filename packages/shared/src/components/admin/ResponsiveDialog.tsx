import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lakeze/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@lakeze/shared/components/ui/sheet";
import { useIsMobile } from "@lakeze/shared/hooks/use-mobile";
import { cn } from "@lakeze/shared/lib/utils";

export type ResponsiveDialogSize =
  /** 小型確認框：手機仍維持 Dialog */
  | "confirm"
  /** 一般編輯表單：手機改為全螢幕 Sheet */
  | "form"
  /** 日曆 / 複雜管理介面：手機一定全螢幕 */
  | "full";

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ResponsiveDialogSize;
  children: ReactNode;
  /** 底部操作區；手機時固定在 Sheet 底部（含 safe-area） */
  footer?: ReactNode;
  /** 有未儲存變更時，點 overlay / ESC 需自行確認 */
  onRequestClose?: () => void;
  className?: string;
  contentClassName?: string;
}

const DESKTOP_WIDTH: Record<ResponsiveDialogSize, string> = {
  confirm: "sm:max-w-md",
  form: "sm:max-w-2xl",
  full: "sm:max-w-5xl",
};

/**
 * 後台共用 Dialog。
 *
 * Desktop：維持 Dialog（尺寸依 size）。
 * Mobile（<768px）：
 *  - size="confirm" → 仍為 Dialog（小型確認不需全螢幕）
 *  - size="form" / "full" → 全螢幕 Sheet
 *
 * focus management / ESC / overlay / close 皆由 Radix 提供，行為與原本一致。
 * 有未儲存變更時傳入 onRequestClose，元件會攔截關閉動作交由頁面決定。
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "form",
  children,
  footer,
  onRequestClose,
  className,
  contentClassName,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  const handleOpenChange = (next: boolean) => {
    if (!next && onRequestClose) {
      onRequestClose();
      return;
    }
    onOpenChange(next);
  };

  const useSheet = isMobile && size !== "confirm";

  if (useSheet) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "admin-theme flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 rounded-none p-0",
            className,
          )}
        >
          {(title || description) && (
            <SheetHeader className="shrink-0 space-y-1 border-b px-4 py-3 text-left">
              {title && <SheetTitle className="pr-8 text-base">{title}</SheetTitle>}
              {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
            </SheetHeader>
          )}
          <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3", contentClassName)}>
            {children}
          </div>
          {footer && (
            <div className="safe-bottom shrink-0 border-t bg-background px-4 py-3">
              <div className="flex items-center gap-2 [&>button]:flex-1 [&>button]:admin-touch-target">
                {footer}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("max-h-[90vh] overflow-hidden p-0", DESKTOP_WIDTH[size], className)}
      >
        <div className="flex max-h-[90vh] flex-col">
          {(title || description) && (
            <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
              {title && <DialogTitle>{title}</DialogTitle>}
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
          )}
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-4", contentClassName)}>
            {children}
          </div>
          {footer && (
            <DialogFooter className="shrink-0 border-t px-6 py-3">{footer}</DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
