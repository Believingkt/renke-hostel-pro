// Client-side merge of a fill-up staging row with LATER emails (修改 / 取消)
// for the same OBE number, mirroring supabase/functions/_shared/owltingStagingMerge.ts.
import { supabase } from "@/integrations/supabase/client";

const MERGE_FIELDS = [
  "check_in_date",
  "check_out_date",
  "total_amount",
  "room_type_name",
  "room_quantity",
  "guest_count",
  "adult_count",
  "child_count",
] as const;

export interface StagingMergeResult<T> {
  merged: T;
  changes: Array<{ field?: string; label?: string; before?: unknown; after?: unknown }>;
  cancelled: boolean;
  applied: boolean;
}

export async function mergeLaterStagingClient<T extends Record<string, any>>(
  base: T,
): Promise<StagingMergeResult<T>> {
  const result: StagingMergeResult<T> = { merged: { ...base }, changes: [], cancelled: false, applied: false };
  if (!base?.obe_number) return result;

  const { data: baseRow } = await supabase
    .from("owlting_email_parsed_staging")
    .select("created_at")
    .eq("id", base.id)
    .maybeSingle();
  const baseCreatedAt = (baseRow as any)?.created_at;
  if (!baseCreatedAt) return result;

  const { data: later } = await supabase
    .from("owlting_email_parsed_staging")
    .select(
      "id, message_type, created_at, modification_diff, accommodation_id, " + MERGE_FIELDS.join(", "),
    )
    .eq("obe_number", base.obe_number)
    .gt("created_at", baseCreatedAt)
    .order("created_at", { ascending: true });

  for (const row of ((later ?? []) as any[])) {
    if (row.id === base.id) continue;
    if (base.accommodation_id && row.accommodation_id && row.accommodation_id !== base.accommodation_id) continue;
    if (row.message_type === "cancelled") { result.cancelled = true; continue; }
    if (row.message_type !== "modified") continue;

    for (const f of MERGE_FIELDS) {
      const v = row[f];
      if (v !== null && v !== undefined && v !== "") (result.merged as any)[f] = v;
    }
    result.applied = true;
    const diff = Array.isArray(row.modification_diff) ? row.modification_diff : [];
    for (const d of diff) result.changes.push(d as any);
  }

  return result;
}
