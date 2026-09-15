import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * 後台表單共用區塊。統一標題 / 說明 / 分隔與間距。
 */
export function AdminFormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 space-y-3", className)}>
      {(title || description || action) && (
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold md:text-base">{title}</h3>}
            {description && (
              <p className="text-xs text-muted-foreground md:text-sm">{description}</p>
            )}
          </div>
          {action && <div className="sm:ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * 後台表單網格。Mobile 一律單欄，tablet / desktop 才展開多欄。
 * 禁止再直接寫沒有 breakpoint 的 grid-cols-2 / grid-cols-3。
 */
export function AdminFormGrid({
  columns = 2,
  children,
  className,
}: {
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const cols: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };
  return (
    <div className={cn("grid min-w-0 gap-3 md:gap-4", cols[columns], className)}>{children}</div>
  );
}

/** 單一欄位容器：label / required / description / error / help text */
export function AdminFormField({
  label,
  htmlFor,
  required,
  description,
  error,
  help,
  span,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  help?: ReactNode;
  /** 在多欄網格中橫跨欄數 */
  span?: 1 | 2 | 3 | "full";
  children: ReactNode;
  className?: string;
}) {
  const spanClass =
    span === "full"
      ? "sm:col-span-full"
      : span === 3
        ? "sm:col-span-2 lg:col-span-3"
        : span === 2
          ? "sm:col-span-2"
          : undefined;

  return (
    <div className={cn("min-w-0 space-y-1.5", spanClass, className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-sm">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
      {help && !error && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
