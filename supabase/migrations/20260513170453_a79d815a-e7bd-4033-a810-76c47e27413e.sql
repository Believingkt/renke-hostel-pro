DROP POLICY IF EXISTS "Admins read owlting cm logs" ON public.owlting_cm_logs;

CREATE POLICY "Admins read owlting cm logs"
ON public.owlting_cm_logs
FOR SELECT
TO authenticated
USING (
  (
    accommodation_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'::public.app_role
    )
  )
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
);