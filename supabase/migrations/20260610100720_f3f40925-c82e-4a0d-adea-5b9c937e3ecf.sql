ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS daily_villa_capacity integer,
  ADD COLUMN IF NOT EXISTS daily_room_capacity integer;

COMMENT ON COLUMN public.accommodation_info.daily_villa_capacity IS '每日可售包棟數（棟），用於營運分析住房率（包棟分流）。NULL 表示未設定。';
COMMENT ON COLUMN public.accommodation_info.daily_room_capacity IS '每日可售散客房數（間），用於營運分析住房率（散客分流）。NULL 表示未設定。';