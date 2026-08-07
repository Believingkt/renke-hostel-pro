ALTER TABLE public.owlting_email_orders_raw
  ADD COLUMN IF NOT EXISTS ingest_outcome text,
  ADD COLUMN IF NOT EXISTS ingest_outcome_detail jsonb,
  ADD COLUMN IF NOT EXISTS ingest_outcome_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_owlting_raw_ingest_outcome
  ON public.owlting_email_orders_raw (ingest_outcome, received_at DESC);

ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS modification_diff jsonb,
  ADD COLUMN IF NOT EXISTS modification_diff_status text;