
-- Fix audit_logs insertion vulnerability
-- Tighten the INSERT policy to ensure users can only insert logs for themselves

-- Drop the existing permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Create a stricter INSERT policy that validates user_id matches auth.uid()
-- and user_email matches the authenticated user's email
CREATE POLICY "Authenticated users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  -- user_id must match the authenticated user
  user_id = auth.uid()
  -- user_email must be null or match the authenticated user's email
  AND (
    user_email IS NULL 
    OR user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);
