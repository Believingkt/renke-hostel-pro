DROP POLICY IF EXISTS "Admins read owlting logs" ON public.owlting_cm_logs;
DROP POLICY IF EXISTS "Admins read owlting logs" ON public.owlting_message_logs;

CREATE POLICY "Admins read owlting cm logs"
  ON public.owlting_cm_logs FOR SELECT
  USING (
    (accommodation_id IS NULL AND public.user_has_role(auth.uid(), NULL, 'super_admin'::app_role))
    OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Admins read owlting message logs"
  ON public.owlting_message_logs FOR SELECT
  USING (
    (accommodation_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    ))
    OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );