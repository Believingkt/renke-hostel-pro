ALTER TABLE public.accommodation_info
ADD COLUMN IF NOT EXISTS villa_header_contact_type text,
ADD COLUMN IF NOT EXISTS villa_header_contact_value text,
ADD COLUMN IF NOT EXISTS villa_header_contact_label text;