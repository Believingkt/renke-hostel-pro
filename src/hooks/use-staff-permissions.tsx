import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import {
  DEFAULT_STAFF_PERMISSIONS,
  ModulePermissionLevel,
} from "@/constants/staffPermissions";

interface UseStaffPermissionsResult {
  permissions: Record<string, ModulePermissionLevel>;
  isStaff: boolean;
  isLoading: boolean;
  getLevel: (moduleKey: string) => ModulePermissionLevel;
  canView: (moduleKey: string) => boolean;
  canEdit: (moduleKey: string) => boolean;
}

/**
 * 取得目前登入者在當前民宿的模組權限。
 * - hotel_admin / super_admin：全部 editable。
 * - staff：依 staff_module_permissions 表，未設定則 fallback 預設值。
 */
export function useStaffPermissions(): UseStaffPermissionsResult {
  const { currentAccommodationId } = useAccommodation();
  const [permissions, setPermissions] = useState<Record<string, ModulePermissionLevel>>({});
  const [isStaff, setIsStaff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentAccommodationId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setPermissions({});
          setIsStaff(false);
          setIsLoading(false);
        }
        return;
      }

      // 查詢角色
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("accommodation_id", currentAccommodationId);

      const roles = (roleRows ?? []).map((r: any) => r.role);
      const isAdmin = roles.includes("hotel_admin") || roles.includes("super_admin");
      const isStaffOnly = !isAdmin && roles.includes("staff");

      if (!cancelled) setIsStaff(isStaffOnly);

      if (isAdmin) {
        // admin → 全部 editable，不需查表
        if (!cancelled) {
          setPermissions({});
          setIsLoading(false);
        }
        return;
      }

      // staff：讀取自訂設定，套用 fallback
      const { data: rows } = await supabase
        .from("staff_module_permissions")
        .select("module_key, permission_level")
        .eq("user_id", user.id)
        .eq("accommodation_id", currentAccommodationId);

      const map: Record<string, ModulePermissionLevel> = { ...DEFAULT_STAFF_PERMISSIONS };
      (rows ?? []).forEach((r: any) => {
        map[r.module_key] = r.permission_level as ModulePermissionLevel;
      });

      if (!cancelled) {
        setPermissions(map);
        setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentAccommodationId]);

  const getLevel = (moduleKey: string): ModulePermissionLevel => {
    if (!isStaff) return "editable"; // 非 staff 一律可編輯
    return permissions[moduleKey] ?? DEFAULT_STAFF_PERMISSIONS[moduleKey] ?? "hidden";
  };

  return {
    permissions,
    isStaff,
    isLoading,
    getLevel,
    canView: (k) => getLevel(k) !== "hidden",
    canEdit: (k) => getLevel(k) === "editable",
  };
}
