ALTER TABLE public.accommodation_info
ADD COLUMN IF NOT EXISTS email_important_notice text,
ADD COLUMN IF NOT EXISTS email_service_hours text;