import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/components/team/TeamContext";

/**
 * 業主自帶雙軌顯示口徑（含／排除業主自帶）。
 *
 * - 實付真值：各館 payout_basis 決定（快照 payout_basis_used 已凍結）
 * - 管理層可切換為另一軌「僅供參考」，一般成員固定看實付真值
 * - 偏好記在 localStorage，每人各自記住
 */
export type OwnerDirectBasis = "payout" | "include_owner_direct" | "exclude_owner_direct";

const STORAGE_KEY = "team_owner_direct_basis";
const MANAGER_ROLES = ["super_admin", "admin", "am_manager", "closer_manager"];

export function useOwnerDirectBasis() {
  const { roles } = useTeam();
  const canSwitch = useMemo(
    () => (roles ?? []).some((r) => MANAGER_ROLES.includes(String(r))),
    [roles],
  );

  const [basis, setBasisState] = useState<OwnerDirectBasis>("payout");

  useEffect(() => {
    if (!canSwitch) {
      setBasisState("payout");
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "include_owner_direct" || saved === "exclude_owner_direct" || saved === "payout") {
      setBasisState(saved);
    }
  }, [canSwitch]);

  const setBasis = useCallback(
    (next: OwnerDirectBasis) => {
      if (!canSwitch) return;
      setBasisState(next);
      localStorage.setItem(STORAGE_KEY, next);
    },
    [canSwitch],
  );

  /** 是否為「非實付」的參考軌（需加警示樣式） */
  const isReferenceOnly = basis !== "payout";

  /**
   * 依目前口徑取值。
   * @param payout 實付真值（快照 amount / base_revenue）
   * @param incl   含業主自帶
   * @param excl   排除業主自帶
   * @param affected 該獎金是否受雙軌影響（false 時一律回實付真值）
   */
  const pick = useCallback(
    (
      payout: number | null | undefined,
      incl: number | null | undefined,
      excl: number | null | undefined,
      affected = true,
    ): number => {
      const base = Number(payout ?? 0) || 0;
      if (!affected || basis === "payout") return base;
      const v = basis === "include_owner_direct" ? incl : excl;
      return v === null || v === undefined ? base : Number(v) || 0;
    },
    [basis],
  );

  return { basis, setBasis, canSwitch, isReferenceOnly, pick };
}

export const OWNER_DIRECT_BASIS_LABEL: Record<OwnerDirectBasis, string> = {
  payout: "實付真值（依各館設定）",
  include_owner_direct: "含業主自帶（參考）",
  exclude_owner_direct: "排除業主自帶（參考）",
};
