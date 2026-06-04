ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS last_send_status text,
  ADD COLUMN IF NOT EXISTS last_send_message text,
  ADD COLUMN IF NOT EXISTS last_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_send_attempts integer NOT NULL DEFAULT 0;