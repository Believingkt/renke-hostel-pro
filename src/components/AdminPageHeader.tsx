import { Link } from "react-router-dom";
import { Home, LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface AdminBreadcrumbItem {
  /** 顯示文字 */
  label: string;
  /** 可選連結；無連結則為靜態分組名稱 */
  href?: string;
}

interface AdminPageHeaderProps {
  /** 標題 */
  title: string;
  /** 副標題說明,通常省略 */
  description?: string;
  /** 標題前圖示 */
  icon?: LucideIcon;
  /** 中段麵包屑分組(在首頁與當前頁之間),可省略 */
  breadcrumbs?: AdminBreadcrumbItem[];
  /** 右側操作按鈕 */
  action?: ReactNode;
  /** 外層額外 className */
  className?: string;
  /** 子內容(版型保留接續節點用) */
  children?: ReactNode;
}

/**
 * 後台頁面共用的標題版型(麵包屑 + PageHeader),確保所有頁面間距與圖示樣式一致。
 *
 * 使用方式:
 *   <AdminPageHeader title="預訂管理" icon={Package}
 *     breadcrumbs={[{ label: "訂單資訊" }]} />
 */
export function AdminPageHeader({
  title,
  description,
  icon,
  breadcrumbs = [],
  action,
  className,
  children,
}: AdminPageHeaderProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                to="/admin"
                className="flex items-center hover:opacity-70 transition-opacity"
              >
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbs.map((item, idx) => (
            <span key={`${item.label}-${idx}`} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {item.href ? (
                  <BreadcrumbLink asChild>
                    <Link to={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink className="text-muted-foreground">
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          ))}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
      />

      {children}
    </div>
  );
}
