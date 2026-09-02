ALTER POLICY "ai_prompts read admin" ON public.ai_prompts USING (public.is_super_admin(auth.uid()));
ALTER POLICY "ai_knowledge read admin" ON public.ai_knowledge USING (public.is_super_admin(auth.uid()));
ALTER POLICY "ai_examples read admin" ON public.ai_examples USING (public.is_super_admin(auth.uid()));
ALTER POLICY "ai_ab_tests read admin" ON public.ai_ab_tests USING (public.is_super_admin(auth.uid()));
ALTER POLICY "ai_conversation_logs read admin" ON public.ai_conversation_logs USING (public.is_super_admin(auth.uid()));

ALTER POLICY "HQ admins manage global prompts" ON public.ai_prompts
  USING ((accommodation_id IS NULL) AND public.is_super_admin(auth.uid()))
  WITH CHECK ((accommodation_id IS NULL) AND public.is_super_admin(auth.uid()));
ALTER POLICY "HQ admins manage global knowledge" ON public.ai_knowledge
  USING ((accommodation_id IS NULL) AND public.is_super_admin(auth.uid()))
  WITH CHECK ((accommodation_id IS NULL) AND public.is_super_admin(auth.uid()));
ALTER POLICY "HQ admins manage global examples" ON public.ai_examples
  USING ((accommodation_id IS NULL) AND public.is_super_admin(auth.uid()))
  WITH CHECK ((accommodation_id IS NULL) AND public.is_super_admin(auth.uid()));