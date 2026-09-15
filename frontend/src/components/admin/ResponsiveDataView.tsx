import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AdminPageState } from "./AdminPageShell";

export interface ResponsiveColumn<T> {
  key: string;
  header: ReactNode;
  /** Desktop 儲存格內容 */
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** 欄寬 class，例如 "w-32" */
  className?: string;
  headerClassName?: string;
  /** 是否 sticky 於左側（Desktop 橫向捲動時固定） */
  sticky?: boolean;
}

export interface ResponsiveRowAction<T> {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: (row: T) => void;
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  destructive?: boolean;
}

export interface MobileCardConfig<T> {
  /** 卡片主要資訊（標題列左側） */
  title: (row: T) => ReactNode;
  /** 標題下方次要資訊 */
  subtitle?: (row: T) => ReactNode;
  /** 標題列右側（通常為狀態 badge 或金額） */
  status?: (row: T) => ReactNode;
  /** 卡片主體：label / value 欄位清單 */
  fields?: (row: T) => Array<{ label: string; value: ReactNode }>;
  /** 卡片底部自訂內容 */
  footer?: (row: T) => ReactNode;
}

export interface ResponsiveDataViewProps<T> {
  rows: T[];
  columns: ResponsiveColumn<T>[];
  rowKey: (row: T) => string;
  /** Mobile 卡片渲染設定；未提供時以 columns 自動組 label/value */
  mobileCard?: MobileCardConfig<T>;
  /** 自行完全接管 Mobile 卡片內容（優先於 mobileCard） */
  renderMobileCard?: (row: T) => ReactNode;
  rowActions?: ResponsiveRowAction<T>[];
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  loading?: boolean;
  loadingText?: ReactNode;
  empty?: ReactNode;
  /** 強制以某種型態呈現（測試 / 特殊頁面用） */
  forceMode?: "table" | "card";
  className?: string;
}

/**
 * PMS 後台一般資料表共用元件。
 *
 * Desktop（>=768px）：Table，維持既有資訊密度與欄位。
 * Mobile（<768px）：Card / List，不做 1100px 表格的水平捲動。
 *
 * 注意：日期矩陣型頁面（RoomPriceCalendar / PackagePriceCalendar）不適用本元件。
 */
export function ResponsiveDataView<T>({
  rows,
  columns,
  rowKey,
  mobileCard,
  renderMobileCard,
  rowActions = [],
  onRowClick,
  rowClassName,
  loading = false,
  loadingText = "載入中...",
  empty = "目前沒有資料",
  forceMode,
  className,
}: ResponsiveDataViewProps<T>) {
  const isMobileViewport = useIsMobile();
  const isCard = forceMode ? forceMode === "card" : isMobileViewport;

  if (loading) {
    return <AdminPageState>{loadingText}</AdminPageState>;
  }
  if (rows.length === 0) {
    return <AdminPageState>{empty}</AdminPageState>;
  }

  const visibleActions = (row: T) => rowActions.filter((a) => !a.hidden?.(row));

  const actionMenu = (row: T) => {
    const acts = visibleActions(row);
    if (acts.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="admin-icon-btn"
            aria-label="操作"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[60]">
          {acts.map((a) => (
            <DropdownMenuItem
              key={a.key}
              disabled={a.disabled?.(row)}
              className={a.destructive ? "text-destructive focus:text-destructive" : undefined}
              onSelect={() => a.onSelect(row)}
            >
              {a.icon}
              <span className={a.icon ? "ml-2" : undefined}>{a.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (isCard) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {rows.map((row) => {
          const key = rowKey(row);
          if (renderMobileCard) {
            return (
              <div key={key} className={cn("min-w-0", rowClassName?.(row))}>
                {renderMobileCard(row)}
              </div>
            );
          }
          const fields =
            mobileCard?.fields?.(row) ??
            columns.map((c) => ({ label: String(c.key), value: c.cell(row) }));
          return (
            <div
              key={key}
              className={cn(
                "min-w-0 rounded-lg border bg-card p-3 shadow-sm",
                onRowClick && "cursor-pointer active:bg-muted/50",
                rowClassName?.(row),
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {mobileCard?.title?.(row) ?? columns[0]?.cell(row)}
                  </div>
                  {mobileCard?.subtitle && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {mobileCard.subtitle(row)}
                    </div>
                  )}
                </div>
                {mobileCard?.status && <div className="shrink-0">{mobileCard.status(row)}</div>}
                {actionMenu(row)}
              </div>

              {fields.length > 0 && (
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 border-t pt-2 text-sm sm:grid-cols-2">
                  {fields.map((f, i) => (
                    <div key={`${key}-f${i}`} className="flex min-w-0 items-start justify-between gap-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{f.label}</dt>
                      <dd className="min-w-0 break-words text-right text-sm">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {mobileCard?.footer && <div className="mt-2 border-t pt-2">{mobileCard.footer(row)}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 overflow-x-auto", className)}>
      <Table className="fixed-table">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn(
                  "whitespace-nowrap",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.sticky && "sticky left-0 z-20 bg-background",
                  c.headerClassName,
                  c.className,
                )}
              >
                {c.header}
              </TableHead>
            ))}
            {rowActions.length > 0 && <TableHead className="w-16 text-right">操作</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <TableRow
                key={key}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell
                    key={`${key}-${c.key}`}
                    className={cn(
                      c.align === "right" && "text-right tabular-nums",
                      c.align === "center" && "text-center",
                      c.sticky && "sticky left-0 z-10 bg-background",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
                {rowActions.length > 0 && (
                  <TableCell className="text-right">{actionMenu(row)}</TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
