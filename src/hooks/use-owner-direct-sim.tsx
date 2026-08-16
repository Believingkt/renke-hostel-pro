import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/components/team/TeamContext";

/**
 * 「排除業主自帶（試算）」檢視開關。
 *
 * - 實付金額永遠只有一軌（各館合作期間設定的那軌），此開關不影響任何發放數字。
 * - 僅 super_admin / admin 可見可用，其他成員一律看實付金額。
 * - 預設關閉，開關偏好記在 localStorage（每人各自）。
 */
const STORAGE_KEY = "team_owner_direct_sim";
const ALLOWED_ROLES = ["super_admin", "admin"];

export function useOwnerDirectSim() {
  const { roles } = useTeam();
  const canSim = useMemo(
    () => roles.some((r) => ALLOWED_ROLES.includes(r as string)),
    [roles],
  );

  const [simEnabled, setSimEnabledState] = useState(false);

  useEffect(() => {
    if (!canSim) {
      setSimEnabledState(false);
      return;
    }
    setSimEnabledState(localStorage.getItem(STORAGE_KEY) === "1");
  }, [canSim]);

  const setSimEnabled = useCallback(
    (next: boolean) => {
      if (!canSim) return;
      setSimEnabledState(next);
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    },
    [canSim],
  );

  return { simEnabled, setSimEnabled, canSim };
}
