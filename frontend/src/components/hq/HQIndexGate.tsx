import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  HQ_FULL_ACCESS_ROLES,
  HQ_LOGIN_ROLES,
  HQ_OWNER_SETTLEMENT_LANDING,
} from "@/lib/hqAccess";

/**
 * /hq 首頁守衛：
 * - super_admin / admin：看完整總部後台
 * - 其他可登入總部的角色（am / am_manager / finance）：只導向「業主月結設定」
 * - 其餘：導回總部登入頁
 */
export function HQIndexGate({ children }: { children: ReactNode }) {
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

  if (roles.some((r) => HQ_FULL_ACCESS_ROLES.includes(r as never))) return <>{children}</>;
  if (roles.some((r) => HQ_LOGIN_ROLES.includes(r as never))) {
    return <Navigate to={HQ_OWNER_SETTLEMENT_LANDING} replace />;
  }
  return <Navigate to="/hq-auth" replace />;
}
