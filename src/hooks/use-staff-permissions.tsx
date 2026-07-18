import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface StaffPermissionData {
  permissions: Record<string, ModulePermissionLevel>;
  isStaff: boolean;
}

const EMPTY_PERMISSIONS: StaffPermissionData = {
  permissions: {},
  isStaff: false,
};

const STAFF_PERMISSIONS_STALE_TIME = 5 * 60 * 1000;

/**
 * 取得目前登入者在當前民宿的模組權限。
 * - hotel_admin / super_admin：全部 editable。
 * - staff：依 staff_module_permissions 表，未設定則 fallback 預設值。
 */
export function useStaffPermissions(): UseStaffPermissionsResult {
  const { currentAccommodationId } = useAccommodation();
  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setUserId(session?.user.id ?? null);
        setAuthResolved(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setAuthResolved(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const { data = EMPTY_PERMISSIONS, isLoading } = useQuery({
    queryKey: ["staff-permissions", userId, currentAccommodationId],
    enabled: Boolean(userId && currentAccommodationId),
    staleTime: STAFF_PERMISSIONS_STALE_TIME,
    gcTime: STAFF_PERMISSIONS_STALE_TIME * 2,
    queryFn: async (): Promise<StaffPermissionData> => {
      if (!userId || !currentAccommodationId) return EMPTY_PERMISSIONS;

      // 查詢角色；React Query 會在同一頁面的 Sidebar / Route Guard 間共用這次請求
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("accommodation_id", currentAccommodationId);

      const roles = (roleRows ?? []).map((r: any) => r.role);
      const isAdmin = roles.includes("hotel_admin") || roles.includes("super_admin");
      const isStaffOnly = !isAdmin && roles.includes("staff");

      if (isAdmin || !isStaffOnly) {
        // admin / 非 staff → 全部 editable，不需再查模組權限表
        return EMPTY_PERMISSIONS;
      }

      // staff：讀取自訂設定，套用 fallback
      const { data: rows } = await supabase
        .from("staff_module_permissions")
        .select("module_key, permission_level")
        .eq("user_id", userId)
        .eq("accommodation_id", currentAccommodationId);

      const map: Record<string, ModulePermissionLevel> = { ...DEFAULT_STAFF_PERMISSIONS };
      (rows ?? []).forEach((r: any) => {
        map[r.module_key] = r.permission_level as ModulePermissionLevel;
      });

      return {
        permissions: map,
        isStaff: true,
      };
    },
  });

  const permissions = data.permissions;
  const isStaff = data.isStaff;

  const getLevel = (moduleKey: string): ModulePermissionLevel => {
    if (!isStaff) return "editable"; // 非 staff 一律可編輯
    return permissions[moduleKey] ?? DEFAULT_STAFF_PERMISSIONS[moduleKey] ?? "hidden";
  };

  return {
    permissions,
    isStaff,
    isLoading: Boolean(currentAccommodationId) && (!authResolved || (Boolean(userId) && isLoading)),
    getLevel,
    canView: (k) => getLevel(k) !== "hidden",
    canEdit: (k) => getLevel(k) === "editable",
  };
}
