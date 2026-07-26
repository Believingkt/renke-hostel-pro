ALTER TABLE public.tappay_webhook_events
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS gave_up boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

ALTER TABLE public.deposit_charges
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_amount integer,
  ADD COLUMN IF NOT EXISTS resolution_action text;

ALTER TABLE public.alert_recipients
  ADD COLUMN IF NOT EXISTS notify_payment_webhook boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tappay_webhook_events_retry
  ON public.tappay_webhook_events (processed, gave_up, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_deposit_charges_manual_review
  ON public.deposit_charges (needs_manual_review, created_at DESC);