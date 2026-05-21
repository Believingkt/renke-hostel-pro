-- Add booking_type column to accommodation_info to distinguish KOL invitation flows
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'discount_code'
  CHECK (booking_type IN ('discount_code', 'short_url'));

COMMENT ON COLUMN public.accommodation_info.booking_type IS
  'KOL/scout booking method: discount_code shows 折扣碼/CID field; short_url shows 短網址 field on KOL invitation form.';