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
  isAdmin: boolean;
  hasAccommodationRole: boolean;
}

const EMPTY_PERMISSIONS: StaffPermissionData = {
  permissions: {},
  isStaff: false,
  isAdmin: false,
  hasAccommodationRole: false,
};

const STAFF_PERMISSIONS_STALE_TIME = 5 * 60 * 1000;

/**
 * 取得目前登入者在當前民宿的模組權限。
 * - hotel_admin / super_admin：全部 editable。
 * - staff：依 staff_module_permissions 表，未設定則 fallback 預設值。
 */
export function useStaffPermissions(): UseStaffPermissionsResult {
  const {
    currentAccommodationId,
    userAccommodations,
    isLoading: isAccommodationLoading,
  } = useAccommodation();
  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const rolesForAccommodation = userAccommodations
    .filter((row) => row.accommodation_id === currentAccommodationId)
    .map((row) => row.role)
    .sort();
  const rolesCacheKey = rolesForAccommodation.join("|");

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
    queryKey: ["staff-permissions", userId, currentAccommodationId, rolesCacheKey],
    enabled: Boolean(userId && currentAccommodationId && !isAccommodationLoading),
    staleTime: STAFF_PERMISSIONS_STALE_TIME,
    gcTime: STAFF_PERMISSIONS_STALE_TIME * 2,
    queryFn: async (): Promise<StaffPermissionData> => {
      if (!userId || !currentAccommodationId) return EMPTY_PERMISSIONS;

      // 重新讀取完整角色，避免 AccommodationContext 只保留「有館別」角色時漏掉全域 super_admin。
      let roles = rolesForAccommodation;
      let globalRoles = userAccommodations.map((row) => row.role);
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role, accommodation_id")
        .eq("user_id", userId)
        .limit(1000);
      if (roleRows) {
        globalRoles = roleRows.map((r: any) => r.role);
        roles = (roleRows ?? [])
          .filter((r: any) => r.accommodation_id === currentAccommodationId)
          .map((r: any) => r.role);
      }
      // 舊帳號可能只有泛用 admin 角色，需與 hotel_admin 同等對待，
      // 否則側邊欄看得到、進頁面卻被擋（權限不足）。
      const isAdmin =
        roles.includes("hotel_admin") ||
        roles.includes("super_admin") ||
        roles.includes("admin") ||
        globalRoles.includes("super_admin");
      const isStaffOnly = !isAdmin && roles.includes("staff");

      if (isAdmin) {
        // admin → 全部 editable，不需再查模組權限表
        return { ...EMPTY_PERMISSIONS, isAdmin: true, hasAccommodationRole: true };
      }

      if (!isStaffOnly) {
        // 沒有目前館別角色不能預設放行，否則前端會顯示可用、後端/RLS 再擋掉。
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
        isAdmin: false,
        hasAccommodationRole: true,
      };
    },
  });

  const permissions = data.permissions;
  const isStaff = data.isStaff;
  const isAdmin = data.isAdmin;
  const hasAccommodationRole = data.hasAccommodationRole;

  const getLevel = (moduleKey: string): ModulePermissionLevel => {
    if (isAdmin) return "editable";
    if (!hasAccommodationRole) return "hidden";
    if (!isStaff) return "hidden";
    return permissions[moduleKey] ?? DEFAULT_STAFF_PERMISSIONS[moduleKey] ?? "hidden";
  };

  return {
    permissions,
    isStaff,
    isLoading: Boolean(currentAccommodationId) && (!authResolved || isAccommodationLoading || (Boolean(userId) && isLoading)),
    getLevel,
    canView: (k) => getLevel(k) !== "hidden",
    canEdit: (k) => getLevel(k) === "editable",
  };
}
