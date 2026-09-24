import { supabase } from "@lakeze/shared/integrations/supabase/client";

/**
 * KOL 分潤費率（kol_commission_settings）刪除／還原／新增的操作審計。
 *
 * 寫入沿用 audit_logs（accommodation_id 留 NULL 以符合 RLS insert 政策，
 * 館別資訊放在 details 內），查詢透過 security definer RPC
 * list_kol_rate_audit_logs，讓 AM／星探主管也能查自己負責館別的紀錄。
 */

export interface RateAuditLogRow {
  id: string;
  created_at: string;
  user_email: string | null;
  action_type: string;
  entity_name: string | null;
  details: {
    accommodation_id?: string;
    accommodation_name?: string;
    rate?: number;
    effective_from?: string;
    applies_range?: string;
    operator_name?: string;
    note?: string;
    [k: string]: unknown;
  } | null;
}

export async function logKolRateChange(params: {
  actionType: "create" | "delete" | "restore";
  accommodationId: string;
  accommodationName?: string | null;
  rate: number;
  effectiveFrom: string;
  appliesRange?: string;
  settingId?: string | null;
  note?: string;
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
      // audit_logs 的 insert 政策只允許 create/update/delete/restore 等固定值
      action_type: params.actionType,
      action_category: "system",
      entity_type: "kol_commission_setting",
      entity_id: params.settingId ?? params.accommodationId,
      entity_name: `${params.accommodationName ?? ""}｜${params.effectiveFrom}｜${params.rate}%`.replace(/^｜/, ""),
      accommodation_id: null,
      details: {
        accommodation_id: params.accommodationId,
        accommodation_name: params.accommodationName ?? null,
        rate: params.rate,
        effective_from: params.effectiveFrom,
        applies_range: params.appliesRange ?? null,
        operator_name: operatorName,
        note: params.note ?? null,
      } as never,
    }]);
  } catch (e) {
    console.error("[KolRateAudit] 寫入失敗", e);
  }
}

export async function fetchKolRateAuditLogs(
  accommodationId: string,
  limit = 50,
): Promise<RateAuditLogRow[]> {
  const { data, error } = await (supabase as any).rpc("list_kol_rate_audit_logs", {
    _accommodation_id: accommodationId,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RateAuditLogRow[];
}

export const RATE_ACTION_LABEL: Record<string, string> = {
  create: "新增",
  delete: "刪除",
  restore: "還原",
};

/** 由「新到舊」排序的費率清單推算某一筆的適用區間文字。 */
export function describeRateRange(
  rowsDesc: { effective_from: string }[],
  index: number,
): { start: string; end: string; label: string } {
  const start = rowsDesc[index].effective_from;
  const newer = rowsDesc[index - 1];
  if (!newer) return { start, end: "", label: `${start} 起（目前生效中）` };
  const end = addDays(newer.effective_from, -1);
  if (end < start) return { start, end, label: `${start}（已被同日/更新版本覆蓋）` };
  return { start, end, label: `${start} ~ ${end}` };
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
