import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

interface RequireModuleProps {
  module: string;
  children: ReactNode;
}

/**
 * 路由級別權限守衛：若該 staff 對此模組為「不可見」，顯示無權限提示。
 */
export function RequireModule({ module, children }: RequireModuleProps) {
  const { canView, isLoading } = useStaffPermissions();

  if (isLoading) return null;

  if (!canView(module)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">沒有存取權限</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          此頁面已被設定為不可見，請聯絡民宿管理員調整權限。
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
