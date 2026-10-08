-- M/N 成效事件表：只記事件、不回填歷史。僅允許 service role（經 edge function）寫入。
CREATE TABLE IF NOT EXISTS public.ai_metric_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  ref_type text,
  ref_id text,
  channel text NOT NULL DEFAULT 'web',          -- web | line | email
  session_key text,
  line_user_id text,
  is_internal boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_metric_events_type_acc_created
  ON public.ai_metric_events (event_type, accommodation_id, created_at);
-- 去重/限流查詢用
CREATE INDEX IF NOT EXISTS idx_ai_metric_events_dedupe
  ON public.ai_metric_events (session_key, event_type, ref_id, created_at);

ALTER TABLE public.ai_metric_events ENABLE ROW LEVEL SECURITY;
-- 不建立任何 anon / authenticated policy：只有 service role（繞過 RLS）可寫入/讀取。
