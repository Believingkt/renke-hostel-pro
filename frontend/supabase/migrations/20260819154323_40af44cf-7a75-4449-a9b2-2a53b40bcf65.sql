ALTER TABLE public.traveler_attributes
  ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_traveler_attributes_accommodation ON public.traveler_attributes(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_traveler_attributes_source ON public.traveler_attributes(source);