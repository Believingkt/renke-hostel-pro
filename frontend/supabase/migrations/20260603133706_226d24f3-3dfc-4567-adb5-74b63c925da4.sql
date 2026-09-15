ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS room_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS nights INTEGER,
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_status TEXT;