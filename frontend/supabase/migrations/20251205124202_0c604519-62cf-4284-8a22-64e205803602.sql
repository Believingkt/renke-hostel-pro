-- Add API key column to discount_codes table for KOL API authentication
ALTER TABLE public.discount_codes
ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;

-- Create index for faster API key lookup
CREATE INDEX IF NOT EXISTS idx_discount_codes_api_key ON public.discount_codes(api_key);

-- Add a comment explaining the purpose
COMMENT ON COLUMN public.discount_codes.api_key IS 'API key for KOL API authentication. Each discount code can have a unique API key for secure API access.';