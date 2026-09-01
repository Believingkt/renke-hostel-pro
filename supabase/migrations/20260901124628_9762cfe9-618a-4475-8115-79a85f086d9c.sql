ALTER TABLE public.accommodation_partnership_periods
  ADD CONSTRAINT accommodation_partnership_periods_end_after_start
  CHECK (end_date IS NULL OR end_date >= start_date);