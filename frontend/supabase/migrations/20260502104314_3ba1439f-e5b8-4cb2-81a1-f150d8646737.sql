ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS discount_codes_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_accommodation_code_key
  ON public.discount_codes (accommodation_id, code);