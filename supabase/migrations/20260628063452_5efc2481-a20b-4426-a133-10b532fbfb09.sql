DROP POLICY IF EXISTS "Authenticated users can insert their own audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    user_email IS NULL
    OR user_email = (auth.jwt() ->> 'email')
  )
);