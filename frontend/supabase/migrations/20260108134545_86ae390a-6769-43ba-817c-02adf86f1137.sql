-- Fix: Remove overly permissive RLS policies on password_reset_tokens table
-- These policies allowed public access to view, insert, and update tokens

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow public insert for password reset" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Allow public select for token verification" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Allow public update for token usage" ON public.password_reset_tokens;

-- Create restrictive policy: Only service role (Edge Functions) can access this table
-- Edge Functions already use service role key and handle all password reset operations
CREATE POLICY "Deny all public access - service role only"
ON public.password_reset_tokens
FOR ALL
USING (false)
WITH CHECK (false);