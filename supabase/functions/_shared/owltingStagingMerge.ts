// Merge a fill-up staging row with any LATER emails for the same OBE number
// (修改 / 取消 通知). A magic link is issued against the original 新訂單 email, but
// the guest may have modified the reservation before the owner fills in PII.
// Without merging we would create the order in its pre-modification state.

const MERGE_FIELDS = [
  "check_in_date",
  "check_out_date",
  "total_amount",
  "remaining_amount",
  "payment_status",
  "currency",
  "room_type_name",
  "project_name",
  "room_quantity",
  "guest_count",
  "adult_count",
  "child_count",
  "nights",
  "addons",
] as const;

const SELECT_COLS =
  "id, message_type, created_at, modification_diff, obe_number, accommodation_id, " +
  MERGE_FIELDS.join(", ");

export interface MergeResult<T> {
  merged: T;
  /** ids of the later staging rows that were applied */
  appliedIds: string[];
  /** flattened modification_diff entries, oldest → newest */
  changes: Array<{ field?: string; label?: string; before?: unknown; after?: unknown; at: string }>;
  /** true when a later 取消 email exists for the same OBE */
  cancelled: boolean;
}

export async function mergeLaterStaging<T extends Record<string, any>>(
  admin: any,
  base: T,
): Promise<MergeResult<T>> {
  const result: MergeResult<T> = { merged: { ...base }, appliedIds: [], changes: [], cancelled: false };
  if (!base?.obe_number || !base?.created_at) return result;

  const { data: later } = await admin
    .from("owlting_email_parsed_staging")
    .select(SELECT_COLS)
    .eq("obe_number", base.obe_number)
    .gt("created_at", base.created_at)
    .order("created_at", { ascending: true });

  for (const row of (later ?? []) as any[]) {
    if (row.id === base.id) continue;
    if (base.accommodation_id && row.accommodation_id && row.accommodation_id !== base.accommodation_id) continue;
    if (row.message_type === "cancelled") {
      result.cancelled = true;
      continue;
    }
    if (row.message_type !== "modified") continue;

    for (const f of MERGE_FIELDS) {
      const v = row[f];
      if (v !== null && v !== undefined && v !== "") {
        (result.merged as any)[f] = v;
      }
    }
    result.appliedIds.push(row.id);
    const diff = Array.isArray(row.modification_diff) ? row.modification_diff : [];
    for (const d of diff) {
      result.changes.push({ ...(d as any), at: row.created_at });
    }
  }

  return result;
}

/** Recompute derived fields (nights / remaining_amount) after a merge. */
export function normalizeMerged<T extends Record<string, any>>(m: T, applied: boolean): T {
  if (!applied) return m;
  const out: any = { ...m };
  if (out.check_in_date && out.check_out_date) {
    const ms = new Date(out.check_out_date).getTime() - new Date(out.check_in_date).getTime();
    const n = Math.round(ms / 86400000);
    if (n > 0) out.nights = n;
  }
  const total = Number(out.total_amount ?? 0);
  const remaining = Number(out.remaining_amount ?? 0);
  if (total > 0 && remaining > total) out.remaining_amount = total;
  return out as T;
}
