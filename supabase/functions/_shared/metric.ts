// M/N 成效事件寫入（service role）。所有呼叫皆 fire-and-forget：失敗只記 log，絕不拋出。
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const METRIC_EVENTS = new Set([
  "trip_rec_shown", "trip_rec_click",
  "trip_save", "trip_favorite", "trip_share", "trip_copy",
  "addon_rec_shown", "addon_purchased",
]);

export interface MetricEvent {
  event_type: string;
  accommodation_id?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  channel?: "web" | "line" | "email";
  session_key?: string | null;
  line_user_id?: string | null;
  is_internal?: boolean;
  metadata?: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 寫入單筆事件；未知 event_type 直接丟棄；同 session+event+ref 10 秒內去重。回傳是否寫入。 */
export async function writeMetric(sb: SupabaseClient, ev: MetricEvent): Promise<boolean> {
  try {
    if (!METRIC_EVENTS.has(ev.event_type)) return false;
    const accId = ev.accommodation_id && UUID_RE.test(ev.accommodation_id) ? ev.accommodation_id : null;

    // 短時間去重/限流（10 秒）
    if (ev.session_key || ev.line_user_id) {
      const since = new Date(Date.now() - 10_000).toISOString();
      let dq = sb.from("ai_metric_events").select("id", { head: true, count: "exact" })
        .eq("event_type", ev.event_type).gte("created_at", since);
      if (ev.ref_id) dq = dq.eq("ref_id", ev.ref_id);
      if (ev.session_key) dq = dq.eq("session_key", ev.session_key);
      else if (ev.line_user_id) dq = dq.eq("line_user_id", ev.line_user_id);
      const { count } = await dq;
      if ((count ?? 0) > 0) return false;
    }

    const { error } = await sb.from("ai_metric_events").insert({
      event_type: ev.event_type,
      accommodation_id: accId,
      ref_type: ev.ref_type ?? null,
      ref_id: ev.ref_id ?? null,
      channel: ev.channel ?? "web",
      session_key: ev.session_key ?? null,
      line_user_id: ev.line_user_id ?? null,
      is_internal: ev.is_internal ?? false,
      metadata: ev.metadata ?? {},
    });
    if (error) { console.warn("[metric] insert failed", error.message); return false; }
    return true;
  } catch (e) {
    console.warn("[metric] write exception", e);
    return false;
  }
}
