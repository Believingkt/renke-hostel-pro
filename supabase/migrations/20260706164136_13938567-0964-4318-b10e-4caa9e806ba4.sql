
UPDATE public.line_push_targets
SET event_types = array_remove(event_types, 'franchise_performance'),
    updated_at = now()
WHERE 'franchise_performance' = ANY(event_types);

DELETE FROM public.line_event_types WHERE code = 'franchise_performance';
