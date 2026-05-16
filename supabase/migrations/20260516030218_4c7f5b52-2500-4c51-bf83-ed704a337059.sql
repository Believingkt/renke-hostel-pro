ALTER TABLE public.accommodation_packages
ADD COLUMN IF NOT EXISTS room_type_ids uuid[];