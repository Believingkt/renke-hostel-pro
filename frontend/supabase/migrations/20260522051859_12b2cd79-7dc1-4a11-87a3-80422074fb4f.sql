ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS exclusive_total_rooms integer,
  ADD COLUMN IF NOT EXISTS exclusive_room_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS daily_capacity integer;

COMMENT ON COLUMN public.accommodation_info.exclusive_total_rooms IS '包棟總房數上限，NULL = 走前端 fallback';
COMMENT ON COLUMN public.accommodation_info.exclusive_room_breakdown IS '包棟房型分布 [{room_type_id, name, count}]，NULL = 走前端 fallback';
COMMENT ON COLUMN public.accommodation_info.daily_capacity IS '每日總可售房數（營運分析用），NULL 預設 6';