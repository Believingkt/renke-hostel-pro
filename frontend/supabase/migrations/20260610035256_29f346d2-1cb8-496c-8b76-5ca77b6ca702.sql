ALTER TABLE public.pricing_templates
  ADD COLUMN IF NOT EXISTS room_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.pricing_templates
SET room_type_ids = ARRAY[room_type_id]
WHERE room_type_id IS NOT NULL
  AND (room_type_ids IS NULL OR array_length(room_type_ids, 1) IS NULL);

CREATE INDEX IF NOT EXISTS pricing_templates_room_type_ids_gin
  ON public.pricing_templates USING GIN (room_type_ids);