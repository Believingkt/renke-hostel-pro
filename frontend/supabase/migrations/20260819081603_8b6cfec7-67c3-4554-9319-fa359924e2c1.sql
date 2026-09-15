ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS adult_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS child_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS toddler_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infant_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.adult_count IS '成人人數（團購訂單必填；一般訂房沿用既有欄位，預設 0）';
COMMENT ON COLUMN public.orders.child_count IS '兒童 7-12 歲人數';
COMMENT ON COLUMN public.orders.toddler_count IS '幼兒 3-6 歲人數';
COMMENT ON COLUMN public.orders.infant_count IS '嬰兒 0-2 歲人數（不計入 guest_count）';