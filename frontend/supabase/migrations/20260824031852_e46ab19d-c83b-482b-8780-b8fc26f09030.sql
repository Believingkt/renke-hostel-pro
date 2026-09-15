DELETE FROM public.performance_notification_source_rules a
USING public.performance_notification_source_rules b
WHERE a.accommodation_id = b.accommodation_id
  AND a.source = b.source
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS performance_notification_source_rules_acc_source_key
  ON public.performance_notification_source_rules (accommodation_id, source);