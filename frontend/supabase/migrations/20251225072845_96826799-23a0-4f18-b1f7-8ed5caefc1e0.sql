-- Add webhook fields to discount_codes table
ALTER TABLE public.discount_codes
ADD COLUMN IF NOT EXISTS webhook_url text,
ADD COLUMN IF NOT EXISTS webhook_secret text,
ADD COLUMN IF NOT EXISTS webhook_enabled boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.discount_codes.webhook_url IS 'URL to send webhook notifications for new orders';
COMMENT ON COLUMN public.discount_codes.webhook_secret IS 'Secret for HMAC signature verification';
COMMENT ON COLUMN public.discount_codes.webhook_enabled IS 'Whether webhook notifications are enabled';