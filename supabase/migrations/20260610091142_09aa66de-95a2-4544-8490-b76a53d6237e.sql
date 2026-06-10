ALTER TABLE public.pricing_templates
ADD COLUMN IF NOT EXISTS season_segments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.pricing_templates.season_segments IS
'季節期間區段陣列。空陣列時走頂層 valid_from/until/*_price 欄位（向後相容）；非空時以 segments 為準。每個 segment: {id, label?, valid_from, valid_until, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, extra_dates, excluded_dates, room_overrides[]}';