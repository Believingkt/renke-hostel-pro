ALTER TABLE public.franchise_projects
  ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL;

UPDATE public.franchise_projects
SET accommodation_id = (
  SELECT id FROM public.accommodation_info WHERE name LIKE '%森山%' LIMIT 1
)
WHERE name LIKE '%森山%' AND accommodation_id IS NULL;