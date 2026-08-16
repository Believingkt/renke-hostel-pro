import { supabase } from "@/integrations/supabase/client";

/**
 * KOL 互惠額度設定的操作審計。
 *
 * 寫入沿用 audit_logs（accommodation_id 留 NULL 以符合 RLS insert 政策，
 * 館別資訊放在 details 內），查詢則透過 security definer RPC
 * list_kol_quota_audit_logs，讓 AM／星探主管也能查自己負責館別的紀錄。
 */

export interface QuotaFieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface QuotaAuditLogRow {
  id: string;
  created_at: string;
  user_email: string | null;
  action_type: string;
  entity_name: string | null;
  details: {
    accommodation_id?: string;
    accommodation_name?: string;
    year_month?: string;
    scope_label?: string;
    operator_name?: string;
    changes?: QuotaFieldChange[];
    [k: string]: unknown;
  } | null;
}

export async function logKolQuotaChange(params: {
  actionType: "create" | "update" | "delete";
  accommodationId: string;
  accommodationName?: string | null;
  yearMonth: string;
  scopeLabel: string;
  quotaId?: string | null;
  changes: QuotaFieldChange[];
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let operatorName = user.email ?? "未知使用者";
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.name) operatorName = profile.name;

    await supabase.from("audit_logs").insert([{
      user_id: user.id,
      user_email: user.email,
      action_type: params.actionType,
      action_category: "system",
      entity_type: "kol_reciprocal_quota",
      entity_id: params.quotaId ?? params.accommodationId,
      entity_name: `${params.accommodationName ?? ""}｜${params.yearMonth}｜${params.scopeLabel}`.replace(/^｜/, ""),
      accommodation_id: null,
      details: {
        accommodation_id: params.accommodationId,
        accommodation_name: params.accommodationName ?? null,
        year_month: params.yearMonth,
        scope_label: params.scopeLabel,
        operator_name: operatorName,
        changes: params.changes,
      } as never,
    }]);
  } catch (e) {
    console.error("[KolQuotaAudit] 寫入失敗", e);
  }
}

export async function fetchKolQuotaAuditLogs(
  accommodationId: string,
  limit = 100,
): Promise<QuotaAuditLogRow[]> {
  const { data, error } = await (supabase as any).rpc("list_kol_quota_audit_logs", {
    _accommodation_id: accommodationId,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as QuotaAuditLogRow[];
}

export function describeChange(c: QuotaFieldChange): string {
  const fmt = (v: unknown) =>
    v === null || v === undefined || v === "" ? "（空白）" : String(v);
  if (c.before === undefined) return `${c.label}：${fmt(c.after)}`;
  return `${c.label}：${fmt(c.before)} → ${fmt(c.after)}`;
}
