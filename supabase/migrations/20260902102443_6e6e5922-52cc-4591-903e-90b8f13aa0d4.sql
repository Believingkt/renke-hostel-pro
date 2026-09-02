ALTER TABLE public.accommodation_packages
  ADD COLUMN IF NOT EXISTS included_guest_count integer;

UPDATE public.accommodation_packages
  SET included_guest_count = guest_count
  WHERE included_guest_count IS NULL;

ALTER TABLE public.accommodation_packages
  ALTER COLUMN included_guest_count SET NOT NULL,
  ALTER COLUMN included_guest_count SET DEFAULT 2;

ALTER TABLE public.accommodation_packages
  ADD CONSTRAINT accommodation_packages_included_guest_count_positive
  CHECK (included_guest_count > 0);