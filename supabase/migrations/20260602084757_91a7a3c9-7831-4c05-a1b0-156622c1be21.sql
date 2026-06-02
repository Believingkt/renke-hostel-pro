ALTER TABLE kol_profiles 
ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days');

UPDATE kol_profiles 
SET public_token = gen_random_uuid(),
    token_expires_at = now() + interval '90 days'
WHERE public_token IS NULL;