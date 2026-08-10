import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert } from "lucide-react";

interface RequireHQRoleProps {
  /** 任一角色符合即放行 */
  allow: string[];
  children: ReactNode | ((roles: string[]) => ReactNode);
}

/**
 * HQ 路由角色守衛：未具備指定角色者不渲染頁面內容。
 * DB RLS 仍是最終防線，這層負責避免「輸入網址即可看到設定內容」。
 */
export function RequireHQRole({ allow, children }: RequireHQRoleProps) {
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (!cancelled) setRoles([]);
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!cancelled) setRoles((data ?? []).map((r: { role: string }) => r.role));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (roles === null) return null;

  if (!roles.some((r) => allow.includes(r))) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">沒有存取權限</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          此頁面僅限總部管理者使用，請聯絡系統管理員。
        </p>
      </div>
    );
  }

  return <>{typeof children === "function" ? children(roles) : children}</>;
}
