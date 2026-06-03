ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS adult_count INT,
  ADD COLUMN IF NOT EXISTS child_count INT;