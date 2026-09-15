-- Ensure one booking_settings row per accommodation (required for .maybeSingle() usage)
ALTER TABLE public.booking_settings
ADD CONSTRAINT booking_settings_accommodation_id_unique UNIQUE (accommodation_id);
