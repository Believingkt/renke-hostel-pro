import { ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

interface RequireHQRoleProps {
  /** 任一角色符合即放行 */
  allow: string[];
  /** 無權限時導向的路徑，預設 /hq */
  redirectTo?: string;
  /** 未登入時導向的路徑，預設 /hq-auth */
  authRedirectTo?: string;
  children: ReactNode | ((roles: string[]) => ReactNode);
}

/**
 * HQ 路由角色守衛：未具備指定角色者顯示提示並導回總部首頁。
 * DB RLS 仍是最終防線，這層負責避免「輸入網址即可看到設定內容」。
 */
export function RequireHQRole({
  allow,
  redirectTo = "/hq",
  authRedirectTo = "/hq-auth",
  children,
}: RequireHQRoleProps) {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean>(true);
  const location = useLocation();
  const notifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (!cancelled) {
          setSignedIn(false);
          setRoles([]);
        }
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!cancelled) setRoles((data ?? []).map((r: { role: string }) => r.role));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const denied = roles !== null && !roles.some((r) => allow.includes(r));

  useEffect(() => {
    if (!denied || notifiedRef.current) return;
    notifiedRef.current = true;
    if (!signedIn) {
      toast.error("請先登入總部帳號", { description: "登入後才能存取此設定頁面。" });
    } else {
      toast.error("沒有存取權限", { description: "此頁面僅限總部管理者使用，已將你導回總部首頁。" });
    }
  }, [denied, signedIn]);

  if (roles === null) return null;

  if (denied) {
    const target = signedIn ? redirectTo : authRedirectTo;
    if (location.pathname !== target) {
      return <Navigate to={target} replace state={{ from: location.pathname }} />;
    }
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

