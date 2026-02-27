-- Fix: Remove public SELECT policy on password_reset_tokens
-- Token verification happens server-side via edge function with service role key
DROP POLICY IF EXISTS "Allow public select for token verification" ON public.password_reset_tokens;