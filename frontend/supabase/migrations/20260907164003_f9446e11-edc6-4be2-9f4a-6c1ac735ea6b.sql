ALTER TABLE public.performance_notification_sent_log
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'line';

ALTER TABLE public.performance_notification_sent_log
  DROP CONSTRAINT IF EXISTS performance_notification_sent_log_unique;

ALTER TABLE public.performance_notification_sent_log
  ADD CONSTRAINT performance_notification_sent_log_unique
  UNIQUE (accommodation_id, sent_date, notify_time, channel);