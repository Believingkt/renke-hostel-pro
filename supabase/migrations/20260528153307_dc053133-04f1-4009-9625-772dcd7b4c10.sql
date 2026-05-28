ALTER TABLE public.scout_discount_codes
  ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES public.accommodation_info(id);