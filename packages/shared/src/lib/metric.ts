// 前端成效埋點（shared）：fire-and-forget，絕不影響頁面/聊天/下單流程。
import { supabase } from "@lakeze/shared/integrations/supabase/client";

let sessionKey: string | null = null;
function getSessionKey(): string {
  if (sessionKey) return sessionKey;
  try {
    sessionKey = sessionStorage.getItem("analytics_session_id")
      || localStorage.getItem("ai_metric_session");
    if (!sessionKey) {
      sessionKey = crypto.randomUUID();
      localStorage.setItem("ai_metric_session", sessionKey);
    }
  } catch {
    sessionKey = Math.random().toString(36).slice(2);
  }
  return sessionKey!;
}

export interface MetricInput {
  event_type:
    | "trip_rec_shown" | "trip_rec_click"
    | "trip_save" | "trip_favorite" | "trip_share" | "trip_copy"
    | "addon_rec_shown" | "addon_purchased";
  accommodation_id?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  channel?: "web" | "line" | "email";
  line_user_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** 發送事件；3 秒 timeout，所有錯誤吞掉。 */
export function emitMetric(ev: MetricInput): void {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3000);
    void supabase.functions
      .invoke("ai-metric-track", {
        body: { ...ev, channel: ev.channel ?? "web", session_key: getSessionKey() },
      })
      .catch(() => {})
      .finally(() => clearTimeout(to));
  } catch {
    /* 埋點失敗絕不影響使用者流程 */
  }
}
