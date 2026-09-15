-- ai_ab_tests
DROP POLICY IF EXISTS "Accommodation members manage own ab tests" ON public.ai_ab_tests;
CREATE POLICY "Accommodation members read own ab tests"
ON public.ai_ab_tests FOR SELECT TO authenticated
USING (accommodation_id IS NOT NULL AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id));
CREATE POLICY "Accommodation admins manage own ab tests"
ON public.ai_ab_tests FOR ALL TO authenticated
USING (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)))
WITH CHECK (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)));

-- ai_examples
DROP POLICY IF EXISTS "Accommodation members manage own examples" ON public.ai_examples;
CREATE POLICY "Accommodation members read own examples"
ON public.ai_examples FOR SELECT TO authenticated
USING (accommodation_id IS NOT NULL AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id));
CREATE POLICY "Accommodation admins manage own examples"
ON public.ai_examples FOR ALL TO authenticated
USING (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)))
WITH CHECK (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)));

-- ai_prompts
DROP POLICY IF EXISTS "Accommodation members manage own prompts" ON public.ai_prompts;
CREATE POLICY "Accommodation members read own prompts"
ON public.ai_prompts FOR SELECT TO authenticated
USING (accommodation_id IS NOT NULL AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id));
CREATE POLICY "Accommodation admins manage own prompts"
ON public.ai_prompts FOR ALL TO authenticated
USING (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)))
WITH CHECK (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)));

-- ai_conversation_logs
DROP POLICY IF EXISTS "Accommodation members update own conversation logs" ON public.ai_conversation_logs;
CREATE POLICY "Accommodation admins update own conversation logs"
ON public.ai_conversation_logs FOR UPDATE TO authenticated
USING (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)))
WITH CHECK (accommodation_id IS NOT NULL AND (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)));