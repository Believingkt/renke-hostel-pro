ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS internal_email_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_email_sent_at timestamptz NULL;