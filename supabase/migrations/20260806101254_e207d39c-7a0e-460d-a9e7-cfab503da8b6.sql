ALTER TABLE public.accommodation_facilities
  ADD COLUMN IF NOT EXISTS room_scope text;

ALTER TABLE public.accommodation_facilities
  DROP CONSTRAINT IF EXISTS accommodation_facilities_room_scope_check;
ALTER TABLE public.accommodation_facilities
  ADD CONSTRAINT accommodation_facilities_room_scope_check
  CHECK (room_scope IS NULL OR room_scope IN ('whole','single'));

DROP INDEX IF EXISTS public.uniq_accommodation_facilities_per_acc;
CREATE UNIQUE INDEX uniq_accommodation_facilities_per_acc
  ON public.accommodation_facilities (accommodation_id, facility_name, category, COALESCE(room_scope, ''))
  WHERE accommodation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accommodation_facilities_scope
  ON public.accommodation_facilities (accommodation_id, room_scope);