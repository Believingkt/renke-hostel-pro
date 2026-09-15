ALTER TABLE public.kol_venue_settings
ADD COLUMN contact_email text,
ADD COLUMN has_external_platform boolean NOT NULL DEFAULT false;