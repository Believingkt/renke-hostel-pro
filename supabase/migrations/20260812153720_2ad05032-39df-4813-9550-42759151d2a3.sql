ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN IF NOT EXISTS room_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.group_buy_campaign_packages
SET room_type_ids = ARRAY[room_type_id]
WHERE room_type_id IS NOT NULL
  AND (room_type_ids IS NULL OR cardinality(room_type_ids) = 0);