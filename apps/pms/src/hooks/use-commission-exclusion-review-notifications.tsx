import { useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import type { TeamNotification } from "@/lib/notifications/types";
import { COMMISSION_REVIEW_ROLES } from "@/lib/notifications/roles";

/**
 * 「增值服務抽成設定已更新，建議審查」綠燈提醒（衍生式，不建表）。
 *
 * 觸發條件：某館別最新一版 owner_settlement_pricing_rules 有設定
 * commission_excluded_addon_ids / _types，但 commission_exclusion_reviewed_at 仍為空。
 * 對象：super_admin / admin（AM 設定後由管理員審查）。
 */

export const COMMISSION_EXCLUSION_REVIEW_KIND = "commission-exclusion-review";
const REVIEW_ROLES = COMMISSION_REVIEW_ROLES;

interface RuleRow {
  accommodation_id: string;
  effective_from: string;
  created_at: string;
  commission_excluded_addon_ids: string[] | null;
  commission_excluded_addon_types: string[] | null;
  commission_exclusion_reviewed_at: string | null;
}

export function buildCommissionExclusionReviewNotifications(
  rows: RuleRow[],
  accNames: Map<string, string>,
  roles: string[],
): TeamNotification[] {
  if (!roles.some((r) => REVIEW_ROLES.includes(r))) return [];
  // 每館只看最新一版
  const latest = new Map<string, RuleRow>();
  for (const r of rows) {
    const cur = latest.get(r.accommodation_id);
    const key = `${r.effective_from ?? ""}|${r.created_at ?? ""}`;
    const curKey = cur ? `${cur.effective_from ?? ""}|${cur.created_at ?? ""}` : "";
    if (!cur || key > curKey) latest.set(r.accommodation_id, r);
  }

  const out: TeamNotification[] = [];
  for (const r of latest.values()) {
    const count =
      (r.commission_excluded_addon_ids?.length ?? 0) + (r.commission_excluded_addon_types?.length ?? 0);
    if (count === 0) continue;
    if (r.commission_exclusion_reviewed_at) continue;
    out.push({
      id: `commission-exclusion:${r.accommodation_id}:${r.effective_from}`,
      kind: COMMISSION_EXCLUSION_REVIEW_KIND,
      category: "settings",
      severity: "warn",
      scope: accNames.get(r.accommodation_id) ?? "館別",
      title: "增值服務抽成設定已完成，建議審查",
      detail: `已設定 ${count} 項不列入抽成的增值服務（生效期 ${r.effective_from}），尚未經管理員審查。`,
      href: `/hq/bonus-settings?tab=owner-settlement&acc=${r.accommodation_id}`,
      editable: true,
      reason: null,
      meta: [
        { label: "資料來源", value: "owner_settlement_pricing_rules" },
        { label: "影響範圍", value: "業主月結平台服務費＋團隊獎金分潤基準（2026-09-10 成交日起）" },
        { label: "未設定的意義", value: "沒有勾選任何項目＝所有增值服務都列入抽成" },
      ],
    });
  }
  return out;
}

export function useCommissionExclusionReviewNotifications(roles: string[]) {
  const [items, setItems] = useState<TeamNotification[]>([]);
  const roleKey = roles.slice().sort().join(",");

  useEffect(() => {
    let cancelled = false;
    if (!roles.some((r) => REVIEW_ROLES.includes(r))) {
      setItems([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("owner_settlement_pricing_rules")
        .select(
          "accommodation_id, effective_from, created_at, commission_excluded_addon_ids, commission_excluded_addon_types, commission_exclusion_reviewed_at",
        );
      const rows = (data ?? []) as unknown as RuleRow[];
      const accIds = Array.from(new Set(rows.map((r) => r.accommodation_id).filter(Boolean)));
      const names = new Map<string, string>();
      if (accIds.length > 0) {
        const { data: accs } = await supabase
          .from("accommodation_info")
          .select("id, name")
          .in("id", accIds);
        for (const a of (accs ?? []) as any[]) names.set(a.id, a.name ?? "館別");
      }
      if (!cancelled) setItems(buildCommissionExclusionReviewNotifications(rows, names, roles));
    })();
    return () => {
      cancelled = true;
    };
  }, [roleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return items;
}
