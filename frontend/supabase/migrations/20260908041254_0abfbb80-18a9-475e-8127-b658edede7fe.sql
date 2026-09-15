CREATE POLICY "Accommodation members can view their accommodation audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);