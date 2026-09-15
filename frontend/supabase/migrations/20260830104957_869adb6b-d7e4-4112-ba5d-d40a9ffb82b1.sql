-- ai_knowledge
CREATE POLICY "Staff with ai_training editable insert own knowledge"
ON public.ai_knowledge FOR INSERT TO authenticated
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable update own knowledge"
ON public.ai_knowledge FOR UPDATE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'))
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable delete own knowledge"
ON public.ai_knowledge FOR DELETE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

-- ai_prompts
CREATE POLICY "Staff with ai_training editable insert own prompts"
ON public.ai_prompts FOR INSERT TO authenticated
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable update own prompts"
ON public.ai_prompts FOR UPDATE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'))
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable delete own prompts"
ON public.ai_prompts FOR DELETE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

-- ai_examples
CREATE POLICY "Staff with ai_training editable insert own examples"
ON public.ai_examples FOR INSERT TO authenticated
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable update own examples"
ON public.ai_examples FOR UPDATE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'))
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable delete own examples"
ON public.ai_examples FOR DELETE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

-- ai_ab_tests (UI supports create + stop; no delete)
CREATE POLICY "Staff with ai_training editable insert own ab tests"
ON public.ai_ab_tests FOR INSERT TO authenticated
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

CREATE POLICY "Staff with ai_training editable update own ab tests"
ON public.ai_ab_tests FOR UPDATE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'))
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));

-- ai_conversation_logs (UI only updates admin_note / user_rating)
CREATE POLICY "Staff with ai_training editable update own conversation logs"
ON public.ai_conversation_logs FOR UPDATE TO authenticated
USING (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'))
WITH CHECK (accommodation_id IS NOT NULL AND public.staff_can_edit_module(accommodation_id, 'ai_training'));