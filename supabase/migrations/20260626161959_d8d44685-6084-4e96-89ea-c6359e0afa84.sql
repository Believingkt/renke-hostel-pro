
CREATE TABLE public.performance_notification_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  sent_date date NOT NULL,
  notify_time text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_notification_sent_log_unique
    UNIQUE (accommodation_id, sent_date, notify_time)
);

CREATE INDEX idx_perf_notif_sent_log_date
  ON public.performance_notification_sent_log (sent_date DESC);

GRANT ALL ON public.performance_notification_sent_log TO service_role;

ALTER TABLE public.performance_notification_sent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages sent log"
  ON public.performance_notification_sent_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
