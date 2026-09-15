-- Remove dangerous public access policies on password_reset_tokens
-- Token verification should only happen via edge function using service role key

DROP POLICY IF EXISTS "Allow public select for token verification" ON password_reset_tokens;
DROP POLICY IF EXISTS "Allow public update for token usage" ON password_reset_tokens;