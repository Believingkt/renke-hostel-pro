DO $$
DECLARE n int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.ai_prompts   WHERE accommodation_id IS NOT NULL)
  + (SELECT count(*) FROM public.ai_knowledge WHERE accommodation_id IS NOT NULL)
  + (SELECT count(*) FROM public.ai_examples  WHERE accommodation_id IS NOT NULL)
  + (SELECT count(*) FROM public.ai_ab_tests  WHERE accommodation_id IS NOT NULL)
  INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: 發現 % 筆館別層 AI 資料，中止收斂', n;
  END IF;
  RAISE NOTICE 'PRECHECK OK: 館別層 0 筆';
END $$;

DROP POLICY IF EXISTS "Accommodation admins manage own prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Staff with ai_training editable update own prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Staff with ai_training editable delete own prompts" ON public.ai_prompts;

DROP POLICY IF EXISTS "Accommodation admins write own knowledge"  ON public.ai_knowledge;
DROP POLICY IF EXISTS "Accommodation admins update own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Accommodation admins delete own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Staff with ai_training editable update own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Staff with ai_training editable delete own knowledge" ON public.ai_knowledge;

DROP POLICY IF EXISTS "Accommodation admins manage own examples" ON public.ai_examples;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own examples" ON public.ai_examples;
DROP POLICY IF EXISTS "Staff with ai_training editable update own examples" ON public.ai_examples;
DROP POLICY IF EXISTS "Staff with ai_training editable delete own examples" ON public.ai_examples;

DROP POLICY IF EXISTS "Accommodation admins manage own ab tests" ON public.ai_ab_tests;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own ab tests" ON public.ai_ab_tests;
DROP POLICY IF EXISTS "Staff with ai_training editable update own ab tests" ON public.ai_ab_tests;

DROP POLICY IF EXISTS "HQ admins manage reply templates" ON public.ai_reply_templates;
CREATE POLICY "HQ super admins manage reply templates"
  ON public.ai_reply_templates FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage insight cards" ON public.ai_insight_cards;
CREATE POLICY "Super admins manage insight cards"
  ON public.ai_insight_cards FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DO $$
DECLARE leftover text;
BEGIN
  SELECT string_agg(tablename||'.'||policyname, ', ')
  INTO leftover
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('ai_prompts','ai_knowledge','ai_examples','ai_ab_tests',
                      'ai_reply_templates','ai_insight_cards')
    AND cmd <> 'SELECT'
    AND (coalesce(qual,'')||coalesce(with_check,'')) ~ '(staff_can_edit_module|hotel_admin|is_admin_or_super)';
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: 仍有寫入政策未收斂 -> %', leftover;
  END IF;
  RAISE NOTICE 'POSTCHECK OK';
END $$;