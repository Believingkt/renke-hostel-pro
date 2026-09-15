-- 業績通報排程日誌：記錄每次 LINE 推播與寄信的館別、時間、狀態與錯誤原因
CREATE TABLE IF NOT EXISTS public.performance_notification_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  run_mode text NOT NULL,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  accommodation_name text,
  sent_date date NOT NULL,
  notify_time text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  target text,
  detail text,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_dispatch_log_created_at
  ON public.performance_notification_dispatch_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_dispatch_log_acc_date
  ON public.performance_notification_dispatch_log (accommodation_id, sent_date DESC);

GRANT SELECT ON public.performance_notification_dispatch_log TO authenticated;
GRANT ALL ON public.performance_notification_dispatch_log TO service_role;

ALTER TABLE public.performance_notification_dispatch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin can read dispatch log"
  ON public.performance_notification_dispatch_log;
CREATE POLICY "super_admin can read dispatch log"
  ON public.performance_notification_dispatch_log
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));