ALTER TABLE public.line_push_targets
  ADD CONSTRAINT line_push_targets_type_target_unique UNIQUE (target_type, target_id);